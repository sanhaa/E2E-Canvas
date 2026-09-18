import { newId, parseNextText, type Activity } from './model'

/** 엑셀·LLM 결과를 붙여넣을 때 각 열이 어떤 칸인지 */
export type ColumnRole = 'ignore' | 'seq' | 'kind' | 'dept' | 'performer' | 'name' | 'tools' | 'next' | 'note'

export const ROLE_LABELS: Record<ColumnRole, string> = {
  ignore: '(무시)',
  seq: '순번',
  kind: '유형',
  dept: '부서',
  performer: '담당자',
  name: '활동명',
  tools: '시스템/도구',
  next: '다음 단계',
  note: '비고',
}

// 헤더 셀은 짧고 정해진 단어다. 데이터 행("인사팀", "업무 협의")을 헤더로 오인하지 않도록 전체 일치로 본다.
const HEADER_WORDS: [ColumnRole, RegExp][] = [
  ['seq', /^(순번|번호|no\.?|#|seq|순서)$/i],
  ['kind', /^(유형|구분|타입|type|종류|활동\s*유형)$/i],
  ['dept', /^(부서|조직|소속|팀|레인|lane|수행\s*(부서|조직))$/i],
  ['performer', /^(담당자?|역할|수행자|주체|role|담당\s*역할)$/i],
  ['tools', /^(시스템|도구|툴|tools?|수단|매체|사용\s*시스템|시스템\s*[/·,]\s*도구)$/i],
  ['next', /^(다음|다음\s*단계|next|연결|후속(\s*단계)?)$/i],
  ['note', /^(비고|메모|note|이슈|참고|코멘트)$/i],
  ['name', /^(활동|활동명|업무|업무명|activity|task|l5|l5\s*활동|내용|업무\s*내용|프로세스|프로세스명)$/i],
]

/** 엑셀 복사 텍스트(TSV) 파서. 셀 안 줄바꿈·탭이 있으면 엑셀이 큰따옴표로 감싸는 규칙을 처리한다. */
export function parseTSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  let quoted = false
  const s = text.replace(/\r\n?/g, '\n')
  while (i < s.length) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i += 2; continue }
      if (c === '"') { quoted = false; i++; continue }
      cell += c; i++; continue
    }
    if (c === '"' && cell === '') { quoted = true; i++; continue }
    if (c === '\t') { row.push(cell); cell = ''; i++; continue }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue }
    cell += c; i++
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

function roleFromHeader(cell: string): ColumnRole | null {
  const c = cell.replace(/\(.*?\)|\[.*?\]/g, '').trim() // "활동명(명사+동사)" → "활동명"
  if (!c) return null
  for (const [role, re] of HEADER_WORDS) if (re.test(c)) return role
  return null
}

export interface PasteGuess {
  hasHeader: boolean
  roles: ColumnRole[]
}

export function guessColumns(rows: string[][]): PasteGuess {
  const width = Math.max(0, ...rows.map((r) => r.length))
  const first = rows[0] ?? []
  const headerRoles = first.map(roleFromHeader)
  const matched = headerRoles.filter(Boolean).length
  if (matched >= 2 || (width === 1 && matched === 1 && rows.length > 1)) {
    const used = new Set<ColumnRole>()
    const roles = Array.from({ length: width }, (_, i) => {
      const r = headerRoles[i]
      if (!r || used.has(r)) return 'ignore' as ColumnRole
      used.add(r)
      return r
    })
    return { hasHeader: true, roles }
  }
  const defaults: Record<number, ColumnRole[]> = {
    1: ['name'],
    2: ['dept', 'name'],
    3: ['dept', 'name', 'tools'],
    4: ['dept', 'performer', 'name', 'tools'],
    5: ['dept', 'performer', 'name', 'tools', 'note'],
    6: ['dept', 'performer', 'name', 'tools', 'next', 'note'],
    7: ['kind', 'dept', 'performer', 'name', 'tools', 'next', 'note'],
    8: ['seq', 'kind', 'dept', 'performer', 'name', 'tools', 'next', 'note'],
  }
  const roles = defaults[width] ?? [...(defaults[8] as ColumnRole[]), ...Array(Math.max(0, width - 8)).fill('ignore')]
  return { hasHeader: false, roles: roles.slice(0, width) }
}

const TOOL_ALIASES: [RegExp, string][] = [
  [/^(e-?mail|이메일|메일|outlook|아웃룩)$/i, '메일'],
  [/^(excel|엑셀|xlsx?|스프레드시트)$/i, '엑셀'],
  [/^(전화|유선|phone|call)$/i, '전화'],
  [/^(메신저|팀즈|teams|slack|슬랙|카톡|카카오톡)$/i, '메신저'],
  [/^(대면|회의|미팅|면담|구두)$/i, '대면'],
  [/^(종이|출력|문서출력|서면|인쇄|종이\/출력)$/i, '종이/출력'],
  [/^(결재|전자결재|품의)$/i, '전자결재'],
  [/^(hris|인사시스템|인사 시스템)$/i, 'HRIS'],
]

export function normalizeTool(t: string): string {
  const s = t.trim()
  for (const [re, name] of TOOL_ALIASES) if (re.test(s)) return name
  return s
}

export function parseTools(text: string): string[] {
  const out: string[] = []
  for (const part of text.split(/[,，/·;\n+]| 및 /)) {
    const t = normalizeTool(part)
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

function parseKind(text: string): Activity['kind'] {
  return /(판단|분기|결정|decision|gateway|◇|조건)/i.test(text) ? 'decision' : 'task'
}

/**
 * 표 → 활동 목록. "다음 단계"의 순번은 붙여넣은 표 기준(순번 열이 있으면 그 값, 없으면 1부터)으로 해석한다.
 */
export function rowsToActivities(rows: string[][], guess: PasteGuess): Activity[] {
  const body = guess.hasHeader ? rows.slice(1) : rows
  const col = (r: string[], role: ColumnRole) => {
    const i = guess.roles.indexOf(role)
    return i >= 0 ? (r[i] ?? '').trim() : ''
  }
  const acts: Activity[] = body.map((r) => ({
    id: newId(),
    kind: parseKind(col(r, 'kind')),
    dept: col(r, 'dept'),
    performer: col(r, 'performer'),
    name: col(r, 'name'),
    tools: parseTools(col(r, 'tools')),
    next: [],
    note: col(r, 'note'),
  }))
  const seqIndex = new Map<number, string>()
  body.forEach((r, i) => {
    const s = Number(col(r, 'seq'))
    seqIndex.set(Number.isFinite(s) && s > 0 && guess.roles.includes('seq') ? s : i + 1, acts[i].id)
  })
  body.forEach((r, i) => {
    const nt = col(r, 'next')
    if (nt) acts[i].next = parseNextText(nt, (seq) => seqIndex.get(seq))
    // 조건이 달린 다음 단계가 여러 개면 유형 열이 없어도 판단으로 본다
    if (acts[i].next.length >= 2 && acts[i].next.every((n) => n.label)) acts[i].kind = 'decision'
  })
  return acts
}
