import { describe, expect, it } from 'vitest'
import { END, emptyActivity, formatNext, newDoc, parseNextText, resolvePending, seqMaps, validate, type Activity } from './model'
import { guessColumns, parseTSV, parseTools, rowsToActivities } from './pasteImport'
import { deserialize, serialize, suggestFileName, FileFormatError } from './storage'
import { layoutFlow } from './layout'
import { exampleDoc } from './example'

const act = (id: string, over: Partial<Activity> = {}): Activity => ({ ...emptyActivity(), id, dept: '인사팀', name: `${id} 활동 처리`, ...over })

describe('다음 단계 파싱', () => {
  const rows = [act('a'), act('b'), act('c')]
  const { seqToId, idToSeq } = seqMaps(rows)

  it('순번, 조건, 종료를 해석한다', () => {
    expect(parseNextText('승인→3, 반려→1', seqToId)).toEqual([{ to: 'c', label: '승인' }, { to: 'a', label: '반려' }])
    expect(parseNextText('2', seqToId)).toEqual([{ to: 'b' }])
    expect(parseNextText('반려->종료', seqToId)).toEqual([{ to: END, label: '반려' }])
    expect(parseNextText('보완 필요 > 1', seqToId)).toEqual([{ to: 'a', label: '보완 필요' }])
  })

  it('없는 순번은 보류 링크로 남기고, 행이 생기면 확정한다', () => {
    const links = parseNextText('승인→5', seqToId)
    expect(links).toEqual([{ to: '?5', label: '승인' }])
    const withMore = [...rows, act('d'), act('e')]
    withMore[0] = { ...withMore[0], next: links }
    expect(resolvePending(withMore)[0].next).toEqual([{ to: 'e', label: '승인' }])
  })

  it('링크는 id 기반이라 행 순서가 바뀌어도 대상이 유지된다', () => {
    const next = [{ to: 'c', label: '승인' }]
    expect(formatNext(next, idToSeq)).toBe('승인→3')
    const reordered = [rows[2], rows[0], rows[1]]
    expect(formatNext(next, seqMaps(reordered).idToSeq)).toBe('승인→1')
  })
})

describe('검증', () => {
  it('빈 문서는 필수 항목 경고를 낸다', () => {
    const msgs = validate(newDoc('t')).filter((i) => i.level === 'warn').map((i) => i.field)
    expect(msgs).toEqual(expect.arrayContaining(['meta.author', 'meta.dept', 'tax.l1', 'process.name', 'process.startEvent', 'process.endEvent', 'process.customer']))
  })

  it('예시 문서는 경고가 없다', () => {
    expect(validate(exampleDoc()).filter((i) => i.level === 'warn')).toEqual([])
  })

  it('판단 행은 조건 있는 다음 단계 2개 이상이 필요하다', () => {
    const d = exampleDoc()
    d.process.activities[3] = { ...d.process.activities[3], next: [{ to: 'ex05' }] }
    expect(validate(d).some((i) => i.rowId === 'ex04' && i.field === 'row.next' && i.level === 'warn')).toBe(true)
  })

  it('활동명 작성 팁', () => {
    const d = exampleDoc()
    d.process.activities[0] = { ...d.process.activities[0], name: '검토' }
    d.process.activities[1] = { ...d.process.activities[1], name: '요청서를 확인함' }
    const hints = validate(d).filter((i) => i.level === 'hint' && i.field === 'row.name').map((i) => i.rowId)
    expect(hints).toEqual(expect.arrayContaining(['ex01', 'ex02']))
  })
})

