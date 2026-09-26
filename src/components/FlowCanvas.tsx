import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  BaseEdge, ConnectionMode, EdgeLabelRenderer, getSmoothStepPath, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, useViewport,
  type Connection, type Edge, type EdgeProps, type FinalConnectionState, type Node, type NodeChange, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { emptyActivity, type Activity, type Issue, type PiDoc } from '../model'
import { G, NO_PERFORMER } from '../layout'
import {
  END_ID, LANE_H, START_ID, addLane, addLink, computeGeometry, deleteActivity, insertActivity, insertAfter, makeFirst, moveLane,
  moveLinkSource, moveNode, readLayout, removeLane, removeLink, renameLane, replacesLink, retargetLink, setLinkLabel, shiftRight, sortByPosition,
  type FlowLayout, type GEdge, type GNode, type Geometry,
} from '../flow'
import { CanvasPanel, type Selection } from './CanvasPanel'

export const LANE_COLORS = ['#3b6fd8', '#0f9d8a', '#c2710c', '#8b5cf6', '#d4436f', '#5b7083', '#2f9e44', '#b8860b']
const laneColor = (i: number) => LANE_COLORS[i % LANE_COLORS.length]

/** 캔버스 편집 한 번 = 되돌리기 한 단계. layout 은 지금 화면 배치를 고정한 값으로 넘어온다. */
export type CanvasEdit = (acts: Activity[], layout: FlowLayout) => { acts: Activity[]; layout: FlowLayout | null }

interface Props {
  doc: PiDoc
  issues: Issue[]
  performerOptions: string[]
  knownCustomTools: string[]
  onCommit: (edit: CanvasEdit) => void
  onPatch: (id: string, patch: Partial<Activity>) => void
  onProcess: (patch: Partial<PiDoc['process']>) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  notify: (text: string, tone?: 'ok' | 'warn') => void
}

/** 연결점이 아니라 박스 몸통에 놓아도 연결되도록, 마우스를 놓은 곳의 박스를 찾는다 */
function nodeAtPoint(e: MouseEvent | TouchEvent): string | null {
  const p = 'changedTouches' in e ? e.changedTouches[0] : e
  if (!p) return null
  const el = document.elementFromPoint(p.clientX, p.clientY)
  return el?.closest<HTMLElement>('.react-flow__node')?.dataset.id ?? null
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

// ───────────────────────── 노드 ─────────────────────────

interface NodeCtx {
  editingId: string | null
  startEdit: (id: string) => void
  finishEdit: (id: string, name: string | null) => void
}
const Ctx = createContext<NodeCtx>({ editingId: null, startEdit: () => {}, finishEdit: () => {} })

type NodeData = { g: GNode; color: string; warn: boolean; caption?: string }
type FlowNode = Node<NodeData>

/** 네 방향 연결점. ConnectionMode.Loose 라서 어느 점에서 끌어도 연결을 시작/도착할 수 있다. */
function Handles() {
  return (
    <>
      <Handle type="source" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
    </>
  )
}

function NameEditor({ id, value }: { id: string; value: string }) {
  const { finishEdit } = useContext(Ctx)
  const [text, setText] = useState(value)
  const done = useRef(false)
  const finish = (name: string | null) => {
    if (done.current) return
    done.current = true
    finishEdit(id, name)
  }
  return (
    <textarea
      className="fx-name-edit nodrag nowheel"
      value={text}
      autoFocus
      rows={2}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(text)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(text) }
        if (e.key === 'Escape') finish(null)
      }}
    />
  )
}

function TaskNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { editingId, startEdit } = useContext(Ctx)
  const a = data.g.activity!
  return (
    <div className={`fx-task ${selected ? 'sel' : ''} ${data.warn ? 'warn' : ''}`} onDoubleClick={() => startEdit(id)}>
      <Handles />
      <div className="task-top" style={{ background: data.color }}>{a.performer || '담당자 미입력'}</div>
      <div className="task-mid">
        <span className="task-seq">{data.g.seq}</span>
        {editingId === id ? <NameEditor id={id} value={a.name} /> : a.name || <em>(활동명 없음)</em>}
      </div>
      <div className="task-bot">
        {a.tools.length ? a.tools.map((t) => <span key={t} className="chip xs">{t}</span>) : <span className="muted">—</span>}
      </div>
    </div>
  )
}

function DecisionNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { editingId, startEdit } = useContext(Ctx)
  const a = data.g.activity!
  return (
    <div className={`fx-gw ${selected ? 'sel' : ''} ${data.warn ? 'warn' : ''}`} onDoubleClick={() => startEdit(id)}>
      <Handles />
      <span className="gw-shape"><span>×</span></span>
      <div className="fx-gw-label">
        {editingId === id ? <NameEditor id={id} value={a.name} /> : <><b>{data.g.seq}.</b> {a.name || '(활동명 없음)'}</>}
      </div>
    </div>
  )
}

function EventNode({ data, selected }: NodeProps<FlowNode>) {
  const start = data.g.kind === 'start'
  return (
    <div className={`fx-ev ${start ? 'ev-start' : 'ev-end'} ${selected ? 'sel' : ''}`} title={data.caption}>
      <Handles />
      <span className="fx-ev-cap">
        <b>{start ? '시작' : '종료'}</b>
        {data.caption ? ` · ${data.caption}` : ''}
      </span>
    </div>
  )
}

const nodeTypes = { task: TaskNode, decision: DecisionNode, start: EventNode, end: EventNode }

type FlowEdge = Edge<{ offset: number }>

/** 꺾은선 연결. 조건 라벨은 HTML 로 그려서 박스 위에도 보이게 한다 */
function StepEdge(p: EdgeProps<FlowEdge>) {
  const [path, lx, ly] = getSmoothStepPath({
    sourceX: p.sourceX, sourceY: p.sourceY, sourcePosition: p.sourcePosition,
    targetX: p.targetX, targetY: p.targetY, targetPosition: p.targetPosition,
    borderRadius: 6, offset: p.data?.offset ?? 18,
  })
  return (
    <>
      <BaseEdge id={p.id} path={path} markerEnd={p.markerEnd} interactionWidth={16} />
      {p.label && (
        <EdgeLabelRenderer>
          <div className={`fx-edge-label ${p.selected ? 'sel' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
            {p.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
const edgeTypes = { step: StepEdge }

/**
 * 연결선이 나가고 들어갈 면. 가는 길에 다른 박스가 있으면 비어 있는 쪽 레인으로 돌아간다.
 * - 앞으로(오른쪽): 같은 레인이면 오른쪽→왼쪽(막혀 있으면 위로 넘어감).
 *   다른 레인이면 도착 레인이 비어 있을 때 세로로 먼저, 출발 레인이 비어 있을 때 가로로 먼저 간다.
 * - 뒤로(왼쪽): 아래(또는 위)로 돌아서 들어간다.
 */
function pickHandles(s: GNode, t: GNode, all: GNode[]): [string, string] {
  const clear = (lane: number, x0: number, x1: number) =>
    !all.some((n) => n !== s && n !== t && n.lane === lane && n.x < x1 && n.x + n.w > x0)
  if (t.x >= s.x + s.w - 4) {
    const x0 = s.x + s.w
    const x1 = t.x
    if (t.lane === s.lane) return clear(s.lane, x0, x1) ? ['r', 'l'] : ['t', 't']
    const down = t.lane > s.lane
    const targetClear = clear(t.lane, s.x, x1)
    const sourceClear = clear(s.lane, x0, t.x + t.w)
    if (targetClear && (s.kind === 'decision' || !sourceClear)) return [down ? 'b' : 't', 'l']
    if (sourceClear && !targetClear) return ['r', down ? 't' : 'b']
    return ['r', 'l']
  }
  if (t.x + t.w <= s.x + 4) {
    if (t.lane === s.lane) return ['b', 'b']
    return t.lane < s.lane ? ['t', 'b'] : ['b', 't']
  }
  return t.y > s.y ? ['b', 't'] : ['t', 'b']
}

// ───────────────────────── 레인 ─────────────────────────

function LaneLayer({ geo, dropLane }: { geo: Geometry; dropLane: number | null }) {
  const { x, y, zoom } = useViewport()
  return (
    <div className="fx-lanes" style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})` }}>
      {geo.lanes.map((name, i) => (
        <div
          key={name + i}
          className={`fx-lane ${i % 2 ? 'alt' : ''} ${dropLane === i ? 'drop' : ''}`}
          style={{ top: i * LANE_H, height: LANE_H, width: geo.width + 600 }}
        />
      ))}
    </div>
  )
}

interface LaneLabelsProps {
  geo: Geometry
  used: Set<string>
  onRename: (from: string, to: string) => void
  onMove: (name: string, delta: -1 | 1) => void
  onRemove: (name: string) => void
  onAdd: () => void
}

function LaneLabels({ geo, used, onRename, onMove, onRemove, onAdd }: LaneLabelsProps) {
  const { y, zoom } = useViewport()
  const [editing, setEditing] = useState<number | null>(null)
  const h = LANE_H * zoom
  return (
    <div className="fx-lane-labels">
      {geo.lanes.map((name, i) => (
        <div key={name + i} className="fx-lane-label" style={{ top: y + i * h, height: h, borderLeftColor: laneColor(i) }}>
          {editing === i ? (
            <input
              className="nodrag"
              autoFocus
              defaultValue={name}
              placeholder="담당자(역할)"
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => { setEditing(null); onRename(name, e.currentTarget.value) }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') { e.currentTarget.value = name; e.currentTarget.blur() }
              }}
            />
          ) : (
            <button type="button" className="fx-lane-name" title="눌러서 담당자 이름 바꾸기" onClick={() => setEditing(i)}>
              {name || <em>{NO_PERFORMER}</em>}
            </button>
          )}
          {h >= 60 && (
            <div className="fx-lane-tools">
              <button type="button" title="레인 위로" disabled={i === 0} onClick={() => onMove(name, -1)}>▲</button>
              <button type="button" title="레인 아래로" disabled={i === geo.lanes.length - 1} onClick={() => onMove(name, 1)}>▼</button>
              {!used.has(name) && <button type="button" title="빈 레인 삭제" className="danger" onClick={() => onRemove(name)}>✕</button>}
            </div>
          )}
        </div>
      ))}
      <button type="button" className="fx-lane-add" style={{ top: y + geo.lanes.length * h + 6 }} onClick={onAdd}>＋ 레인 추가</button>
    </div>
  )
}

