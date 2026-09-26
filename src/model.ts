import { SETTINGS, TAXONOMY, type TaxNode } from './config/settings'

/**
 * 파일 포맷 v2. v1(R1 초안)에서 활동별 '부서'를 없애고(스윔레인은 담당자 기준으로 바뀜) 'Input'/'Output'을 추가했다.
 * 이 변경 이후로는 R2·R3에서 필드를 "추가"만 하고 기존 필드 의미는 바꾸지 않는다.
 */

export const FORMAT = 'pi-canvas'
export const FORMAT_VERSION = 2
export const APP_VERSION = 'R2'

export type ActivityKind = 'task' | 'decision'

/** 다음 단계 연결. to = 활동 id | 'END' | '?<순번>'(아직 없는 순번을 가리키는 보류 상태) */
export interface NextLink {
  to: string
  label?: string
}

export interface Activity {
  id: string
  kind: ActivityKind
  performer: string
  name: string
  tools: string[]
  input: string
  output: string
  next: NextLink[]
  note: string
}

export interface TaxRef {
  code: string // 직접 입력한 항목이면 ''
  name: string
}

export interface PiDoc {
  format: typeof FORMAT
  version: number
  meta: {
    author: string
    dept: string
    job: string
    createdAt: string
    updatedAt: string
    appVersion: string
  }
  taxonomy: {
    templateId: string
    l1: TaxRef | null
    l2: TaxRef | null
    l3: TaxRef | null
    l4: TaxRef | null // 직접 입력 (code 없음)
  }
  process: {
    name: string // L5 주요 Task
    startEvent: string
    endEvent: string
    customer: string
    owner: string
    frequency: string
    description: string
    activities: Activity[]
    asis: unknown | null // R2
    tobe: unknown | null // R3
  }
}

export const END = 'END'

// 아래 목록·기준값은 config/설정.md 에서 온다
export const PRESET_TOOLS: readonly string[] = SETTINGS.presetTools
export const COMMON_DEPTS: readonly string[] = SETTINGS.commonDepts

export function newId(): string {
  return 'a' + Math.random().toString(36).slice(2, 9)
}

export function emptyActivity(): Activity {
  return { id: newId(), kind: 'task', performer: '', name: '', tools: [], input: '', output: '', next: [], note: '' }
}

export function newDoc(templateId: string): PiDoc {
  const now = new Date().toISOString()
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    meta: { author: '', dept: '', job: '', createdAt: now, updatedAt: now, appVersion: APP_VERSION },
    taxonomy: { templateId, l1: null, l2: null, l3: null, l4: null },
    process: {
      name: '', startEvent: '', endEvent: '', customer: '', owner: '', frequency: '', description: '',
      activities: [emptyActivity(), emptyActivity(), emptyActivity()],
      asis: null,
      tobe: null,
    },
  }
}

export function isBlankActivity(a: Activity): boolean {
  return (
    !a.performer.trim() && !a.name.trim() && a.tools.length === 0 &&
    !a.input.trim() && !a.output.trim() && a.next.length === 0 && !a.note.trim()
  )
}

// ───────────────────────── 다음 단계 텍스트 ↔ 링크 ─────────────────────────

const END_WORDS = new Set(['종료', '끝', 'end', '완료'])

