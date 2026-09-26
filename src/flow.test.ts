import { describe, expect, it } from 'vitest'
import { END, emptyActivity, type Activity } from './model'
import {
  END_ID, LANE_H, START_ID, addLink, compact, computeGeometry, deleteActivity, freezeLayout, insertActivity, insertAfter,
  makeFirst, materialize, moveNode, readLayout, removeLink, renameLane, retargetLink, sortByPosition, writeLayout,
} from './flow'

const act = (id: string, over: Partial<Activity> = {}): Activity => ({ ...emptyActivity(), id, performer: '채용담당', name: `${id} 처리`, ...over })
/** 활동별 실제 연결 대상 (암묵 연결 포함) */
const flow = (acts: Activity[]) => {
  const g = computeGeometry(acts, null)
  return Object.fromEntries(
    acts.filter((a) => g.nodes.some((n) => n.id === a.id)).map((a) => [a.id, g.edges.filter((e) => e.source === a.id).map((e) => e.target)]),
  )
}

describe('순서도 계산', () => {
  it('비운 다음 단계는 다음 행, 마지막은 종료로 잇고 빈 행은 건너뛴다', () => {
    const acts = [act('a'), { ...emptyActivity(), id: 'blank' }, act('b')]
    const g = computeGeometry(acts, null)
    expect(g.edges.map((e) => `${e.source}>${e.target}`)).toEqual([`${START_ID}>a`, 'a>b', `b>${END_ID}`])
    expect(g.nodes.some((n) => n.id === 'blank')).toBe(false)
  })

  it('레인 = 담당자, 저장된 레인 순서를 따른다', () => {
    const acts = [act('a', { performer: '팀장' }), act('b', { performer: '채용담당' })]
    expect(computeGeometry(acts, null).lanes).toEqual(['팀장', '채용담당'])
    const g = computeGeometry(acts, { lanes: ['채용담당', '빈 레인'], pos: {} })
    expect(g.lanes).toEqual(['채용담당', '빈 레인', '팀장'])
    expect(g.nodes.find((n) => n.id === 'a')!.lane).toBe(2)
  })

  it('고정 배치를 저장했다 읽어도 같은 위치', () => {
    const acts = [act('a'), act('b', { performer: '팀장' })]
    const frozen = freezeLayout(computeGeometry(acts, null))
    const again = computeGeometry(acts, readLayout(writeLayout(null, frozen)))
    expect(again.nodes.map((n) => [n.id, n.x, n.y])).toEqual(computeGeometry(acts, null).nodes.map((n) => [n.id, n.x, n.y]))
  })
})

