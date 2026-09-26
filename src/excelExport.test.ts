import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { exampleDoc } from './example'
import { EXPORT_HEADERS, buildWorkbook, processTableRows } from './excelExport'
import { computeGeometry } from './flow'
import { extractEvents, guessColumns, rowsToActivities } from './pasteImport'
import { END, emptyActivity } from './model'

/** 순서도 모양 비교용: "순번:담당자:이름 → 대상순번들" */
const shape = (acts: ReturnType<typeof rowsToActivities>) => {
  const g = computeGeometry(acts, null)
  const seq = new Map(g.nodes.map((n) => [n.id, n.kind === 'end' ? '종료' : n.kind === 'start' ? '시작' : String(n.seq)]))
  return g.nodes.filter((n) => n.activity).map((n) => {
    const a = n.activity!
    const out = g.edges.filter((e) => e.source === a.id).map((e) => `${e.label ?? ''}>${seq.get(e.target)}`)
    return `${n.seq}:${a.kind}:${a.performer}:${a.name}:${a.tools.join('/')}:${a.input}:${a.output}:${a.note} ${out.join(',')}`
  })
}

describe('엑셀 내보내기', () => {
  it('과제 양식 머리글과 시작/종료 행', () => {
    const doc = exampleDoc()
    const rows = processTableRows(doc)
    expect(rows[0]).toEqual(EXPORT_HEADERS)
    expect(rows[1].slice(0, 2)).toEqual(['시작', doc.process.startEvent])
    expect(rows[rows.length - 1].slice(0, 2)).toEqual(['종료', doc.process.endEvent])
    expect(rows[2][0]).toBe('01')
  })

  it('판단의 분기는 설명 안에 "→ 조건 : NN번으로 진행" 으로 적는다', () => {
    const doc = exampleDoc()
    const rows = processTableRows(doc)
    const dec = rows.find((r) => r[1].startsWith('요청서 보완 필요 여부 판단'))!
    expect(dec[1]).toBe('요청서 보완 필요 여부 판단\n→ 보완 필요 : 05번으로 진행\n→ 이상 없음 : 06번으로 진행')
  })

  it('내보낸 표를 다시 붙여넣으면 같은 순서도', () => {
    const doc = exampleDoc()
    // 조건 없는 건너뛰기, 중간 종료, 빈 행도 섞는다
    const acts = doc.process.activities
    acts[1] = { ...acts[1], next: [{ to: acts[3].id }] }
    acts[8] = { ...acts[8], next: [{ to: END }] }
    acts.splice(4, 0, { ...emptyActivity(), id: 'blank' })
    const rows = processTableRows(doc)
    const guess = guessColumns(rows)
    const back = rowsToActivities(rows, guess)
    // 빈 행은 내보낼 때 빠지고 번호가 당겨진다
    expect(shape(back)).toEqual(shape(acts.filter((a) => a.id !== 'blank')))
    expect(extractEvents(rows, guess)).toEqual({ startEvent: doc.process.startEvent, endEvent: doc.process.endEvent })
  })

  it('xlsx 파일을 만든다', () => {
    const bytes = buildWorkbook(exampleDoc())
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]) // PK
    if (process.env.XLSX_OUT) writeFileSync(process.env.XLSX_OUT, bytes)
  })
})
