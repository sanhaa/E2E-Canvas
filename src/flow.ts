import { END, isBlankActivity, type Activity } from './model'
import { G, layoutFlow } from './layout'

/**
 * 순서도 편집 캔버스의 데이터 규칙.
 *
 * - 표(activities)가 원본이다. 캔버스의 박스·연결선은 표에서 계산하고, 캔버스에서 고친 내용은 표에 되돌려 쓴다.
 * - 캔버스에만 있는 정보(박스 위치, 레인 순서)는 파일의 process.asis.layout 에 저장한다.
 * - 레인 = 담당자. 박스를 다른 레인으로 옮기면 그 활동의 담당자가 바뀐다.
 * - 표의 "다음 단계"는 비워 두면 다음 행으로 이어진다(암묵 연결). 캔버스 편집은 모든 연결을 명시적으로 풀어서(materialize)
 *   고친 뒤, 다음 행으로 가는 단순 연결은 다시 비운다(compact). 그래서 행을 끼워 넣거나 순서를 바꿔도 연결이 그대로 유지된다.
 */

export const START_ID = '__start'
export const END_ID = '__end'
export const LANE_H = G.laneH

export interface NodePos {
  x: number
  /** 레인 위쪽 경계로부터의 거리 — 레인 순서를 바꿔도 박스가 자기 레인을 따라간다 */
  dy: number
  /** 시작/종료 이벤트만: 놓인 레인(담당자) 이름 */
  lane?: string
}

export interface FlowLayout {
  lanes: string[]
  pos: Record<string, NodePos>
}

export type GNodeKind = 'task' | 'decision' | 'start' | 'end'

export interface GNode {
  id: string
  kind: GNodeKind
  lane: number
  x: number
  y: number
  w: number
  h: number
  activity?: Activity
  seq?: number
}

export interface GEdge {
  id: string
  source: string
  target: string
  label?: string
  /** 표에서 이 연결을 가진 활동 id (시작 연결이면 START_ID) */
  from: string
  /** from 활동의 (암묵 연결을 풀어 쓴) 다음 단계 목록에서의 위치 */
  index: number
}

export interface Geometry {
  lanes: string[]
  nodes: GNode[]
  edges: GEdge[]
  width: number
  height: number
}

const laneKey = (a: Activity) => a.performer.trim()
const filledOf = (acts: Activity[]) => acts.filter((a) => !isBlankActivity(a))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const sizeOf = (kind: GNodeKind) =>
  kind === 'decision' ? { w: G.diamond, h: G.diamond } : kind === 'task' ? { w: G.taskW, h: G.taskH } : { w: G.event, h: G.event }
const clampDy = (dy: number, h: number) => clamp(dy, 6, LANE_H - h - 6)
const centerDy = (h: number) => (LANE_H - h) / 2

// ───────────────────────── 파일의 asis 필드 ─────────────────────────

/** 불완전하거나 손으로 고친 값도 최대한 살려서 읽는다 */
export function readLayout(asis: unknown): FlowLayout | null {
  const l = (asis as { layout?: unknown } | null)?.layout as { lanes?: unknown; pos?: unknown } | undefined
  if (!l || typeof l !== 'object') return null
  const lanes = Array.isArray(l.lanes) ? [...new Set(l.lanes.filter((s): s is string => typeof s === 'string').map((s) => s.trim()))] : []
  const pos: Record<string, NodePos> = {}
  if (l.pos && typeof l.pos === 'object') {
    for (const [id, v] of Object.entries(l.pos as Record<string, any>)) {
      if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.dy)) continue
      pos[id] = typeof v.lane === 'string' ? { x: v.x, dy: v.dy, lane: v.lane } : { x: v.x, dy: v.dy }
    }
  }
  return { lanes, pos }
}

export function writeLayout(asis: unknown, layout: FlowLayout | null): unknown {
  const base = asis && typeof asis === 'object' ? { ...(asis as Record<string, unknown>) } : {}
  delete base.layout
  if (layout) return { ...base, layout }
  return Object.keys(base).length ? base : null
}

// ───────────────────────── 표 → 순서도 ─────────────────────────