// ───────────────────────── 캔버스 ─────────────────────────

const PALETTE_MIME = 'application/x-pi-canvas'
/** 왼쪽 레인 이름 칸 너비 (styles.css .fx-lane-labels 와 같게) */
const LABEL_W = 104

function Canvas(props: Props) {
  const { doc, issues, onCommit, onPatch, notify } = props
  const acts = doc.process.activities
  const layout = useMemo(() => readLayout(doc.process.asis), [doc.process.asis])
  const geo = useMemo(() => computeGeometry(acts, layout), [acts, layout])
  const byId = useMemo(() => new Map(geo.nodes.map((n) => [n.id, n])), [geo])
  const rf = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)

  const [sel, setSel] = useState<Selection>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)

  // 선택한 대상이 사라지면(되돌리기, 표에서 삭제 등) 선택 해제
  useEffect(() => {
    if (sel?.kind === 'node' && !byId.has(sel.id)) setSel(null)
    if (sel?.kind === 'edge' && !geo.edges.some((e) => e.id === sel.id)) setSel(null)
  }, [geo, byId, sel])

  const warnRows = useMemo(() => new Set(issues.filter((i) => i.level === 'warn' && i.rowId).map((i) => i.rowId!)), [issues])
  const used = useMemo(() => new Set(geo.nodes.filter((n) => n.activity).map((n) => n.activity!.performer.trim())), [geo])

  const nodes: FlowNode[] = useMemo(
    () =>
      geo.nodes.map((g) => ({
        id: g.id,
        type: g.kind,
        position: drag?.id === g.id ? { x: drag.x, y: drag.y } : { x: g.x, y: g.y },
        width: g.w,
        height: g.h,
        selected: sel?.kind === 'node' && sel.id === g.id,
        data: {
          g,
          color: laneColor(g.lane),
          warn: warnRows.has(g.id),
          caption: g.kind === 'start' ? doc.process.startEvent : g.kind === 'end' ? doc.process.endEvent : undefined,
        },
      })),
    [geo, drag, sel, warnRows, doc.process.startEvent, doc.process.endEvent],
  )

  const edges: FlowEdge[] = useMemo(() => {
    const backCount = new Map<number, number>()
    return geo.edges.map((e) => {
      const s = byId.get(e.source)!
      const t = byId.get(e.target)!
      const [sh, th] = pickHandles(s, t, geo.nodes)
      let offset = 18
      if (sh === 'b' && th === 'b') {
        const k = backCount.get(s.lane) ?? 0
        backCount.set(s.lane, k + 1)
        offset = 16 + k * 7
      }
      const selected = sel?.kind === 'edge' && sel.id === e.id
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: sh,
        targetHandle: th,
        type: 'step',
        data: { offset },
        label: e.label,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: selected ? '#2f5bd3' : '#7b8497' },
        selected,
      }
    })
  }, [geo, byId, sel])

  // ── 편집 동작 ──
  const commit = onCommit

  const newRow = (kind: Activity['kind']): Activity => ({
    ...emptyActivity(),
    kind,
    name: kind === 'decision' ? '새 판단' : '새 활동',
    next: [{ to: 'END' }],
  })

  /** 캔버스 좌표 (cx, cy) 를 중심으로 새 활동을 만든다. 행 번호는 왼쪽에 있는 활동 바로 뒤. */
  const addAt = (kind: Activity['kind'], cx: number, cy: number) => {
    const row = newRow(kind)
    const w = kind === 'decision' ? G.diamond : G.taskW
    const h = kind === 'decision' ? G.diamond : G.taskH
    const actsOnCanvas = geo.nodes.filter((n) => n.activity)
    const left = actsOnCanvas.filter((n) => n.x + n.w / 2 <= cx).sort((a, b) => b.x - a.x)[0] ?? actsOnCanvas[0]
    commit((list, lay) => {
      const inserted = insertActivity(list, row, left?.id ?? null)
      const fake: GNode = { id: row.id, kind, lane: 0, x: 0, y: 0, w, h, activity: row }
      return moveNode(inserted, lay, fake, cx - w / 2, cy - h / 2)
    })
    setSel({ kind: 'node', id: row.id })
    setEditingId(row.id)
  }

  const addAfterSelected = (id: string) => {
    const src = byId.get(id)
    if (!src?.activity) return
    const row = { ...newRow('task'), performer: src.activity.performer }
    commit((list, lay) => {
      const shifted = shiftRight(lay, src.x, G.colW)
      const inserted = insertAfter(list, id, row)
      const x = src.x + src.w / 2 + G.colW - G.taskW / 2
      const dy = (LANE_H - G.taskH) / 2
      return { acts: inserted, layout: { ...shifted, pos: { ...shifted.pos, [row.id]: { x, dy } } } }
    })
    setSel({ kind: 'node', id: row.id })
    setEditingId(row.id)
  }

  const deleteSelection = () => {
    if (!sel) return
    if (sel.kind === 'node') {
      if (sel.id === START_ID || sel.id === END_ID) return notify('시작·종료는 지울 수 없습니다. 옮기기만 할 수 있습니다.', 'warn')
      const g = byId.get(sel.id)
      commit((list, lay) => ({ acts: deleteActivity(list, sel.id), layout: lay }))
      setSel(null)
      notify(`${g?.seq ?? ''}번 활동을 삭제했습니다. (Ctrl+Z 로 되돌리기)`)
    } else {
      const e = geo.edges.find((x) => x.id === sel.id)
      if (!e) return
      if (e.from === START_ID) return notify('시작 연결은 지울 수 없습니다. 연결선 끝을 끌어 다른 활동으로 옮기면 그 활동이 1번이 됩니다.', 'warn')
      let toEnd = false
      commit((list, lay) => {
        const r = removeLink(list, e.from, e.index)
        toEnd = r.toEnd
        return { acts: r.acts, layout: lay }
      })
      setSel(null)
      if (toEnd) notify('나가는 연결이 없어져서 종료로 이었습니다. 연결선 끝을 끌어 원하는 곳으로 옮기세요.')
    }
  }

  const onConnect = (c: Connection) => {
    const { source, target } = c
    if (!source || !target || source === target) return
    if (source === END_ID) return notify('종료에서는 연결을 시작할 수 없습니다.', 'warn')
    if (target === START_ID) return notify('시작으로 들어오는 연결은 만들 수 없습니다.', 'warn')
    if (source === START_ID) {
      if (target === END_ID) return
      commit((list, lay) => ({ acts: makeFirst(list, target), layout: lay }))
      return notify('시작과 연결한 활동을 1번으로 옮겼습니다.')
    }
    if (geo.edges.some((e) => e.source === source && e.target === target)) return
    const count = geo.edges.filter((e) => e.from === source).length
    const replaced = replacesLink(acts, source) ? geo.edges.find((e) => e.from === source) : undefined
    commit((list, lay) => ({ acts: addLink(list, source, target), layout: lay }))
    if (replaced) {
      const was = byId.get(replaced.target)
      const wasName = was?.kind === 'end' ? '종료' : `${was?.seq}번`
      notify(`기존 연결(→ ${wasName})을 새 연결로 바꿨습니다. 여러 갈래로 나누려면 유형을 '판단'으로 바꾸세요.`)
    }
    // 판단에서 나가는 연결은 바로 조건을 적도록 선택해 둔다
    if (byId.get(source)?.kind === 'decision') setSel({ kind: 'edge', id: `${source}#${count}` })
  }

  const onReconnect = (old: Edge, c: Connection) => {
    const e = geo.edges.find((x) => x.id === old.id)
    if (!e || !c.source || !c.target) return
    if (c.source === c.target) return
    if (e.from === START_ID) {
      if (c.source !== START_ID || c.target === END_ID) return notify('시작 연결은 끝점만 다른 활동으로 옮길 수 있습니다.', 'warn')
      commit((list, lay) => ({ acts: makeFirst(list, c.target), layout: lay }))
      return notify('시작과 연결한 활동을 1번으로 옮겼습니다.')
    }
    if (c.source !== e.source) {
      if (c.source === START_ID || c.source === END_ID) return notify('시작·종료로는 연결 출발점을 옮길 수 없습니다.', 'warn')
      commit((list, lay) => ({ acts: moveLinkSource(list, e.from, e.index, c.source), layout: lay }))
      return
    }
    if (c.target === START_ID) return notify('시작으로 들어오는 연결은 만들 수 없습니다.', 'warn')
    commit((list, lay) => ({ acts: retargetLink(list, e.from, e.index, c.target), layout: lay }))
  }

  const onConnectEnd = (e: MouseEvent | TouchEvent, st: FinalConnectionState) => {
    if (st.isValid || !st.fromNode) return
    const target = nodeAtPoint(e)
    if (target && target !== st.fromNode.id) onConnect({ source: st.fromNode.id, target, sourceHandle: null, targetHandle: null })
  }

  const onReconnectEnd = (e: MouseEvent | TouchEvent, edge: Edge, _h: unknown, st: FinalConnectionState) => {
    if (st.isValid || !st.fromNode) return
    const at = nodeAtPoint(e)
    if (!at) return
    // fromNode = 움직이지 않은 쪽 끝
    const movingTarget = st.fromNode.id === edge.source
    const c = movingTarget
      ? { source: edge.source, target: at, sourceHandle: null, targetHandle: null }
      : { source: at, target: edge.target, sourceHandle: null, targetHandle: null }
    if (c.source === edge.source && c.target === edge.target) return
    onReconnect(edge, c)
  }

  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    for (const c of changes) if (c.type === 'position' && c.position && c.dragging) setDrag({ id: c.id, ...c.position })
  }

  const onNodeDragStop = (_: unknown, node: FlowNode) => {
    const g = byId.get(node.id)
    setDrag(null)
    if (!g) return
    if (Math.abs(node.position.x - g.x) < 1 && Math.abs(node.position.y - g.y) < 1) return
    commit((list, lay) => moveNode(list, lay, g, node.position.x, node.position.y))
  }

  const dropLane = drag
    ? Math.max(0, Math.min(geo.lanes.length - 1, Math.floor((drag.y + (byId.get(drag.id)?.h ?? 0) / 2) / LANE_H)))
    : null
  const draggingLaneChange = drag && byId.get(drag.id)?.lane !== dropLane

  // ── 키보드: Delete 삭제 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || editingId) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelection()
      }
      if (e.key === 'Escape') setSel(null)
      if (e.key === 'F2' && sel?.kind === 'node' && byId.get(sel.id)?.activity) setEditingId(sel.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const ctx: NodeCtx = useMemo(
    () => ({
      editingId,
      startEdit: (id) => { if (byId.get(id)?.activity) { setSel({ kind: 'node', id }); setEditingId(id) } },
      finishEdit: (id, name) => {
        setEditingId(null)
        if (name !== null) onPatch(id, { name: name.replace(/\s*\n\s*/g, ' ').trim() || '새 활동' })
      },
    }),
    [editingId, byId, onPatch],
  )

  /** 왼쪽 레인 이름 칸을 피해서 보여준다. whole = 전체가 한 화면에, 아니면 레인 높이만 맞추고 왼쪽부터 */
  const fitLanes = (whole: boolean, duration = 0) => {
    const el = wrapper.current
    if (!el) return
    const minX = Math.min(...geo.nodes.map((n) => n.x)) - 24
    const maxX = Math.max(...geo.nodes.map((n) => n.x + n.w)) + 60
    const byHeight = (el.clientHeight - 60) / (geo.height + 20)
    const byWidth = (el.clientWidth - LABEL_W - 16) / (maxX - minX)
    const zoom = Math.max(0.25, Math.min(1, whole ? Math.min(byHeight, byWidth) : Math.max(0.5, byHeight)))
    rf.setViewport({ x: LABEL_W + 8 - minX * zoom, y: 12, zoom }, { duration })
  }
  // 처음 열 때: 레인 전체 높이가 보이도록 배율을 정하고 왼쪽부터 보여준다
  const onInit = useCallback(() => fitLanes(false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [])

  const paletteItem = (kind: Activity['kind'], label: string) => (
    <button
      type="button"
      className={`fx-palette ${kind}`}
      draggable
      title="캔버스로 끌어다 놓거나, 누르면 선택한 활동 옆(없으면 맨 끝)에 추가"
      onDragStart={(e) => { e.dataTransfer.setData(PALETTE_MIME, kind); e.dataTransfer.effectAllowed = 'copy' }}
      onClick={() => {
        const ref = (sel?.kind === 'node' && byId.get(sel.id)) || [...geo.nodes].filter((n) => n.activity).sort((a, b) => b.x - a.x)[0]
        const cx = ref ? ref.x + ref.w / 2 + G.colW : 300
        const cy = ref ? ref.lane * LANE_H + LANE_H / 2 : LANE_H / 2
        addAt(kind, cx, cy)
      }}
    >
      <span className="fx-palette-icon" />
      {label}
    </button>
  )

  const autoArrange = () => {
    commit((list, lay) => ({ acts: list, layout: { lanes: lay.lanes, pos: {} } }))
    notify('활동 순서대로 다시 배치했습니다. (Ctrl+Z 로 되돌리기)')
    setTimeout(() => fitLanes(false, 200), 0)
  }
  const renumber = () => {
    commit((list, lay) => ({ acts: sortByPosition(list, geo), layout: lay }))
    notify('순서도의 왼쪽→오른쪽 순서로 행 번호를 다시 매겼습니다. 연결은 그대로입니다.')
  }

  return (
    <Ctx.Provider value={ctx}>
      <div className="fx-view">
        <div className="fx-toolbar">
          <div className="fx-group">
            {paletteItem('task', '활동')}
            {paletteItem('decision', '판단')}
          </div>
          <div className="fx-group">
            <button type="button" onClick={props.onUndo} disabled={!props.canUndo} title="Ctrl+Z">↶ 되돌리기</button>
            <button type="button" onClick={props.onRedo} disabled={!props.canRedo} title="Ctrl+Y">↷ 다시 실행</button>
          </div>
          <div className="fx-group">
            <button type="button" onClick={autoArrange} title="박스 위치를 행 순서대로 다시 배치합니다 (레인 순서는 유지)">자동 정렬</button>
            <button type="button" onClick={renumber} title="순서도에서 왼쪽에 있는 활동부터 1, 2, 3… 으로 표의 행 순서를 바꿉니다">번호 다시 매기기</button>
            <button type="button" onClick={() => rf.zoomOut({ duration: 150 })} title="축소 (Ctrl+마우스 휠)">－</button>
            <button type="button" onClick={() => rf.zoomIn({ duration: 150 })} title="확대 (Ctrl+마우스 휠)">＋</button>
            <button type="button" onClick={() => fitLanes(true, 200)}>전체 보기</button>
          </div>
          <span className="fx-hint muted small">
            박스 테두리의 점을 끌어 연결 · 연결선 끝을 끌어 옮기기 · 더블클릭으로 이름 수정 · Delete 로 삭제
          </span>
        </div>
        <div className="fx-body">
          <div
            className={`fx-canvas ${draggingLaneChange ? 'lane-change' : ''}`}
            ref={wrapper}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(PALETTE_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
            onDrop={(e) => {
              const kind = e.dataTransfer.getData(PALETTE_MIME) as Activity['kind']
              if (!kind) return
              e.preventDefault()
              const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
              addAt(kind, p.x, p.y)
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={(_, n) => setSel({ kind: 'node', id: n.id })}
              onEdgeClick={(_, e) => setSel({ kind: 'edge', id: e.id })}
              onPaneClick={() => { setSel(null); setEditingId(null) }}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onConnectEnd={onConnectEnd}
              onReconnectEnd={onReconnectEnd}
              edgesReconnectable
              connectionMode={ConnectionMode.Loose}
              connectionRadius={28}
              deleteKeyCode={null}
              selectionKeyCode={null}
              multiSelectionKeyCode={null}
              zoomOnDoubleClick={false}
              panOnScroll
              zoomActivationKeyCode="Control"
              minZoom={0.25}
              maxZoom={2}
              snapToGrid
              snapGrid={[6, 6]}
              onInit={onInit}
              proOptions={{ hideAttribution: true }}
            >
              <LaneLayer geo={geo} dropLane={drag ? dropLane : null} />
              <LaneLabels
                geo={geo}
                used={used}
                onRename={(from, to) => {
                  if (to.trim() === from) return
                  commit((list, lay) => renameLane(list, lay, from, to))
                }}
                onMove={(name, d) => commit((list, lay) => ({ acts: list, layout: moveLane(lay, name, d) }))}
                onRemove={(name) => commit((list, lay) => ({ acts: list, layout: removeLane(list, lay, name) }))}
                onAdd={() => {
                  let n = 1
                  while (geo.lanes.includes(`새 담당자 ${n}`)) n++
                  commit((list, lay) => ({ acts: list, layout: addLane(lay, `새 담당자 ${n}`) }))
                }}
              />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeColor={(n) => (n.type === 'decision' ? '#b69cf0' : n.type === 'task' ? laneColor((n.data as NodeData).g.lane) : '#9aa3b3')}
              />
            </ReactFlow>
          </div>
          <CanvasPanel
            sel={sel}
            geo={geo}
            doc={doc}
            issues={issues}
            performerOptions={props.performerOptions}
            knownCustomTools={props.knownCustomTools}
            onPatch={onPatch}
            onProcess={props.onProcess}
            onSelect={setSel}
            onLabel={(e: GEdge, label: string) => commit((list, lay) => ({ acts: setLinkLabel(list, e.from, e.index, label), layout: lay }))}
            onRetarget={(e: GEdge, target: string) => commit((list, lay) => ({ acts: retargetLink(list, e.from, e.index, target), layout: lay }))}
            onDelete={deleteSelection}
            onAddAfter={addAfterSelected}
          />
        </div>
      </div>
    </Ctx.Provider>
  )
}

export function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}