/** "승인→4, 반려→1" / "4" / "반려->종료" 를 링크로. seqToId: 1부터 시작하는 순번 → id */
export function parseNextText(text: string, seqToId: (seq: number) => string | undefined): NextLink[] {
  return text
    .split(/[,，;\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((token) => {
      const m = token.match(/^(.*?)\s*(?:→|->|=>|⇒|>|:)\s*([^\s]+)$/)
      const label = m ? m[1].trim() : ''
      const target = (m ? m[2] : token).trim()
      let to: string
      if (END_WORDS.has(target.toLowerCase())) to = END
      else if (/^\d+$/.test(target)) to = seqToId(Number(target)) ?? `?${Number(target)}`
      else to = `?${target}`
      return label ? { to, label } : { to }
    })
}

export function formatNext(next: NextLink[], idToSeq: Map<string, number>): string {
  return next
    .map((n) => {
      const target = n.to === END ? '종료' : n.to.startsWith('?') ? n.to.slice(1) : String(idToSeq.get(n.to) ?? '?')
      return n.label ? `${n.label}→${target}` : target
    })
    .join(', ')
}

/** L1–L3 참조가 현재 config/설정.md 체계에 실제로 존재하는 항목인지 찾는다. 직접 입력(code === '')은 항상 유효하다. */
export function findTaxNode(list: TaxNode[] | undefined, ref: TaxRef | null): TaxNode | undefined {
  return ref?.code ? list?.find((n) => n.code === ref.code) : undefined
}

export function seqMaps(activities: Activity[]) {
  const idToSeq = new Map<string, number>()
  activities.forEach((a, i) => idToSeq.set(a.id, i + 1))
  const seqToId = (seq: number) => activities[seq - 1]?.id
  return { idToSeq, seqToId }
}

/**
 * 보류 링크('?5')가 가리키는 순번이 이제 존재하면 실제 id로 확정한다.
 * 행을 나중에 추가하는 흐름(“5번은 아직 안 썼지만 먼저 연결”)을 지원하기 위함.
 */
export function resolvePending(activities: Activity[]): Activity[] {
  if (!activities.some((a) => a.next.some((n) => n.to.startsWith('?')))) return activities
  const { seqToId } = seqMaps(activities)
  return activities.map((a) => {
    if (!a.next.some((n) => n.to.startsWith('?'))) return a
    return {
      ...a,
      next: a.next.map((n) => {
        if (!n.to.startsWith('?')) return n
        const raw = n.to.slice(1)
        const id = /^\d+$/.test(raw) ? seqToId(Number(raw)) : undefined
        return id ? { ...n, to: id } : n
      }),
    }
  })
}

// ───────────────────────── 흐름 계산 (미리보기·검증 공용) ─────────────────────────

/** 실제로 쓰일 연결: next 가 비어 있으면 다음 행(마지막 행이면 종료)으로 이어진다. */
export function effectiveNext(activities: Activity[], index: number): NextLink[] {
  const a = activities[index]
  if (a.next.length > 0) return a.next
  const following = activities[index + 1]
  return [{ to: following ? following.id : END }]
}

// ───────────────────────── 검증 ─────────────────────────

export type IssueLevel = 'warn' | 'hint'
export interface Issue {
  level: IssueLevel
  message: string
  /** 포커스 대상: data-field 값. 행이면 rowId 포함 */
  field: string
  rowId?: string
}

export const RECOMMENDED_MIN = SETTINGS.recommendedMin
export const RECOMMENDED_MAX = SETTINGS.recommendedMax

export function activityNameHint(name: string): string | null {
  const n = name.trim()
  if (!n) return null
  if (/(한다|합니다|했다|하였음|했음|함|됨|하기|할 것|해야 함)$/.test(n))
    return '문장형(~함, ~한다) 대신 "명사+동사"로 짧게 써 주세요. 예: 채용 요청서 검토'
  if (!/\s/.test(n) && n.length <= 4) return '무엇을 하는지 대상(명사)도 함께 써 주세요. 예: "검토" → "채용 요청서 검토"'
  return null
}

export function validate(doc: PiDoc): Issue[] {
  const issues: Issue[] = []
  const warn = (message: string, field: string, rowId?: string) => issues.push({ level: 'warn', message, field, rowId })
  const hint = (message: string, field: string, rowId?: string) => issues.push({ level: 'hint', message, field, rowId })

  // L1–L5 는 선택 입력. 다만 파일 저장 이후 config/설정.md 체계가 바뀌었을 수 있다 — 고른 코드가 더 이상 존재하지 않으면 다시 확인해야 한다
  const { l1, l2, l3 } = doc.taxonomy
  const n1 = l1 && findTaxNode(TAXONOMY.tree, l1)
  const n2 = l2 && findTaxNode(n1?.children, l2)
  const n3 = l3 && findTaxNode(n2?.children, l3)
  if ((l1?.code && !n1) || (l2?.code && !n2) || (l3?.code && !n3))
    warn('L1–L3 체계가 변경되었습니다. 선택한 프로세스를 다시 확인하세요.', 'tax.l1')
  const p = doc.process
  if (!p.startEvent.trim()) warn('Process 시작(트리거)을 입력하세요.', 'process.startEvent')
  if (!p.endEvent.trim()) warn('Process 종료(결과)를 입력하세요.', 'process.endEvent')
  if (!p.customer.trim()) warn('고객을 입력하세요.', 'process.customer')

  const rows = p.activities
  const filled = rows.filter((a) => !isBlankActivity(a))
  if (filled.length === 0) warn('L6 활동을 한 개 이상 입력하세요.', 'row.name', rows[0]?.id)
  else if (filled.length < RECOMMENDED_MIN)
    hint(`L6 활동이 ${filled.length}개입니다. 권장 분량은 ${RECOMMENDED_MIN}–${RECOMMENDED_MAX}개입니다 (너무 적으면 L5 범위가 좁은지 확인).`, 'row.name', filled[filled.length - 1].id)
  else if (filled.length > RECOMMENDED_MAX)
    hint(`L6 활동이 ${filled.length}개입니다. ${RECOMMENDED_MAX}개가 넘으면 L5를 둘로 나누는 것을 검토해 보세요.`, 'row.name', filled[filled.length - 1].id)

  const { idToSeq } = seqMaps(rows)
  const validIds = new Set(rows.map((r) => r.id))
  rows.forEach((a) => {
    if (isBlankActivity(a)) return
    const seq = idToSeq.get(a.id)
    const at = `${seq}번:`
    if (!a.name.trim()) warn(`${at} 활동명을 입력하세요.`, 'row.name', a.id)
    const nh = activityNameHint(a.name)
    if (nh) hint(`${at} ${nh}`, 'row.name', a.id)

    for (const n of a.next) {
      if (n.to.startsWith('?')) warn(`${at} 다음 단계 "${n.to.slice(1)}"번이 없습니다.`, 'row.next', a.id)
      else if (n.to === a.id) warn(`${at} 다음 단계가 자기 자신을 가리킵니다.`, 'row.next', a.id)
      else if (n.to !== END && !validIds.has(n.to)) warn(`${at} 다음 단계가 삭제된 행을 가리킵니다.`, 'row.next', a.id)
    }
    if (a.kind === 'decision') {
      if (a.next.length < 2) warn(`${at} 판단 행은 조건별 다음 단계가 2개 이상 필요합니다. 예: 승인→${(seq ?? 0) + 1}, 반려→1`, 'row.next', a.id)
      else if (a.next.some((n) => !n.label)) warn(`${at} 판단 행의 각 다음 단계에 조건을 붙여 주세요. 예: 승인→5`, 'row.next', a.id)
    }
  })
  return issues
}
