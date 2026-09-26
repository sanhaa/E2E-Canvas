import { useEffect, useState } from 'react'
import type { Activity, Issue, PiDoc } from '../model'
import { END_ID, START_ID, type GEdge, type Geometry } from '../flow'
import { NO_PERFORMER } from '../layout'
import { ToolsCell } from './ToolsCell'

export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null

interface Props {
  sel: Selection
  geo: Geometry
  doc: PiDoc
  issues: Issue[]
  performerOptions: string[]
  knownCustomTools: string[]
  onPatch: (id: string, patch: Partial<Activity>) => void
  onProcess: (patch: Partial<PiDoc['process']>) => void
  onSelect: (sel: Selection) => void
  onLabel: (e: GEdge, label: string) => void
  onRetarget: (e: GEdge, target: string) => void
  onDelete: () => void
  onAddAfter: (id: string) => void
}

/** 입력하는 동안에는 로컬로만 두고, 칸을 벗어나거나 Enter 를 누를 때 반영한다 (레인 이동·되돌리기 단위가 글자마다 생기지 않도록) */
function CommitInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <input
      {...rest}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== value) onCommit(text) }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setText(value); setTimeout(() => (e.target as HTMLInputElement).blur()) }
      }}
    />
  )
}

export function CanvasPanel(props: Props) {
  const { sel, geo, doc, issues } = props
  const nodeOf = (id: string) => geo.nodes.find((n) => n.id === id)
  const nameOf = (id: string) => {
    const n = nodeOf(id)
    if (!n) return '?'
    if (n.kind === 'start') return '시작'
    if (n.kind === 'end') return '종료'
    return `${n.seq}. ${n.activity!.name || '(활동명 없음)'}`
  }
  const targets = geo.nodes.filter((n) => n.id !== START_ID)

  if (!sel) {
    const count = geo.nodes.filter((n) => n.activity).length
    return (
      <aside className="fx-panel">
        <h3>순서도 편집</h3>
        <p className="muted small">박스나 연결선을 누르면 여기에서 내용을 고칠 수 있습니다.</p>
        <ul className="fx-tips">
          <li><b>추가</b> — 위의 [활동]·[판단]을 캔버스로 끌어다 놓기</li>
          <li><b>연결</b> — 박스 테두리의 점을 다른 박스로 끌기</li>
          <li><b>연결 바꾸기</b> — 연결선을 누른 뒤 화살표 끝을 다른 박스로 끌기</li>
          <li><b>담당자 바꾸기</b> — 박스를 다른 레인으로 끌기</li>
          <li><b>이름 수정</b> — 박스 더블클릭</li>
          <li><b>삭제</b> — 선택하고 Delete</li>
          <li><b>레인</b> — 왼쪽 레인 이름을 눌러 바꾸기, ▲▼로 순서 바꾸기</li>
        </ul>
        <p className="muted small">활동 {count}개 · 레인 {geo.lanes.length}개. 여기서 고친 내용은 [과제 정보·활동 목록] 표에 그대로 반영됩니다.</p>
      </aside>
    )
  }

  if (sel.kind === 'edge') {
    const e = geo.edges.find((x) => x.id === sel.id)
    if (!e) return <aside className="fx-panel" />
    const fromDecision = nodeOf(e.source)?.kind === 'decision'
    return (
      <aside className="fx-panel">
        <h3>연결</h3>
        <p className="fx-conn">
          <button type="button" className="link" onClick={() => props.onSelect({ kind: 'node', id: e.source })}>{nameOf(e.source)}</button>
          <span> → </span>
          <button type="button" className="link" onClick={() => props.onSelect({ kind: 'node', id: e.target })}>{nameOf(e.target)}</button>
        </p>
        {e.from === START_ID ? (
          <p className="muted small">시작은 항상 1번 활동으로 이어집니다. 화살표 끝을 다른 활동으로 끌면 그 활동이 1번이 됩니다.</p>
        ) : (
          <>
            <label className="field">
              <span>조건 {fromDecision && <span className="req">*</span>}</span>
              <CommitInput
                key={e.id}
                value={e.label ?? ''}
                autoFocus={fromDecision && !e.label}
                placeholder={fromDecision ? '예: 승인, 반려, 보완 필요' : '(선택) 판단에서 나가는 연결에 적습니다'}
                onCommit={(v) => props.onLabel(e, v)}
              />
            </label>
            <label className="field">
              <span>도착</span>
              <select value={e.target} onChange={(ev) => props.onRetarget(e, ev.target.value)}>
                {targets.filter((n) => n.id !== e.source).map((n) => <option key={n.id} value={n.id}>{nameOf(n.id)}</option>)}
              </select>
            </label>
            <div className="fx-actions">
              <button type="button" className="danger-btn" onClick={props.onDelete}>연결 삭제</button>
            </div>
            <p className="muted small">화살표 끝(또는 시작점)을 끌어 다른 박스에 놓아도 연결을 옮길 수 있습니다.</p>
          </>
        )}
      </aside>
    )
  }

  const n = nodeOf(sel.id)
  if (!n) return <aside className="fx-panel" />

  if (!n.activity) {
    const start = n.kind === 'start'
    const key = start ? 'startEvent' : 'endEvent'
    return (
      <aside className="fx-panel">
        <h3>{start ? '시작 이벤트' : '종료 이벤트'}</h3>
        <label className="field">
          <span>{start ? 'Process 시작 (트리거)' : 'Process 종료 (결과)'}</span>
          <textarea rows={3} value={doc.process[key]} onChange={(e) => props.onProcess({ [key]: e.target.value })} />
        </label>
        <p className="muted small">
          {start ? '시작은 항상 표의 1번 활동으로 이어집니다.' : '다음 단계가 “종료”인 활동과 마지막 행이 여기로 이어집니다.'} 원은 끌어서 다른 레인으로 옮길 수 있습니다.
        </p>
      </aside>
    )
  }

  const a = n.activity
  const out = geo.edges.filter((e) => e.from === a.id)
  const rowIssues = issues.filter((i) => i.rowId === a.id)
  return (
    <aside className="fx-panel">
      <h3>
        {n.seq}번 {a.kind === 'decision' ? '판단' : '활동'}
      </h3>
      {rowIssues.length > 0 && (
        <ul className="issues fx-issues">
          {rowIssues.map((is, k) => <li key={k} className={is.level}><button type="button" tabIndex={-1}>{is.message}</button></li>)}
        </ul>
      )}
      <label className="field">
        <span>유형</span>
        <select value={a.kind} onChange={(e) => props.onPatch(a.id, { kind: e.target.value as Activity['kind'] })}>
          <option value="task">활동</option>
          <option value="decision">◇ 판단</option>
        </select>
      </label>
      <label className="field">
        <span>담당자(역할) = 레인</span>
        <CommitInput
          key={a.id + ':p'}
          value={a.performer}
          list="fx-performers"
          placeholder={NO_PERFORMER}
          onCommit={(v) => props.onPatch(a.id, { performer: v.trim() })}
        />
        <datalist id="fx-performers">{props.performerOptions.map((p) => <option key={p} value={p} />)}</datalist>
      </label>
      <label className="field">
        <span>활동명 (명사+동사)</span>
        <textarea rows={2} value={a.name} onChange={(e) => props.onPatch(a.id, { name: e.target.value })} data-field="fx.name" />
      </label>
      <div className="field">
        <span>시스템/프로그램</span>
        <ToolsCell rowId={a.id} tools={a.tools} knownCustom={props.knownCustomTools} onChange={(tools) => props.onPatch(a.id, { tools })} />
      </div>
      <div className="fx-two">
        <label className="field">
          <span>Input</span>
          <input value={a.input} onChange={(e) => props.onPatch(a.id, { input: e.target.value })} />
        </label>
        <label className="field">
          <span>Output</span>
          <input value={a.output} onChange={(e) => props.onPatch(a.id, { output: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>비고</span>
        <textarea rows={2} value={a.note} onChange={(e) => props.onPatch(a.id, { note: e.target.value })} />
      </label>
      <div className="field">
        <span>다음 단계</span>
        <ul className="fx-links">
          {out.map((e) => (
            <li key={e.id}>
              <button type="button" className="link" onClick={() => props.onSelect({ kind: 'edge', id: e.id })}>
                {e.label ? <b>{e.label} → </b> : '→ '}
                {nameOf(e.target)}
              </button>
            </li>
          ))}
          {out.length === 0 && <li className="muted small">연결 없음</li>}
        </ul>
        {a.next.length === 0 && out.length > 0 && out[0].target !== END_ID && (
          <span className="muted small">표의 다음 단계 칸이 비어 있어 다음 행으로 이어집니다.</span>
        )}
      </div>
      <div className="fx-actions">
        <button type="button" onClick={() => props.onAddAfter(a.id)} title="이 활동 바로 뒤에 새 활동을 끼워 넣습니다">＋ 뒤에 활동 추가</button>
        <button type="button" className="danger-btn" onClick={props.onDelete}>삭제</button>
      </div>
    </aside>
  )
}