/** 레인 순서: 저장된 순서(빈 레인 포함) + 새로 등장한 담당자. 담당자 미입력('')은 실제로 쓰일 때만. */
export function laneOrder(acts: Activity[], layout: FlowLayout | null): string[] {
  const filled = filledOf(acts)
  const used = new Set(filled.map(laneKey))
  const order = (layout?.lanes ?? []).filter((n) => n !== '' || used.has(''))
  for (const a of filled) if (!order.includes(laneKey(a))) order.push(laneKey(a))
  if (order.length === 0) order.push('')
  return order
}

/** 표의 연결 그대로: 다음 단계가 비었으면 다음 행(마지막 행이면 종료). 빈 행은 건너뛴다. */
function effectiveLinks(filled: Activity[]) {
  return filled.map((a, i) => (a.next.length ? a.next : [{ to: filled[i + 1]?.id ?? END }]))
}

export function computeGeometry(acts: Activity[], layout: FlowLayout | null): Geometry {
  const filled = filledOf(acts)
  const lanes = laneOrder(acts, layout)
  const auto = layoutFlow(acts, lanes)
  const autoOf = new Map(auto.nodes.map((n) => [n.id, n]))
  const pos = layout?.pos ?? {}
  // [자동 정렬] 직후처럼 위치가 하나도 없으면 레인 순서만 지킨 자동 배치
  const frozen = Object.keys(pos).length > 0
  const nodes: GNode[] = []

  const place = (id: string, kind: GNodeKind, lane: number, fallbackX: number, fallbackY: number, extra: Partial<GNode> = {}): GNode => {
    const { w, h } = sizeOf(kind)
    const p = pos[id]
    const x = p ? p.x : fallbackX
    const y = lane * LANE_H + (p ? clampDy(p.dy, h) : frozen ? centerDy(h) : clampDy(fallbackY - lane * LANE_H, h))
    const n: GNode = { id, kind, lane, x, y, w, h, ...extra }
    nodes.push(n)
    return n
  }
  const laneIndex = (name: string | undefined, fallback: number) => {
    const i = name === undefined ? -1 : lanes.indexOf(name)
    return i >= 0 ? i : fallback
  }

  const links = effectiveLinks(filled)
  const firstLane = filled[0] ? lanes.indexOf(laneKey(filled[0])) : 0
  const autoStart = autoOf.get('__start')!
  place(START_ID, 'start', laneIndex(pos[START_ID]?.lane, firstLane), autoStart.x, autoStart.y)

  let prev: GNode | undefined
  filled.forEach((a) => {
    const kind = a.kind
    const au = autoOf.get(a.id)!
    // 캔버스에서 이미 배치를 손본 뒤에 표에 추가된 활동은 바로 앞 활동 오른쪽에 둔다
    const { w } = sizeOf(kind)
    const fx = frozen && prev ? prev.x + prev.w / 2 + G.colW - w / 2 : au.x
    prev = place(a.id, kind, lanes.indexOf(laneKey(a)), fx, au.y, { activity: a, seq: acts.indexOf(a) + 1 })
  })

  const autoEnd = autoOf.get('__end')!
  const maxRight = Math.max(...nodes.map((n) => n.x + n.w))
  const endLaneAuto = auto.nodes.find((n) => n.id === '__end')!.lane
  place(END_ID, 'end', laneIndex(pos[END_ID]?.lane, endLaneAuto), frozen ? maxRight + G.colW / 2 : autoEnd.x, autoEnd.y)

  const has = new Set(nodes.map((n) => n.id))
  const edges: GEdge[] = [
    { id: `${START_ID}#0`, source: START_ID, target: filled[0]?.id ?? END_ID, from: START_ID, index: 0 },
  ]
  filled.forEach((a, i) => {
    links[i].forEach((l, k) => {
      const target = l.to === END ? END_ID : l.to
      if (!has.has(target)) return // 보류('?5')나 삭제된 행을 가리키는 연결은 그리지 않는다 (점검 목록에서 경고)
      edges.push({ id: `${a.id}#${k}`, source: a.id, target, label: l.label, from: a.id, index: k })
    })
  })

  return {
    lanes,
    nodes,
    edges,
    width: Math.max(...nodes.map((n) => n.x + n.w)) + G.colW,
    height: lanes.length * LANE_H,
  }
}

