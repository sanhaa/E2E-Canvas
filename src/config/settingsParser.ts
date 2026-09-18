/**
 * config/설정.md 파서. 비개발자가 고치는 파일이므로 관대하게 읽되,
 * 잘못된 부분은 "N번째 줄: …" 형태로 모아서 돌려준다 (빌드 단계에서 검사).
 */

export interface TaxNode {
  code: string
  name: string
  children?: TaxNode[]
}

export interface Term {
  name: string
  definition: string
}

export interface Settings {
  templateId: string
  title: string
  allowCustom: boolean
  tree: TaxNode[]
  recommendedMin: number
  recommendedMax: number
  presetTools: string[]
  commonDepts: string[]
  diagnosis: { issues: Term[]; actions: Term[] }
}

export interface ParseResult {
  settings: Settings
  errors: string[]
}

type Section = 'basic' | 'tax' | 'rules' | 'tools' | 'depts' | 'diag' | 'unknown'
type DiagSub = 'issues' | 'actions' | null

const SECTION_KEYS: [RegExp, Section][] = [
  [/기본\s*정보/, 'basic'],
  [/프로세스\s*체계/, 'tax'],
  [/작성\s*규칙/, 'rules'],
  [/도구/, 'tools'],
  [/부서/, 'depts'],
  [/진단/, 'diag'],
]

const YES = /^(예|네|yes|y|true|o|허용)$/i
const NO = /^(아니오|아니요|no|n|false|x|불가|미허용)$/i
const PLACEHOLDER = /^\(?\s*정의\s*입력\s*\)?$/

const pad = (n: number) => String(n).padStart(2, '0')

function splitKeyValue(text: string): [string, string] | null {
  const m = text.match(/^([^:：]+)[:：]\s*(.*)$/)
  return m ? [m[1].trim(), m[2].trim()] : null
}

/** "인사 [HR]" → { name: '인사', code: 'HR' } */
function nameAndCode(text: string): { name: string; code?: string } {
  const m = text.match(/^(.*?)\s*\[\s*([^\]]+?)\s*\]\s*$/)
  return m ? { name: m[1].trim(), code: m[2].trim() } : { name: text.trim() }
}