describe('엑셀 붙여넣기', () => {
  it('따옴표로 감싼 셀(셀 내 줄바꿈)을 처리한다', () => {
    expect(parseTSV('a\t"b\nc"\td\r\ne\tf\tg\r\n')).toEqual([['a', 'b\nc', 'd'], ['e', 'f', 'g']])
  })

  it('헤더를 인식해 열을 매핑한다', () => {
    const rows = parseTSV('No\t부서\t담당자\t활동명(명사+동사)\t시스템\t다음 단계\t비고\n1\t현업\t팀장\t요청서 작성\t엑셀, 이메일\t\t\n2\t인사팀\t채용담당\t승인 여부 판단\tHRIS\t승인→3, 반려→1\t\n3\t인사팀\t채용담당\t공고 게시\t채용사이트\t\t')
    const g = guessColumns(rows)
    expect(g.hasHeader).toBe(true)
    expect(g.roles).toEqual(['seq', 'dept', 'performer', 'name', 'tools', 'next', 'note'])
    const acts = rowsToActivities(rows, g)
    expect(acts).toHaveLength(3)
    expect(acts[0].tools).toEqual(['엑셀', '메일'])
    expect(acts[1].kind).toBe('decision') // 조건 달린 분기 → 판단으로 추정
    expect(acts[1].next).toEqual([{ to: acts[2].id, label: '승인' }, { to: acts[0].id, label: '반려' }])
  })

  it('데이터 행을 헤더로 오인하지 않는다', () => {
    const rows = parseTSV('인사팀\t채용담당\t업무 협의\n현업\t팀장\t요청서 작성')
    const g = guessColumns(rows)
    expect(g.hasHeader).toBe(false)
    expect(g.roles).toEqual(['dept', 'name', 'tools'])
  })

  it('도구 별칭을 표준 이름으로 바꾼다', () => {
    expect(parseTools('Excel / e-mail / 종이·결재, SAP')).toEqual(['엑셀', '메일', '종이/출력', '전자결재', 'SAP'])
  })
})

describe('파일 저장/열기', () => {
  it('왕복해도 내용이 같고 빈 행은 제거된다', () => {
    const d = exampleDoc()
    d.process.activities.push(emptyActivity())
    const back = deserialize(serialize(d))
    expect(back.process.activities).toHaveLength(12)
    expect(back.process.activities).toEqual(exampleDoc().process.activities)
    expect(back.taxonomy).toEqual(d.taxonomy)
  })

  it('다른 형식·미래 버전 파일은 거부한다', () => {
    expect(() => deserialize('{"a":1}')).toThrow(FileFormatError)
    expect(() => deserialize('not json')).toThrow(FileFormatError)
    expect(() => deserialize(JSON.stringify({ format: 'pi-canvas', version: 99 }))).toThrow(/새로운 버전/)
  })

  it('손상된 필드는 기본값으로 채운다', () => {
    const d = deserialize(JSON.stringify({ format: 'pi-canvas', version: 1, process: { activities: [{ name: 'x', tools: 'bad' }] } }))
    expect(d.process.activities[0]).toMatchObject({ name: 'x', tools: [], next: [], kind: 'task' })
  })

  it('파일명에서 금지 문자를 없앤다', () => {
    const d = exampleDoc()
    d.process.name = '채용 요청/승인: 1차'
    d.meta.author = '홍 길동'
    expect(suggestFileName(d)).toBe('채용_요청_승인_1차_홍_길동.json')
  })
})

describe('미리보기 레이아웃', () => {
  it('부서별 레인과 연결선을 만든다', () => {
    const L = layoutFlow(exampleDoc().process.activities)
    expect(L.lanes.map((l) => l.name)).toEqual(['현업 부서', '인사팀', '경영진'])
    expect(L.nodes.filter((n) => n.kind === 'decision')).toHaveLength(2)
    // 시작→1 + 활동 12개의 연결(판단 2개는 각 2개): 1 + 10 + 4 = 15
    expect(L.edges).toHaveLength(15)
    expect(L.edges.every((e) => !e.path.includes('NaN'))).toBe(true)
  })

  it('빈 목록도 그린다', () => {
    const L = layoutFlow([emptyActivity()])
    expect(L.nodes.map((n) => n.kind)).toEqual(['start', 'end'])
    expect(L.edges).toHaveLength(1)
  })
})
