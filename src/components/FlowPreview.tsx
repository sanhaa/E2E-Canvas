import { useMemo } from 'react'
import type { Activity } from '../model'
import { layoutFlow } from '../layout'

const LANE_COLORS = ['#3b6fd8', '#0f9d8a', '#c2710c', '#8b5cf6', '#d4436f', '#5b7083', '#2f9e44', '#b8860b']

interface Props {
  activities: Activity[]
  onSelect: (rowId: string) => void
}

export function FlowPreview({ activities, onSelect }: Props) {
  const L = useMemo(() => layoutFlow(activities), [activities])
  const color = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length]

  return (
    <div className="flow-scroll">
      <div className="flow" style={{ width: L.width, height: L.height }}>
        {L.lanes.map((lane, i) => (
          <div key={lane.name} className="lane" style={{ top: lane.y, height: L.height / L.lanes.length }}>
            <div className="lane-label" style={{ borderColor: color(i) }}>
              <span>{lane.name}</span>
            </div>
          </div>
        ))}
        <svg className="flow-edges" width={L.width} height={L.height}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="arrow-head" />
            </marker>
          </defs>
          {L.edges.map((e) => (
            <g key={e.id}>
              <path d={e.path} className="edge" markerEnd="url(#arrow)" />
              {e.label && (
                <text x={e.label.x} y={e.label.y} textAnchor={e.label.anchor} className="edge-label">
                  {e.label.text}
                </text>
              )}
            </g>
          ))}
        </svg>
        {L.nodes.map((n) => {
          const style = { left: n.x, top: n.y, width: n.w, height: n.h }
          if (n.kind === 'start' || n.kind === 'end')
            return (
              <div key={n.id} className={`ev ev-${n.kind}`} style={style} title={n.kind === 'start' ? '시작' : '종료'}>
                <span className="ev-cap">{n.kind === 'start' ? '시작' : '종료'}</span>
              </div>
            )
          const a = n.activity!
          if (n.kind === 'decision')
            return (
              <button type="button" key={n.id} className="gw" style={style} onClick={() => onSelect(a.id)} title={`${n.seq}. ${a.name}`}>
                <span className="gw-shape"><span>×</span></span>
                <span className={`gw-label ${n.labelAt ?? ''}`}>
                  <b>{n.seq}.</b> {a.name || '(활동명 없음)'}
                </span>
              </button>
            )
          return (
            <button type="button" key={n.id} className="task" style={style} onClick={() => onSelect(a.id)} title={`${n.seq}번 행으로 이동`}>
              <span className="task-top" style={{ background: color(n.lane) }}>
                {[a.dept, a.performer].filter(Boolean).join(' · ') || '—'}
              </span>
              <span className="task-mid">
                <span className="task-seq">{n.seq}</span>
                {a.name || <em>(활동명 없음)</em>}
              </span>
              <span className="task-bot">
                {a.tools.length ? a.tools.map((t) => <span key={t} className="chip xs">{t}</span>) : <span className="muted">—</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