export function parseSettings(md: string): ParseResult {
  const errors: string[] = []
  const s: Settings = {
    templateId: '',
    title: '',
    allowCustom: true,
    tree: [],
    recommendedMin: 8,
    recommendedMax: 20,
    presetTools: [],
    commonDepts: [],
    diagnosis: { issues: [], actions: [] },
  }
  const seen = new Set<Section>()
  let section: Section = 'unknown'
  let diagSub: DiagSub = null

  // 체계 파싱 상태
  const indentStack: number[] = []
  const pathStack: TaxNode[] = []

  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  let inComment = false
  lines.forEach((rawLine, idx) => {
    const ln = idx + 1
    const err = (msg: string) => errors.push(`${ln}번째 줄: ${msg}`)
    const line = rawLine.replace(/\t/g, '    ')

    // HTML 주석 <!-- --> 은 무시
    if (inComment) {
      if (line.includes('-->')) inComment = false
      return
    }
    if (line.trim().startsWith('<!--')) {
      if (!line.includes('-->')) inComment = true
      return
    }
    if (!line.trim() || line.trim().startsWith('>')) return

    const h2 = line.match(/^##\s+(.*)$/)
    if (h2) {
      section = SECTION_KEYS.find(([re]) => re.test(h2[1]))?.[1] ?? 'unknown'
      if (section === 'unknown') err(`알 수 없는 제목 "${h2[1].trim()}" — 이 제목 아래 내용은 무시됩니다.`)
      seen.add(section)
      diagSub = null
      return
    }
    const h3 = line.match(/^###\s+(.*)$/)
    if (h3) {
      if (section === 'diag') diagSub = /문제/.test(h3[1]) ? 'issues' : /개선|ERASK/i.test(h3[1]) ? 'actions' : null
      return
    }
    if (/^#\s/.test(line)) return // 문서 제목

    const item = line.match(/^(\s*)[-*+]\s+(.*?)\s*$/)
    if (!item) {
      if (section !== 'unknown') err(`목록은 "- " 로 시작해야 합니다: "${line.trim()}"`)
      return
    }
    const indent = item[1].length
    const text = item[2]
    if (!text) return

    switch (section) {
      case 'basic': {
        const kv = splitKeyValue(text)
        if (!kv) return err(`"항목: 값" 형식이어야 합니다: "${text}"`)
        const [k, v] = kv
        if (/체계\s*ID/i.test(k)) {
          if (!/^[A-Za-z0-9._-]+$/.test(v)) err('체계 ID는 영문·숫자·-·_·. 만 쓸 수 있습니다.')
          s.templateId = v
        } else if (/체계\s*이름/.test(k)) s.title = v
        else if (/직접\s*입력/.test(k)) {
          if (YES.test(v)) s.allowCustom = true
          else if (NO.test(v)) s.allowCustom = false
          else err('직접 입력 허용은 "예" 또는 "아니오" 로 적어 주세요.')
        } else err(`알 수 없는 항목 "${k}"`)
        return
      }

      case 'rules': {
        const kv = splitKeyValue(text)
        if (!kv) return err(`"항목: 값" 형식이어야 합니다: "${text}"`)
        const [k, v] = kv
        const n = Number(v.replace(/개$/, ''))
        if (!Number.isInteger(n) || n < 1 || n > 200) return err(`"${k}" 는 1–200 사이 숫자여야 합니다.`)
        if (/최소/.test(k)) s.recommendedMin = n
        else if (/최대/.test(k)) s.recommendedMax = n
        else err(`알 수 없는 항목 "${k}"`)
        return
      }

      case 'tools':
        if (!s.presetTools.includes(text)) s.presetTools.push(text)
        return

      case 'depts':
        if (!s.commonDepts.includes(text)) s.commonDepts.push(text)
        return

      case 'diag': {
        if (!diagSub) return
        const kv = splitKeyValue(text)
        const name = kv ? kv[0] : text
        const def = kv && !PLACEHOLDER.test(kv[1]) ? kv[1] : ''
        s.diagnosis[diagSub].push({ name, definition: def })
        return
      }

      case 'tax': {
        // 들여쓰기 스택으로 레벨 판단 (칸 수는 2칸·4칸 모두 허용)
        if (indentStack.length === 0 || indent <= indentStack[0]) {
          indentStack.length = 0
          indentStack.push(indent)
        } else if (indent > indentStack[indentStack.length - 1]) {
          indentStack.push(indent)
        } else {
          while (indentStack.length && indent < indentStack[indentStack.length - 1]) indentStack.pop()
          if (indentStack[indentStack.length - 1] !== indent) return err('들여쓰기가 위 줄들과 맞지 않습니다.')
        }
        const level = indentStack.length
        if (level > 3) return err('L3 보다 깊게 들여쓸 수 없습니다 (L4 는 교육생이 직접 씁니다).')

        const { name, code } = nameAndCode(text)
        if (!name) return err('이름이 비어 있습니다.')
        pathStack.length = level - 1
        const parent = pathStack[level - 2]
        const siblings = level === 1 ? s.tree : (parent!.children ??= [])
        if (siblings.some((n) => n.name === name)) err(`"${name}" 이(가) 같은 단계에 두 번 있습니다.`)
        const autoCode = level === 1 ? pad(siblings.length + 1) : `${parent!.code}.${pad(siblings.length + 1)}`
        const node: TaxNode = { code: code ?? autoCode, name }
        siblings.push(node)
        pathStack.push(node)
        return
      }

      default:
        return
    }
  })

  // 전체 검사
  const need = (sec: Section, title: string) => { if (!seen.has(sec)) errors.push(`"## ${title}" 제목이 없습니다.`) }
  need('basic', '기본 정보')
  need('tax', '프로세스 체계 (L1 › L2 › L3)')
  if (!s.templateId) errors.push('기본 정보에 "체계 ID" 가 없습니다.')
  if (!s.title) s.title = s.templateId
  if (s.tree.length === 0) errors.push('프로세스 체계에 L1 이 하나도 없습니다.')
  const codes = new Set<string>()
  for (const l1 of s.tree) {
    if (!l1.children?.length) errors.push(`L1 "${l1.name}" 아래에 L2 가 없습니다.`)
    for (const l2 of l1.children ?? []) {
      if (!l2.children?.length) errors.push(`L2 "${l1.name} › ${l2.name}" 아래에 L3 가 없습니다.`)
    }
    for (const n of [l1, ...(l1.children ?? []), ...(l1.children ?? []).flatMap((c) => c.children ?? [])]) {
      if (codes.has(n.code)) errors.push(`코드 "${n.code}" 가 중복됩니다 (${n.name}).`)
      codes.add(n.code)
    }
  }
  if (s.recommendedMin > s.recommendedMax) errors.push('권장 활동 수 최소가 최대보다 큽니다.')
  if (s.presetTools.length === 0) errors.push('시스템/도구 기본 목록이 비어 있습니다.')

  return { settings: s, errors }
}

export function summarize(s: Settings): string {
  const l2 = s.tree.flatMap((n) => n.children ?? [])
  const l3 = l2.flatMap((n) => n.children ?? [])
  return `체계 "${s.title}" (${s.templateId}) · L1 ${s.tree.length} / L2 ${l2.length} / L3 ${l3.length} · 직접 입력 ${s.allowCustom ? '허용' : '불가'} · 도구 ${s.presetTools.length} · 부서 ${s.commonDepts.length}`
}
