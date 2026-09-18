import { END, effectiveNext, isBlankActivity, type Activity, type ActivityKind } from './model'

/**
 * R1 읽기 전용 미리보기용 단순 레이아웃: 행 순서 = 열, 부서 = 레인.
 * (R2 편집 캔버스에서는 ELK 자동 배치로 교체 예정)
 */

export const G = {
  laneLabelW: 104,
  colW: 186,
  laneH: 136,
  taskW: 156,
  taskH: 92,
  diamond: 58,
  event: 36,
}

export type NodeKind = ActivityKind | 'start' | 'end'

export interface LNode {
  id: string
  kind: NodeKind
  lane: number
  col: number
  x: number
  y: number
  w: number
  h: number
  activity?: Activity
  seq?: number
  /** 판단 이름 라벨 위치 — 분기선이 쓰지 않는 쪽에 둔다 */
  labelAt?: 'top' | 'bottom' | 'left'
}

export interface LEdge {
  id: string
  path: string
  label?: { x: number; y: number; text: string; anchor: 'start' | 'end' | 'middle' }
}

export interface Lane {
  name: string
  y: number
}

export interface Layout {
  lanes: Lane[]
  nodes: LNode[]
  edges: LEdge[]
  width: number
  height: number
}

const NO_DEPT = '(부서 미입력)'

