import { flushSync } from 'react-dom'
import { isBlankActivity, seqMaps, type Activity, type Issue, type NextLink } from '../model'
import { NextCell } from './NextCell'
import { ToolsCell } from './ToolsCell'

interface Props {
  activities: Activity[]
  issues: Issue[]
  deptOptions: string[]
  knownCustomTools: string[]
  onPatch: (id: string, patch: Partial<Activity>) => void
  onInsert: (index: number) => string
  onDelete: (id: string) => void
  onMove: (id: string, delta: -1 | 1) => void
  onDuplicate: (id: string) => void
  onPasteTable: (text: string) => void
}

const TEXT_FIELDS = ['row.dept', 'row.performer', 'row.name', 'row.next', 'row.note'] as const

export function focusField(field: string, rowId?: string) {
  const sel = rowId ? `[data-field="${field}"][data-row="${rowId}"]` : `[data-field="${field}"]`
  const go = (el: HTMLElement) => {
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  // 이미 있는 칸은 즉시 이동해야 Enter 직후 빠르게 친 글자가 이전 칸에 들어가지 않는다.
  // 방금 추가한 행은 아직 그려지지 않았으므로 다음 프레임에 이동한다.
  const el = document.querySelector<HTMLElement>(sel)
  if (el) go(el)
  else requestAnimationFrame(() => {
    const later = document.querySelector<HTMLElement>(sel)
    if (later) go(later)
  })
}

/** 행을 추가하고 즉시 그 칸으로 이동. 동기 렌더링으로 Enter 직후 입력한 글자가 새 행에 들어가게 한다. */
export function insertAndFocus(insert: () => string, field: string) {
  const id = flushSync(insert)
  focusField(field, id)
}

export function ActivityTable(props: Props) {
  const { activities, issues, deptOptions, knownCustomTools, onPatch, onInsert, onDelete, onMove, onDuplicate, onPasteTable } = props
  const { idToSeq, seqToId } = seqMaps(activities)

  const rowIssues = new Map<string, Issue[]>()
  for (const is of issues) if (is.rowId) rowIssues.set(is.rowId, [...(rowIssues.get(is.rowId) ?? []), is])
  const cellClass = (rowId: string, field: string) => {
    const list = (rowIssues.get(rowId) ?? []).filter((i) => i.field === field)
    if (list.some((i) => i.level === 'warn')) return 'has-warn'
    if (list.length) return 'has-hint'
    return ''
  }

  /** Enter: 아래 행 같은 칸으로 (마지막 행이면 새 행 추가). Shift+Enter: 위 행. */
  const onCellKey = (e: React.KeyboardEvent<HTMLElement>, index: number, field: string) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    if (e.shiftKey) {
      const prev = activities[index - 1]
      if (prev) focusField(field, prev.id)
      return
    }
    const below = activities[index + 1]
    if (below) focusField(field, below.id)
    else insertAndFocus(() => onInsert(index + 1), field)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain')
    if (text.includes('\t') || text.trim().includes('\n')) {
      e.preventDefault()
      onPasteTable(text)
    }
  }

  return (
    <div className="table-wrap">
      <table className="act-table">
        <colgroup>
          <col style={{ width: 38 }} />
          <col style={{ width: 88 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 100 }} />
          <col />
          <col style={{ width: 180 }} />
          <col style={{ width: 132 }} />
          <col style={{ width: 144 }} />
          <col style={{ width: 128 }} />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>유형</th>
            <th>부서<span className="req">*</span></th>
            <th>담당자(역할)</th>
            <th>활동명 (명사+동사)<span className="req">*</span></th>
            <th>시스템/도구</th>
            <th title="비우면 다음 행으로 이어집니다">다음 단계</th>
            <th>비고</th>
            <th aria-label="행 편집" />
          </tr>
        </thead>
        <tbody>
          {activities.map((a, i) => {
            const msgs = rowIssues.get(a.id) ?? []
            // 예시 문구는 첫 행과 빈 행에만 — 채워진 행마다 반복되면 입력값처럼 보여 혼란스럽다
            const showExamples = i === 0 || isBlankActivity(a)
            const text = (field: (typeof TEXT_FIELDS)[number], key: 'dept' | 'performer' | 'name' | 'note', placeholder: string, list?: string) => (
              <input
                className={`cell-input ${cellClass(a.id, field)}`}
                data-field={field}
                data-row={a.id}
                value={a[key]}
                list={list}
                placeholder={showExamples ? placeholder : ''}
                onChange={(e) => onPatch(a.id, { [key]: e.target.value })}
                onKeyDown={(e) => onCellKey(e, i, field)}
                onPaste={onPaste}
              />
            )
            return (
              <tr key={a.id} className={a.kind === 'decision' ? 'is-decision' : ''}>
                <td className="seq">
                  <span title={msgs.map((m) => m.message).join('\n') || undefined}>
                    {i + 1}
                    {msgs.some((m) => m.level === 'warn') ? <i className="dot warn" /> : msgs.length ? <i className="dot hint" /> : null}
                  </span>
                </td>
                <td>
                  <select
                    className="cell-input"
                    data-field="row.kind"
                    data-row={a.id}
                    value={a.kind}
                    onChange={(e) => onPatch(a.id, { kind: e.target.value as Activity['kind'] })}
                  >
                    <option value="task">활동</option>
                    <option value="decision">◇ 판단</option>
                  </select>
                </td>
                <td>{text('row.dept', 'dept', '예: 인사팀', 'dept-options')}</td>
                <td>{text('row.performer', 'performer', '예: 채용담당')}</td>
                <td>{text('row.name', 'name', a.kind === 'decision' ? '예: 채용 승인 여부 판단' : '예: 채용 요청서 검토')}</td>
                <td>
                  <ToolsCell rowId={a.id} tools={a.tools} knownCustom={knownCustomTools} onChange={(tools) => onPatch(a.id, { tools })} />
                </td>
                <td className={cellClass(a.id, 'row.next')}>
                  <NextCell
                    rowId={a.id}
                    next={a.next}
                    idToSeq={idToSeq}
                    seqToId={seqToId}
                    isDecision={a.kind === 'decision'}
                    onChange={(next: NextLink[]) => onPatch(a.id, { next })}
                    onKeyDown={(e) => onCellKey(e, i, 'row.next')}
                  />
                </td>
                <td>{text('row.note', 'note', '문제점·특이사항')}</td>
                <td className="row-actions">
                  <button type="button" title="위로" disabled={i === 0} onClick={() => onMove(a.id, -1)}>↑</button>
                  <button type="button" title="아래로" disabled={i === activities.length - 1} onClick={() => onMove(a.id, 1)}>↓</button>
                  <button type="button" title="아래에 행 추가" onClick={() => insertAndFocus(() => onInsert(i + 1), 'row.dept')}>＋</button>
                  <button type="button" title="행 복제" onClick={() => onDuplicate(a.id)}>⧉</button>
                  <button type="button" title="행 삭제" className="danger" onClick={() => onDelete(a.id)}>✕</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <datalist id="dept-options">
        {deptOptions.map((d) => <option key={d} value={d} />)}
      </datalist>
    </div>
  )
}
