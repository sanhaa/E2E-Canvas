import { describe, expect, it } from 'vitest'
import { END, emptyActivity, formatNext, newDoc, parseNextText, resolvePending, seqMaps, validate, type Activity } from './model'
import { extractEvents, guessColumns, parseTSV, parseTools, rowsToActivities } from './pasteImport'
import { deserialize, serialize, suggestFileName, FileFormatError } from './storage'
import { layoutFlow } from './layout'
import { exampleDoc } from './example'

const act = (id: string, over: Partial<Activity> = {}): Activity => ({ ...emptyActivity(), id, performer: '채용담당', name: `${id} 활동 처리`, ...over })

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

  it('삭제된 행을 가리키는 다음 단계는 경고한다', () => {
    const d = exampleDoc()
    d.process.activities[1] = { ...d.process.activities[1], next: [{ to: '유령행' }] }
    expect(validate(d).some((i) => i.rowId === 'ex02' && i.field === 'row.next' && i.level === 'warn')).toBe(true)
  })

  it('체계에 없는 코드를 가리키는 L1–L3 는 경고한다', () => {
    const d = exampleDoc()
    d.taxonomy.l1 = { code: '체계에없는코드', name: d.taxonomy.l1!.name }
    expect(validate(d).some((i) => i.field === 'tax.l1' && i.level === 'warn')).toBe(true)
  })
})

describe('엑셀 붙여넣기', () => {
  it('따옴표로 감싼 셀(셀 내 줄바꿈)을 처리한다', () => {
    expect(parseTSV('a\t"b\nc"\td\r\ne\tf\tg\r\n')).toEqual([['a', 'b\nc', 'd'], ['e', 'f', 'g']])
  })

  it('헤더를 인식해 열을 매핑한다', () => {
    const rows = parseTSV('No\t담당자\t활동명(명사+동사)\t시스템/프로그램\tInput\tOutput\t다음 단계\t비고\n1\t팀장\t요청서 작성\t엑셀, 이메일\t\t요청서\t\t\n2\t채용담당\t승인 여부 판단\tHRIS\t요청서\t\t승인→3, 반려→1\t\n3\t채용담당\t공고 게시\t채용사이트\t\t\t\t')
    const g = guessColumns(rows)
    expect(g.hasHeader).toBe(true)
    expect(g.roles).toEqual(['seq', 'performer', 'name', 'tools', 'input', 'output', 'next', 'note'])
    const acts = rowsToActivities(rows, g)
    expect(acts).toHaveLength(3)
    expect(acts[0].tools).toEqual(['엑셀', '메일'])
    expect(acts[0].output).toBe('요청서')
    expect(acts[1].input).toBe('요청서')
    expect(acts[1].kind).toBe('decision') // 조건 달린 분기 → 판단으로 추정
    expect(acts[1].next).toEqual([{ to: acts[2].id, label: '승인' }, { to: acts[0].id, label: '반려' }])
  })

  it('데이터 행을 헤더로 오인하지 않는다', () => {
    const rows = parseTSV('채용담당\t업무 협의\t엑셀\n팀장\t요청서 작성\t메일')
    const g = guessColumns(rows)
    expect(g.hasHeader).toBe(false)
    expect(g.roles).toEqual(['performer', 'name', 'tools'])
  })

  it('도구 별칭을 표준 이름으로 바꾼다', () => {
    expect(parseTools('Excel / e-mail / 종이·결재, SAP')).toEqual(['엑셀', '메일', '종이/출력', '전자결재', 'SAP'])
  })

  it('Task별 프로세스 정리 양식: 설명 셀 안 화살표 분기와 시작/종료 행을 처리한다', () => {
    const text = [
      'No.\t설명\tBDW\tERASK\t담당자\t시스템/프로그램\tInput\tOutput\tERASK To-be',
      '시작\t장기부재자 안내 메일을 수신한다\t\t\t\t\t\t\t',
      '01\t명단을 확인한다\t\t\t행정사원\tER\t명단\t리스트\t',
      '02\t"이상 유무를 판단한다\n→ 이상 없음(No) : 종료\n→ 이상 있음(Yes) : 03번으로 진행"\t\t\t행정사원\t\t\t\t',
      '03\t결과를 수정한다\t\t\t행정사원\t전용시스템\t\t\t',
      '종료\t완료되면 종료한다\t\t\t\t\t\t\t',
    ].join('\n')
    const rows = parseTSV(text)
    const g = guessColumns(rows)
    expect(g.hasHeader).toBe(true)
    expect(g.roles).toEqual(['seq', 'name', 'ignore', 'ignore', 'performer', 'tools', 'input', 'output', 'ignore'])

    const acts = rowsToActivities(rows, g)
    expect(acts).toHaveLength(3) // 시작·종료 행은 활동이 아니다
    expect(acts[0].name).toBe('명단을 확인한다')
    expect(acts[0].input).toBe('명단')
    expect(acts[0].output).toBe('리스트')
    expect(acts[1].kind).toBe('decision') // 라벨 있는 분기 2개 → 판단으로 추정
    expect(acts[1].next).toEqual([{ to: END, label: '이상 없음(No)' }, { to: acts[2].id, label: '이상 있음(Yes)' }])

    expect(extractEvents(rows, g)).toEqual({
      startEvent: '장기부재자 안내 메일을 수신한다',
      endEvent: '완료되면 종료한다',
    })
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
  it('담당자별 레인과 연결선을 만든다', () => {
    const L = layoutFlow(exampleDoc().process.activities)
    expect(L.lanes.map((l) => l.name)).toEqual(['팀장', '채용담당', '인사 임원'])
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