export function layoutFlow(all: Activity[]): Layout {
  const acts = all.filter((a) => !isBlankActivity(a))
  const laneNames: string[] = []
  const laneOf = (a: Activity) => {
    const name = a.dept.trim() || NO_DEPT
    let i = laneNames.indexOf(name)
    if (i < 0) i = laneNames.push(name) - 1
    return i
  }
  const actLanes = acts.map(laneOf)
  if (laneNames.length === 0) laneNames.push(NO_DEPT)

  const cy = (lane: number) => lane * G.laneH + G.laneH / 2
  const colX = (col: number) => G.laneLabelW + col * G.colW
  const place = (id: string, kind: NodeKind, lane: number, col: number, w: number, h: number, extra: Partial<LNode> = {}): LNode => ({
    id, kind, lane, col, w, h, x: colX(col) + (G.colW - w) / 2, y: cy(lane) - h / 2, ...extra,
  })

  const nodes: LNode[] = []
  const byId = new Map<string, LNode>()
  const add = (n: LNode) => { nodes.push(n); byId.set(n.id, n) }

  const allNext = acts.map((_, i) => effectiveNext(acts, i))
  // 종료 이벤트는 마지막으로 종료에 닿는 행의 레인에 둔다
  let endLane = actLanes[actLanes.length - 1] ?? 0
  allNext.forEach((next, i) => { if (next.some((n) => n.to === END)) endLane = actLanes[i] })

  add(place('__start', 'start', actLanes[0] ?? 0, 0, G.event, G.event))
  acts.forEach((a, i) => {
    const isDecision = a.kind === 'decision'
    add(place(a.id, a.kind, actLanes[i], i + 1, isDecision ? G.diamond : G.taskW, isDecision ? G.diamond : G.taskH, { activity: a, seq: all.indexOf(a) + 1 }))
  })
  add(place('__end', 'end', endLane, acts.length + 1, G.event, G.event))

  const occupied = new Set(nodes.map((n) => `${n.lane}:${n.col}`))
  const laneClear = (lane: number, fromCol: number, toCol: number) => {
    for (let c = fromCol + 1; c < toCol; c++) if (occupied.has(`${lane}:${c}`)) return false
    return true
  }

  const edges: LEdge[] = []
  const backCount = new Map<number, number>() // 레인 하단 경로 겹침 방지용

  /** 판단에서 나가는 분기는 목표 레인 쪽(위/아래) 꼭짓점으로 내보내 조건 라벨이 겹치지 않게 한다 */
  const usedPorts = new Map<string, Set<string>>()
  const verticalPort = (s: LNode, t: LNode): 'top' | 'bottom' | null => {
    if (s.kind !== 'decision' || t.col <= s.col || t.lane === s.lane) return null
    const port = t.lane < s.lane ? 'top' : 'bottom'
    const used = usedPorts.get(s.id) ?? new Set<string>()
    if (used.has(port) || !laneClear(t.lane, s.col - 1, t.col)) return null
    used.add(port)
    usedPorts.set(s.id, used)
    return port
  }

  const connect = (s: LNode, t: LNode, label?: string) => {
    const sR = s.x + s.w, sCx = s.x + s.w / 2, sCy = s.y + s.h / 2
    const tL = t.x, tCx = t.x + t.w / 2, tCy = t.y + t.h / 2
    let path: string
    let lab: LEdge['label']
    const port = verticalPort(s, t)
    if (port) {
      const y0 = port === 'top' ? s.y : s.y + s.h
      path = `M${sCx},${y0} V${tCy} H${tL}`
      if (label) lab = { x: sCx + 6, y: port === 'top' ? y0 - 6 : y0 + 14, text: label, anchor: 'start' }
    } else if (t.col > s.col) {
      if (s.lane === t.lane) {
        if (laneClear(s.lane, s.col, t.col)) {
          path = `M${sR},${sCy} H${tL}`
          if (label) lab = { x: sR + 6, y: sCy - 7, text: label, anchor: 'start' }
        } else {
          const yTop = s.lane * G.laneH + 10
          path = `M${sCx},${s.y} V${yTop} H${tCx} V${t.y}`
          if (label) lab = { x: sCx + 6, y: yTop + 12, text: label, anchor: 'start' }
        }
      } else if (laneClear(s.lane, s.col, t.col) || !laneClear(t.lane, s.col, t.col)) {
        const midX = tL - 18
        path = `M${sR},${sCy} H${midX} V${tCy} H${tL}`
        // 같은 판단에서 오른쪽으로 나가는 분기가 여럿일 수 있으니 라벨은 도착 쪽에 둔다
        if (label) lab = { x: tL - 6, y: tCy - 7, text: label, anchor: 'end' }
      } else {
        const midX = sR + 14
        path = `M${sR},${sCy} H${midX} V${tCy} H${tL}`
        if (label) lab = { x: tL - 6, y: tCy - 7, text: label, anchor: 'end' }
      }
    } else {
      if (s.kind === 'decision') usedPorts.set(s.id, (usedPorts.get(s.id) ?? new Set<string>()).add('bottom'))
      const lower = Math.max(s.lane, t.lane)
      const k = backCount.get(lower) ?? 0
      backCount.set(lower, k + 1)
      const yb = (lower + 1) * G.laneH - 10 - k * 7
      path = `M${sCx},${s.y + s.h} V${yb} H${tCx} V${t.y + t.h}`
      if (label) lab = { x: sCx + 6, y: s.y + s.h + 14, text: label, anchor: 'start' }
    }
    edges.push({ id: `${s.id}->${t.id}:${edges.length}`, path, label: lab })
  }

  const start = byId.get('__start')!
  const end = byId.get('__end')!
  const first = acts[0] ? byId.get(acts[0].id) : end
  if (first) connect(start, first)
  acts.forEach((a, i) => {
    const s = byId.get(a.id)!
    for (const link of allNext[i]) {
      const t = link.to === END ? end : byId.get(link.to)
      if (t) connect(s, t, link.label)
    }
  })

  for (const n of nodes) {
    if (n.kind !== 'decision') continue
    const used = usedPorts.get(n.id)
    n.labelAt = !used?.has('bottom') ? 'bottom' : !used.has('top') ? 'top' : 'left'
  }

  return {
    lanes: laneNames.map((name, i) => ({ name, y: i * G.laneH })),
    nodes,
    edges,
    width: G.laneLabelW + (acts.length + 2) * G.colW,
    height: laneNames.length * G.laneH,
  }
}