describe('연결 편집', () => {
  const base = () => [act('a'), act('b'), act('c')]

  it('materialize → compact 는 원래대로', () => {
    const acts = base()
    expect(compact(materialize(acts))).toEqual(acts)
  })

  it('활동에서 연결을 새로 그으면 기존 단일 연결을 대신한다', () => {
    const out = addLink(base(), 'a', 'c')
    expect(flow(out).a).toEqual(['c'])
    expect(out[0].next).toEqual([{ to: 'c' }])
    expect(flow(addLink(base(), 'c', 'a')).c).toEqual(['a'])
  })

  it('판단에서 연결을 그으면 분기가 늘어난다 (암묵 연결도 유지)', () => {
    const acts = [act('a', { kind: 'decision' }), act('b'), act('c')]
    const out = addLink(acts, 'a', 'c')
    expect(flow(out).a).toEqual(['b', 'c'])
    expect(out[0].next).toEqual([{ to: 'b' }, { to: 'c' }])
  })

  it('이미 여러 갈래인 활동은 연결이 추가된다', () => {
    const acts = [act('a', { next: [{ to: 'b' }, { to: 'c' }] }), act('b'), act('c')]
    expect(flow(addLink(acts, 'a', END_ID)).a).toEqual(['b', 'c', END_ID])
  })

  it('연결을 모두 지우면 종료로 잇는다', () => {
    const r = removeLink(base(), 'a', 0)
    expect(r.toEnd).toBe(true)
    expect(flow(r.acts).a).toEqual([END_ID])
  })

  it('연결 대상 바꾸기, 되돌아온 결과가 다음 행이면 칸을 비운다', () => {
    const out = retargetLink(base(), 'a', 0, 'c')
    expect(out[0].next).toEqual([{ to: 'c' }])
    expect(retargetLink(out, 'a', 0, 'b')[0].next).toEqual([])
  })

  it('중간에 행을 끼워 넣어도 기존 연결은 그대로', () => {
    const out = insertActivity(base(), act('x', { next: [{ to: END }] }), 'a')
    expect(out.map((a) => a.id)).toEqual(['a', 'x', 'b', 'c'])
    expect(flow(out)).toEqual({ a: ['b'], x: [END_ID], b: ['c'], c: [END_ID] })
  })

  it('뒤에 추가: A→B 가 A→새→B', () => {
    const out = insertAfter(base(), 'a', act('x'))
    expect(flow(out)).toEqual({ a: ['x'], x: ['b'], b: ['c'], c: [END_ID] })
    expect(out.every((a) => a.next.length === 0)).toBe(true)
  })

  it('판단 뒤에 추가하면 분기가 하나 늘어난다', () => {
    const acts = [act('a', { kind: 'decision', next: [{ to: 'b', label: '승인' }, { to: END, label: '반려' }] }), act('b')]
    const out = insertAfter(acts, 'a', act('x'))
    expect(flow(out).a).toEqual(['b', END_ID, 'x'])
    expect(flow(out).x).toEqual([END_ID])
  })

  it('삭제하면 앞뒤를 잇는다 (A→B→C 에서 B 삭제 → A→C)', () => {
    const out = deleteActivity(base(), 'b')
    expect(flow(out)).toEqual({ a: ['c'], c: [END_ID] })
    const branch = [act('a', { next: [{ to: 'c' }] }), act('b', { kind: 'decision', next: [{ to: 'a', label: 'x' }, { to: 'c', label: 'y' }] }), act('c')]
    // 다음 단계가 여럿인 판단을 지우면 그리로 오던 연결은 끊긴다
    expect(flow(deleteActivity([act('z', { next: [{ to: 'b' }] }), ...branch], 'b')).z).toEqual([END_ID])
    // 다른 연결이 남아 있으면 건너뛰어 잇지 않고 지우기만
    const multi = [act('a', { next: [{ to: 'c' }, { to: 'b' }] }), act('b', { next: [{ to: END }] }), act('c')]
    expect(flow(deleteActivity(multi, 'b')).a).toEqual(['c'])
    // 판단의 분기는 조건을 유지한 채 건너뛴다
    const dec = [act('d', { kind: 'decision', next: [{ to: 'b', label: '승인' }, { to: 'c', label: '반려' }] }), act('b', { next: [{ to: 'e' }] }), act('c'), act('e')]
    expect(deleteActivity(dec, 'b')[0].next).toEqual([{ to: 'e', label: '승인' }, { to: 'c', label: '반려' }])
  })

  it('시작과 연결 = 그 활동을 1번으로, 연결은 유지', () => {
    const out = makeFirst(base(), 'c')
    expect(out.map((a) => a.id)).toEqual(['c', 'a', 'b'])
    expect(flow(out)).toEqual({ c: [END_ID], a: ['b'], b: ['c'] })
  })

  it('번호 다시 매기기: 위치 순서로 행을 정렬하고 연결은 유지', () => {
    const acts = [act('a'), act('b'), act('c')]
    const lay = freezeLayout(computeGeometry(acts, null))
    lay.pos.c.x = 0 // c 를 맨 왼쪽으로
    const out = sortByPosition(acts, computeGeometry(acts, lay))
    expect(out.map((a) => a.id)).toEqual(['c', 'a', 'b'])
    expect(flow(out)).toEqual({ c: [END_ID], a: ['b'], b: ['c'] })
  })
})

describe('배치·레인', () => {
  it('다른 레인으로 옮기면 담당자가 바뀐다', () => {
    const acts = [act('a', { performer: '팀장' }), act('b')]
    const geo = computeGeometry(acts, null)
    const lay = freezeLayout(geo)
    const node = geo.nodes.find((n) => n.id === 'a')!
    const r = moveNode(acts, lay, node, 400, LANE_H + 20)
    expect(r.acts[0].performer).toBe('채용담당')
    expect(r.layout.pos.a).toEqual({ x: 400, dy: 20 })
  })

  it('레인 이름 바꾸기 = 담당자 일괄 변경, 같은 이름이면 합친다', () => {
    const acts = [act('a', { performer: '팀장' }), act('b')]
    const lay = freezeLayout(computeGeometry(acts, null))
    const r = renameLane(acts, lay, '팀장', '현업 팀장')
    expect(r.acts[0].performer).toBe('현업 팀장')
    expect(r.layout.lanes).toEqual(['현업 팀장', '채용담당'])
    const merged = renameLane(acts, lay, '팀장', '채용담당')
    expect(merged.layout.lanes).toEqual(['채용담당'])
    expect(merged.acts.every((a) => a.performer === '채용담당')).toBe(true)
  })
})
