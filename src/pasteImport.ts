import { newId, parseNextText, type Activity } from './model'

/** 엑셀·LLM 결과를 붙여넣을 때 각 열이 어떤 칸인지 */
export type ColumnRole = 'ignore' | 'seq' | 'kind' | 'performer' | 'name' | 'tools' | 'input' | 'output' | 'next' | 'note'

export const ROLE_LABELS: Record<ColumnRole, string> = {
  ignore: '(무시)',
  seq: '순번',
  kind: '유형',
  performer: '담당자',
  name: '활동명',
  tools: '시스템/프로그램',
  input: 'Input',
  output: 'Output',
  next: '다음 단계',
  note: '비고',
}

// 헤더 셀은 짧고 정해진 단어다. 데이터 행("행정사원", "업무 협의")을 헤더로 오인하지 않도록 전체 일치로 본다.
const HEADER_WORDS: [ColumnRole, RegExp][] = [
  ['seq', /^(순번|번호|no\.?|#|seq|순서)$/i],
  ['kind', /^(유형|구분|타입|type|종류|활동\s*유형)$/i],
  ['performer', /^(담당자?|역할|수행자|주체|role|담당\s*역할)$/i],
  ['tools', /^(시스템|도구|툴|프로그램|tools?|수단|매체|사용\s*시스템|시스템\s*[/·,]\s*(도구|프로그램))$/i],
  ['input', /^(input|입력)$/i],
  ['output', /^(output|출력|산출물?)$/i],
  ['next', /^(다음|다음\s*단계|next|연결|후속(\s*단계)?)$/i],
  ['note', /^(비고|메모|note|이슈|참고|코멘트)$/i],
  ['name', /^(활동|활동명|업무|업무명|activity|task|l5|l5\s*활동|내용|업무\s*내용|프로세스|프로세스명|설명|description)$/i],
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
      if (!r) return 'ignore' as ColumnRole
      // 비고(note)는 Input/Output처럼 여러 열에서 와도 모두 합쳐 받는다. 다른 역할은 열 하나에만.
      if (r !== 'note' && used.has(r)) return 'ignore' as ColumnRole
      used.add(r)
      return r
    })
    return { hasHeader: true, roles }
  }
  const defaults: Record<number, ColumnRole[]> = {
    1: ['name'],
    2: ['performer', 'name'],
    3: ['performer', 'name', 'tools'],
    4: ['performer', 'name', 'tools', 'next'],
    5: ['performer', 'name', 'tools', 'next', 'note'],
    6: ['kind', 'performer', 'name', 'tools', 'next', 'note'],
    7: ['seq', 'kind', 'performer', 'name', 'tools', 'next', 'note'],
    8: ['seq', 'kind', 'performer', 'name', 'tools', 'input', 'next', 'note'],
    9: ['seq', 'kind', 'performer', 'name', 'tools', 'input', 'output', 'next', 'note'],
  }
  const roles = defaults[width] ?? [...(defaults[9] as ColumnRole[]), ...Array(Math.max(0, width - 9)).fill('ignore')]
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

function makeCol(guess: PasteGuess) {
  return (r: string[], role: ColumnRole) => {
    const i = guess.roles.indexOf(role)
    return i >= 0 ? (r[i] ?? '').trim() : ''
  }
}

function bodyOf(rows: string[][], guess: PasteGuess): string[][] {
  return guess.hasHeader ? rows.slice(1) : rows
}

// "Task별 프로세스 정리 양식"처럼 순번 칸에 '시작'/'종료'라고 적힌 행 — L5 활동이 아니라 E2E 시작/종료 문구다.
const START_ROW = /^(시작|start)$/i
const END_ROW = /^(종료|끝|end)$/i
const isEventRow = (seqCell: string) => START_ROW.test(seqCell) || END_ROW.test(seqCell)

