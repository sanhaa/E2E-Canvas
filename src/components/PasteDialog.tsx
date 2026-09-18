import { useMemo, useState } from 'react'
import type { Activity } from '../model'
import { guessColumns, parseTSV, ROLE_LABELS, rowsToActivities, type ColumnRole, type PasteGuess } from '../pasteImport'
import { Modal } from './Modal'

interface Props {
  initialText: string
  hasExisting: boolean
  onApply: (acts: Activity[], mode: 'append' | 'replace') => void
  onClose: () => void
}

const ROLES = Object.keys(ROLE_LABELS) as ColumnRole[]

export function PasteDialog({ initialText, hasExisting, onApply, onClose }: Props) {
  const [text, setText] = useState(initialText)
  const rows = useMemo(() => parseTSV(text), [text])
  const [override, setOverride] = useState<{ text: string; guess: PasteGuess } | null>(null)
  const guess = override && override.text === text ? override.guess : guessColumns(rows)
  const setGuess = (g: PasteGuess) => setOverride({ text, guess: g })
  const width = Math.max(0, ...rows.map((r) => r.length))
  const body = guess.hasHeader ? rows.slice(1) : rows
  const hasName = guess.roles.includes('name')

  const apply = (mode: 'append' | 'replace') => {
    const acts = rowsToActivities(rows, guess).filter((a) => a.name || a.dept)
    if (acts.length) onApply(acts, mode)
  }

  return (
    <Modal title="표 붙여넣기" onClose={onClose} wide>
      <p className="muted">
        엑셀에서 범위를 복사(Ctrl+C)해 아래에 붙여넣으세요. 각 열이 어떤 칸인지 확인한 뒤 가져옵니다.
        <br />"다음 단계"의 순번은 <b>붙여넣은 표 기준</b>으로 해석합니다.
      </p>
      <textarea
        className="paste-area"
        value={text}
        autoFocus={!initialText}
        placeholder={'부서\t담당자\t활동명\t시스템/도구\n현업 부서\t팀장\t채용 요청서 작성\t엑셀, 메일'}
        onChange={(e) => setText(e.target.value)}
      />
      {rows.length > 0 && (
        <>
          <label className="check">
            <input type="checkbox" checked={guess.hasHeader} onChange={(e) => setGuess({ ...guess, hasHeader: e.target.checked })} />
            첫 줄은 제목(헤더) 행
          </label>
          <div className="table-wrap preview-table">
            <table>
              <thead>
                <tr>
                  {Array.from({ length: width }, (_, c) => (
                    <th key={c}>
                      <select
                        value={guess.roles[c] ?? 'ignore'}
                        onChange={(e) => {
                          const roles = Array.from({ length: width }, (_, i) => guess.roles[i] ?? 'ignore') as ColumnRole[]
                          const role = e.target.value as ColumnRole
                          // 같은 역할은 한 열에만
                          if (role !== 'ignore') roles.forEach((r, i) => { if (r === role) roles[i] = 'ignore' })
                          roles[c] = role
                          setGuess({ ...guess, roles })
                        }}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guess.hasHeader && (
                  <tr className="header-row">
                    {Array.from({ length: width }, (_, c) => <td key={c}>{rows[0][c] ?? ''}</td>)}
                  </tr>
                )}
                {body.slice(0, 6).map((r, ri) => (
                  <tr key={ri}>
                    {Array.from({ length: width }, (_, c) => <td key={c} className={guess.roles[c] === 'ignore' ? 'ignored' : ''}>{r[c] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {body.length > 6 && <p className="muted small">… 외 {body.length - 6}행</p>}
          {!hasName && <p className="warn-text">‘활동명’ 열을 지정해 주세요.</p>}
        </>
      )}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>취소</button>
        {hasExisting && (
          <button type="button" disabled={!hasName || body.length === 0} onClick={() => apply('replace')}>
            기존 목록을 지우고 가져오기
          </button>
        )}
        <button type="button" className="primary" disabled={!hasName || body.length === 0} onClick={() => apply('append')}>
          {body.length}행 {hasExisting ? '뒤에 추가' : '가져오기'}
        </button>
      </div>
    </Modal>
  )
}