/** 지금 화면에 보이는 배치를 그대로 저장 형식으로 — 캔버스에서 처음 손대는 순간 자동 배치가 고정된다 */
export function freezeLayout(geo: Geometry): FlowLayout {
  const pos: Record<string, NodePos> = {}
  for (const n of geo.nodes) {
    const p: NodePos = { x: Math.round(n.x), dy: Math.round(n.y - n.lane * LANE_H) }
    if (n.kind === 'start' || n.kind === 'end') p.lane = geo.lanes[n.lane]
    pos[n.id] = p
  }
  return { lanes: [...geo.lanes], pos }
}

// ───────────────────────── 연결 편집 (표의 "다음 단계") ─────────────────────────

/** 비어 있는 "다음 단계"를 실제 연결(다음 행 / 종료)로 풀어 쓴다 */
export function materialize(acts: Activity[]): Activity[] {
  const filled = filledOf(acts)
  const nextOf = new Map(filled.map((a, i) => [a.id, filled[i + 1]?.id ?? END]))
  return acts.map((a) => (isBlankActivity(a) || a.next.length ? a : { ...a, next: [{ to: nextOf.get(a.id)! }] }))
}

/** 다음 행으로 가는 조건 없는 단일 연결은 다시 비운다 — 표의 "다음 단계" 칸이 꼭 필요한 곳에만 남도록 */
export function compact(acts: Activity[]): Activity[] {
  const filled = filledOf(acts)
  const nextOf = new Map(filled.map((a, i) => [a.id, filled[i + 1]?.id ?? END]))
  return acts.map((a) =>
    !isBlankActivity(a) && a.next.length === 1 && !a.next[0].label && a.next[0].to === nextOf.get(a.id) ? { ...a, next: [] } : a,
  )
}

/** 모든 연결을 명시적으로 푼 상태에서 편집하고 다시 정리한다 */
export function editLinks(acts: Activity[], fn: (explicit: Activity[]) => Activity[]): Activity[] {
  return compact(fn(materialize(acts)))
}

const withNext = (acts: Activity[], id: string, fn: (next: Activity['next']) => Activity['next']) =>
  acts.map((a) => (a.id === id ? { ...a, next: fn(a.next) } : a))

const toLink = (target: string) => (target === END_ID ? END : target)

/** 활동(판단 아님)은 다음 단계가 하나다 — 이미 하나로 이어져 있으면 새 연결이 그것을 대신한다 */
export function replacesLink(acts: Activity[], from: string): boolean {
  const src = materialize(acts).find((a) => a.id === from)
  return src?.kind === 'task' && src.next.length === 1
}

/** 연결 추가. 판단은 분기가 하나 늘고, 활동은 기존 단일 연결이 바뀐다 (replacesLink) */
export function addLink(acts: Activity[], from: string, target: string, label?: string): Activity[] {
  const to = toLink(target)
  const link = label ? { to, label } : { to }
  const replace = replacesLink(acts, from)
  return editLinks(acts, (m) =>
    withNext(m, from, (next) => (next.some((n) => n.to === to) ? next : replace ? [link] : [...next, link])),
  )
}

/** 연결 삭제. 나가는 연결이 하나도 남지 않으면 종료로 잇는다 (비워 두면 다음 행으로 다시 이어지기 때문) */
export function removeLink(acts: Activity[], from: string, index: number): { acts: Activity[]; toEnd: boolean } {
  let toEnd = false
  const out = editLinks(acts, (m) =>
    withNext(m, from, (next) => {
      const rest = next.filter((_, k) => k !== index)
      if (rest.length) return rest
      toEnd = true
      return [{ to: END }]
    }),
  )
  return { acts: out, toEnd }
}

export function retargetLink(acts: Activity[], from: string, index: number, target: string): Activity[] {
  const to = toLink(target)
  return editLinks(acts, (m) =>
    withNext(m, from, (next) => {
      if (next.some((n, k) => k !== index && n.to === to)) return next.filter((_, k) => k !== index)
      return next.map((n, k) => (k === index ? { ...n, to } : n))
    }),
  )
}

