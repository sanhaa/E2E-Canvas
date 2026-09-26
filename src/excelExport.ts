import { END, isBlankActivity, type PiDoc } from './model'
import { buildXlsx, type Cell, type CellStyle } from './xlsx'

/**
 * 엑셀 내보내기 — 교육 과제 양식("Task별 프로세스 정리", 예: EXP14.xlsx)과 같은 모양으로 만든다.
 * - 순서도 편집 결과(행 순서·담당자·연결)가 그대로 반영된다.
 * - 다음 단계는 양식처럼 설명 칸 안에 "→ 조건 : NN번으로 진행" 줄로 적는다. 비어 있으면 다음 번호로 이어진다.
 * - BDW · ERASK · ERASK To-be 칸은 비워 두고 교육생이 엑셀에서 적는다.
 * - 이 표를 그대로 복사해 툴에 다시 붙여넣으면 같은 순서도가 나온다 (pasteImport.ts 가 이 양식을 읽는다).
 */

export const EXPORT_HEADERS = ['No.', '설명', 'BDW', 'ERASK', '담당자', '시스템/프로그램', 'Input', 'Output', 'ERASK To-be', '비고']
const WIDTHS = [7, 64, 8.5, 8.5, 16, 18, 26, 26, 34, 30]
const BDW = ['B', 'D', 'W']
const ERASK = ['E', 'R', 'A', 'S', 'K']

const pad = (n: number) => String(n).padStart(2, '0')

/** 양식의 표 부분(머리글 · 시작 · 활동 · 종료)을 문자열 표로 */
export function processTableRows(doc: PiDoc): string[][] {
  const filled = doc.process.activities.filter((a) => !isBlankActivity(a))
  const seq = new Map(filled.map((a, i) => [a.id, i + 1]))
  const blank = (no: string, text: string) => [no, text, '', '', '', '', '', '', '', '']
  const rows: string[][] = [EXPORT_HEADERS, blank('시작', doc.process.startEvent)]
  filled.forEach((a, i) => {
    const lines = [a.name]
    for (const n of a.next) {
      const target =
        n.to === END ? '종료'
        : n.to.startsWith('?') ? `${n.to.slice(1)}번으로 진행`
        : seq.has(n.to) ? `${pad(seq.get(n.to)!)}번으로 진행`
        : '(삭제된 행)'
      lines.push(n.label ? `→ ${n.label} : ${target}` : `→ ${target}`)
    }
    rows.push([pad(i + 1), lines.join('\n'), '', '', a.performer, a.tools.join(', '), a.input, a.output, '', a.note])
  })
  rows.push(blank('종료', doc.process.endEvent))
  return rows
}

const border: CellStyle = { border: true, v: 'center' }
const S = {
  head: { ...border, bold: true, color: 'FFFFFF', fill: '2F5BD3', h: 'center', wrap: true } as CellStyle,
  label: { ...border, bold: true, fill: 'E9EFFD', h: 'center' } as CellStyle,
  event: { ...border, bold: true, fill: 'D9D9D9', h: 'center' } as CellStyle,
  eventText: { ...border, fill: 'D9D9D9', wrap: true } as CellStyle,
  no: { ...border, h: 'center' } as CellStyle,
  text: { ...border, wrap: true, h: 'left' } as CellStyle,
  mid: { ...border, wrap: true, h: 'center' } as CellStyle,
  todo: { ...border, fill: 'FFF2CC', wrap: true, h: 'center' } as CellStyle,
  title: { bold: true, size: 13 } as CellStyle,
  note: { color: '6B7280', size: 10 } as CellStyle,
}

export function buildWorkbook(doc: PiDoc): Uint8Array {
  const p = doc.process
  const table = processTableRows(doc)
  const TOP = 3 // 머리글 위의 행 수 (Code/Task 2줄 + 빈 줄)
  const first = TOP + 3 // 첫 활동 행 (머리글, 시작 다음)
  const last = TOP + table.length - 1 // 마지막 활동 행 (종료 앞)

  // 열별 모양: No. · 설명 · [BDW · ERASK] · 담당자 · 시스템 · Input · Output · [To-be] · 비고 — [ ]는 교육생이 적는 노란 칸
  const colStyle = [S.no, S.text, S.todo, S.todo, S.mid, S.mid, S.text, S.text, S.todo, S.text]
  const body: Cell[][] = table.map((r, i) => {
    if (i === 0) return r.map((v) => ({ v, s: S.head }))
    if (i === 1 || i === table.length - 1) return r.map((v, c) => ({ v, s: c === 0 ? S.event : S.eventText }))
    return r.map((v, c) => ({ v, s: colStyle[c] }))
  })

  const heights: Record<number, number> = {}
  table.forEach((r, i) => {
    if (i === 0) return
    const lines = Math.max(...r.map((v, c) => (v ? v.split('\n').length + Math.floor(v.length / (c === 1 ? 44 : 16)) : 1)))
    heights[TOP + 1 + i] = Math.min(160, Math.max(33, lines * 16 + 4))
  })

  const code = doc.taxonomy.l3?.code ?? ''
  const main = {
    name: p.name || 'AS-IS',
    cols: WIDTHS,
    rows: [
      [{ v: 'Code', s: S.head }, { v: 'Task', s: S.head }],
      [{ v: code, s: S.label }, { v: p.name, s: { ...border, bold: true } }],
      [],
      ...body,
    ] as Cell[][],
    heights,
    freeze: `B${TOP + 2}`,
    lists: last >= first
      ? [
          { sqref: `C${first}:C${last}`, items: BDW },
          { sqref: `D${first}:D${last}`, items: ERASK },
          { sqref: `I${first}:I${last}`, items: ERASK },
        ]
      : [],
  }

  const info: [string, string][] = [
    ['이름', doc.meta.author],
    ['소속', doc.meta.dept],
    ['직무', doc.meta.job],
    ['L1', doc.taxonomy.l1?.name ?? ''],
    ['L2', doc.taxonomy.l2?.name ?? ''],
    ['L3', [doc.taxonomy.l3?.code, doc.taxonomy.l3?.name].filter(Boolean).join(' ')],
    ['L4', doc.taxonomy.l4?.name ?? ''],
    ['L5 주요 Task', p.name],
    ['Process 시작 (트리거)', p.startEvent],
    ['Process 종료 (결과)', p.endEvent],
    ['고객', p.customer],
    ['프로세스 오너', p.owner],
    ['발생 빈도', p.frequency],
    ['설명', p.description],
  ]
  const infoSheet = {
    name: '과제 정보',
    cols: [20, 70],
    rows: [
      [{ v: '과제 정보', s: S.title }],
      [{ v: `PI 프로세스 캔버스에서 내보냄 · ${new Date().toLocaleString('ko-KR')}`, s: S.note }],
      [],
      ...info.map(([k, v]) => [{ v: k, s: S.label }, { v, s: S.text }]),
      [],
      [{ v: '다시 불러오기', s: { bold: true } }],
      [{ v: `'${main.name}' 시트의 No. 머리글 행부터 종료 행까지 복사해 툴의 활동 표에 붙여넣으면 같은 순서도가 만들어집니다.`, s: S.note }],
    ] as Cell[][],
  }
  return buildXlsx([main, infoSheet])
}
