import { useEffect, useRef, useState } from 'react'
import { PRESET_TOOLS } from '../model'
import { normalizeTool } from '../pasteImport'

interface Props {
  tools: string[]
  /** 다른 행에서 쓴 사용자 정의 도구 — 빠른 선택용 */
  knownCustom: string[]
  onChange: (tools: string[]) => void
  rowId: string
}

export function ToolsCell({ tools, knownCustom, onChange, rowId }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (t: string) => onChange(tools.includes(t) ? tools.filter((x) => x !== t) : [...tools, t])
  const addDraft = () => {
    const t = normalizeTool(draft)
    if (t && !tools.includes(t)) onChange([...tools, t])
    setDraft('')
  }
  const suggestions = knownCustom.filter((t) => !PRESET_TOOLS.includes(t))

  return (
    <div className="tools-cell" ref={ref}>
      <button
        type="button"
        className="tools-trigger"
        data-field="row.tools"
        data-row={rowId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
        title="시스템/도구 선택"
      >
        {tools.length === 0 ? <span className="placeholder">선택…</span> : tools.map((t) => <span key={t} className="chip">{t}</span>)}
      </button>
      {open && (
        <div className="tools-pop" role="dialog" aria-label="시스템/도구 선택">
          <div className="tools-group">
            {PRESET_TOOLS.map((t) => (
              <button type="button" key={t} className={`chip-toggle ${tools.includes(t) ? 'on' : ''}`} onClick={() => toggle(t)}>
                {t}
              </button>
            ))}
          </div>
          {(suggestions.length > 0 || tools.some((t) => !PRESET_TOOLS.includes(t))) && (
            <div className="tools-group">
              {[...new Set([...suggestions, ...tools.filter((t) => !PRESET_TOOLS.includes(t))])].map((t) => (
                <button type="button" key={t} className={`chip-toggle custom ${tools.includes(t) ? 'on' : ''}`} onClick={() => toggle(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className="tools-add">
            <input
              value={draft}
              autoFocus
              placeholder="기타 시스템/도구 (예: SAP, 채용사이트) + Enter"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return // 한글 조합 중 Enter 중복 방지
                if (e.key === 'Enter') { e.preventDefault(); addDraft() }
                if (e.key === 'Escape') setOpen(false)
              }}
            />
            <button type="button" onClick={addDraft}>추가</button>
          </div>
          <div className="tools-foot">
            <button type="button" className="link" onClick={() => onChange([])}>모두 해제</button>
            <button type="button" className="primary small" onClick={() => setOpen(false)}>확인</button>
          </div>
        </div>
      )}
    </div>
  )
}