export function moveLinkSource(acts: Activity[], from: string, index: number, newFrom: string): Activity[] {
  return editLinks(acts, (m) => {
    const link = m.find((a) => a.id === from)?.next[index]
    if (!link) return m
    let out = withNext(m, from, (next) => {
      const rest = next.filter((_, k) => k !== index)
      return rest.length ? rest : [{ to: END }]
    })
    out = withNext(out, newFrom, (next) => (next.some((n) => n.to === link.to) ? next : [...next, link]))
    return out
  })
}

export function setLinkLabel(acts: Activity[], from: string, index: number, label: string): Activity[] {
  return editLinks(acts, (m) =>
    withNext(m, from, (next) => next.map((n, k) => (k === index ? (label.trim() ? { ...n, label } : { to: n.to }) : n))),
  )
}

// ───────────────────────── 활동(행) 편집 ─────────────────────────

/** 활동을 afterId 바로 다음 행(없으면 맨 앞)에 끼워 넣는다. 기존 연결은 그대로 유지된다. */
export function insertActivity(acts: Activity[], row: Activity, afterId: string | null): Activity[] {
  return editLinks(acts, (m) => {
    const i = afterId ? m.findIndex((a) => a.id === afterId) : -1
    const at = i >= 0 ? i + 1 : firstFilledIndex(m)
    return [...m.slice(0, at), row, ...m.slice(at)]
  })
}

const firstFilledIndex = (acts: Activity[]) => {
  const i = acts.findIndex((a) => !isBlankActivity(a))
  return i < 0 ? 0 : i
}

/** 선택한 활동 뒤에 새 활동을 넣고, 원래 나가던 연결을 새 활동이 이어받는다 (A→B 가 A→새→B 로) */
export function insertAfter(acts: Activity[], fromId: string, row: Activity): Activity[] {
  return editLinks(acts, (m) => {
    const i = m.findIndex((a) => a.id === fromId)
    if (i < 0) return m
    const src = m[i]
    // 판단은 기존 분기를 그대로 두고 새 분기 하나를 추가한다
    const out = withNext(m, fromId, (next) => (src.kind === 'decision' ? [...next, { to: row.id }] : [{ to: row.id }]))
    const added = { ...row, next: src.kind === 'decision' ? [{ to: END }] : src.next }
    return [...out.slice(0, i + 1), added, ...out.slice(i + 1)]
  })
}

/**
 * 활동 삭제. 들어오던 연결은 삭제한 활동의 다음 단계가 하나뿐이면 그쪽으로 건너뛰어 잇는다 (A→B→C 에서 B 삭제 → A→C).
 * 단, 조건 없는 연결은 A에게 다른 연결이 남아 있으면 그냥 지운다. 판단의 분기(조건 있는 연결)는 조건을 유지한 채 건너뛴다.
 */
export function deleteActivity(acts: Activity[], id: string): Activity[] {
  return editLinks(acts, (m) => {
    const victim = m.find((a) => a.id === id)
    if (!victim) return m
    const bypass = victim.next.length === 1 ? victim.next[0].to : null
    return m
      .filter((a) => a.id !== id)
      .map((a) => {
        if (!a.next.some((n) => n.to === id)) return a
        const others = a.next.filter((n) => n.to !== id)
        const next: Activity['next'] = []
        for (const n of a.next) {
          let to: string | null = n.to
          if (n.to === id) to = bypass && bypass !== a.id && (n.label || others.length === 0) ? bypass : null
          if (to && !next.some((x) => x.to === to)) next.push({ ...n, to })
        }
        return { ...a, next: next.length ? next : [{ to: END }] }
      })
  })
}

/** 활동을 첫 행으로 — 시작 이벤트는 항상 첫 행으로 이어진다 */
export function makeFirst(acts: Activity[], id: string): Activity[] {
  return editLinks(acts, (m) => {
    const row = m.find((a) => a.id === id)
    if (!row) return m
    const rest = m.filter((a) => a.id !== id)
    const at = firstFilledIndex(rest)
    return [...rest.slice(0, at), row, ...rest.slice(at)]
  })
}