/**
 * "다음 단계" 열이 따로 없고, 설명 셀 안에 줄바꿈으로 "→ 조건 : 목적지"가 섞여 있는 양식을 지원한다.
 * 목적지는 "07번으로 진행"처럼 풀어 쓴 경우가 많아 번호·종료만 뽑아 model.ts의 parseNextText 문법(라벨→번호)으로 바꾼다.
 */
function splitDescription(text: string): { name: string; nextText: string } {
  const nameLines: string[] = []
  const tokens: string[] = []
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim()
    if (!line) continue
    // 조건 없이 "→ 05번으로 진행" 처럼 목적지만 적은 줄도 받는다 (툴의 엑셀 내보내기가 이렇게 쓴다)
    const m = line.match(/^→\s*(?:(.+?)\s*[:：]\s*)?(.+)$/)
    if (!m) { nameLines.push(line); continue }
    const label = (m[1] ?? '').trim()
    const dest = m[2].trim()
    const num = dest.match(/(\d+)\s*번/)
    const target = num ? num[1] : END_ROW.test(dest) || /종료|끝/.test(dest) ? '종료' : dest.replace(/\s+/g, '')
    tokens.push(label ? `${label}→${target}` : target)
  }
  return { name: nameLines.join(' '), nextText: tokens.join(', ') }
}

/** '시작'/'종료' 행이 있으면 그 설명 문구를 E2E 시작(트리거)·종료(결과)로 뽑아낸다. */
export function extractEvents(rows: string[][], guess: PasteGuess): { startEvent: string; endEvent: string } {
  if (!guess.roles.includes('seq')) return { startEvent: '', endEvent: '' }
  const col = makeCol(guess)
  let startEvent = ''
  let endEvent = ''
  for (const r of bodyOf(rows, guess)) {
    const seq = col(r, 'seq')
    const text = splitDescription(col(r, 'name')).name
    if (!startEvent && text && START_ROW.test(seq)) startEvent = text
    if (!endEvent && text && END_ROW.test(seq)) endEvent = text
  }
  return { startEvent, endEvent }
}

/**
 * 표 → 활동 목록. "다음 단계"의 순번은 붙여넣은 표 기준(순번 열이 있으면 그 값, 없으면 1부터)으로 해석한다.
 * 순번 칸이 '시작'/'종료'인 행은 활동이 아니라 E2E 시작·종료 문구이므로 여기서는 제외한다 (extractEvents 참고).
 */
export function rowsToActivities(rows: string[][], guess: PasteGuess): Activity[] {
  const col = makeCol(guess)
  const colAll = (r: string[], role: ColumnRole) =>
    guess.roles.map((rr, i) => (rr === role ? (r[i] ?? '').trim() : '')).filter(Boolean)
  const all = bodyOf(rows, guess)
  const body = guess.roles.includes('seq') ? all.filter((r) => !isEventRow(col(r, 'seq'))) : all

  const parsed = body.map((r) => splitDescription(col(r, 'name')))
  const acts: Activity[] = body.map((r, i) => ({
    id: newId(),
    kind: parseKind(col(r, 'kind')),
    performer: col(r, 'performer'),
    name: parsed[i].name,
    tools: parseTools(col(r, 'tools')),
    input: col(r, 'input'),
    output: col(r, 'output'),
    next: [],
    note: colAll(r, 'note').join(' / '),
  }))
  const seqIndex = new Map<number, string>()
  body.forEach((r, i) => {
    const s = Number(col(r, 'seq'))
    seqIndex.set(Number.isFinite(s) && s > 0 && guess.roles.includes('seq') ? s : i + 1, acts[i].id)
  })
  body.forEach((r, i) => {
    const nt = col(r, 'next') || parsed[i].nextText
    if (nt) acts[i].next = parseNextText(nt, (seq) => seqIndex.get(seq))
    // 조건이 달린 다음 단계가 여러 개면 유형 열이 없어도 판단으로 본다
    if (acts[i].next.length >= 2 && acts[i].next.every((n) => n.label)) acts[i].kind = 'decision'
  })
  return acts
}