/** 순서도에서 왼쪽→오른쪽(같으면 위→아래) 순서로 행 번호를 다시 매긴다. 연결은 유지된다. */
export function sortByPosition(acts: Activity[], geo: Geometry): Activity[] {
  const at = new Map(geo.nodes.map((n) => [n.id, n]))
  return editLinks(acts, (m) => {
    const filled = filledOf(m)
    const blanks = m.filter((a) => isBlankActivity(a))
    const key = (a: Activity) => at.get(a.id) ?? { x: Infinity, y: Infinity }
    const sorted = [...filled].sort((a, b) => key(a).x - key(b).x || key(a).y - key(b).y)
    return [...sorted, ...blanks]
  })
}

// ───────────────────────── 배치·레인 편집 ─────────────────────────

/** 박스를 (x, y)로 옮긴다. 중심이 다른 레인에 들어가면 담당자를 그 레인 이름으로 바꾼다. */
export function moveNode(acts: Activity[], layout: FlowLayout, node: GNode, x: number, y: number): { acts: Activity[]; layout: FlowLayout } {
  const lane = clamp(Math.floor((y + node.h / 2) / LANE_H), 0, layout.lanes.length - 1)
  const laneName = layout.lanes[lane]
  const p: NodePos = { x: Math.round(Math.max(0, x)), dy: Math.round(clampDy(y - lane * LANE_H, node.h)) }
  if (node.kind === 'start' || node.kind === 'end') p.lane = laneName
  const nextActs = node.activity && laneKey(node.activity) !== laneName
    ? acts.map((a) => (a.id === node.id ? { ...a, performer: laneName } : a))
    : acts
  return { acts: nextActs, layout: { ...layout, pos: { ...layout.pos, [node.id]: p } } }
}

/** 레인 이름 바꾸기 = 그 레인 활동들의 담당자를 한 번에 바꾸기. 이미 있는 이름이면 두 레인을 합친다. */
export function renameLane(acts: Activity[], layout: FlowLayout, from: string, to: string): { acts: Activity[]; layout: FlowLayout } {
  const name = to.trim()
  if (name === from) return { acts, layout }
  const merged = layout.lanes.includes(name)
  const lanes = merged ? layout.lanes.filter((n) => n !== from) : layout.lanes.map((n) => (n === from ? name : n))
  const pos = Object.fromEntries(
    Object.entries(layout.pos).map(([id, p]) => [id, p.lane === from ? { ...p, lane: name } : p]),
  )
  return {
    acts: acts.map((a) => (!isBlankActivity(a) && laneKey(a) === from ? { ...a, performer: name } : a)),
    layout: { lanes, pos },
  }
}

export function moveLane(layout: FlowLayout, name: string, delta: -1 | 1): FlowLayout {
  const i = layout.lanes.indexOf(name)
  const j = i + delta
  if (i < 0 || j < 0 || j >= layout.lanes.length) return layout
  const lanes = [...layout.lanes]
  ;[lanes[i], lanes[j]] = [lanes[j], lanes[i]]
  return { ...layout, lanes }
}

export function addLane(layout: FlowLayout, name: string): FlowLayout {
  const n = name.trim()
  return layout.lanes.includes(n) ? layout : { ...layout, lanes: [...layout.lanes, n] }
}

/** 빈 레인만 지운다 (활동이 있는 레인은 활동을 옮기거나 지운 뒤에) */
export function removeLane(acts: Activity[], layout: FlowLayout, name: string): FlowLayout {
  if (filledOf(acts).some((a) => laneKey(a) === name)) return layout
  return { ...layout, lanes: layout.lanes.filter((n) => n !== name) }
}

/** 기준 x 보다 오른쪽에 있는 박스들을 dx 만큼 민다 — 사이에 활동을 끼워 넣을 자리를 만든다 */
export function shiftRight(layout: FlowLayout, fromX: number, dx: number): FlowLayout {
  const pos = Object.fromEntries(Object.entries(layout.pos).map(([id, p]) => [id, p.x > fromX ? { ...p, x: p.x + dx } : p]))
  return { ...layout, pos }
}
