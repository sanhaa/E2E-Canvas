import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TAXONOMY } from './config/taxonomy'
import { exampleDoc } from './example'
import {
  APP_VERSION, COMMON_DEPTS, PRESET_TOOLS, emptyActivity, isBlankActivity, newDoc, newId, resolvePending, validate,
  type Activity, type PiDoc,
} from './model'
import { clearDraft, deserialize, downloadText, FileFormatError, helpSeen, loadDraft, markHelpSeen, saveDraft, serialize, suggestFileName } from './storage'
import { ActivityTable, focusField, insertAndFocus } from './components/ActivityTable'
import { FlowPreview } from './components/FlowPreview'
import { HelpDialog } from './components/HelpDialog'
import { PasteDialog } from './components/PasteDialog'
import { ProcessInfo } from './components/ProcessInfo'

interface Toast {
  id: number
  text: string
  tone?: 'ok' | 'warn'
  action?: { label: string; run: () => void }
}

const initial = (() => {
  const draft = loadDraft()
  return draft ? { doc: draft.doc, saved: draft.savedToFile, restored: true } : { doc: newDoc(TAXONOMY.id), saved: true, restored: false }
})()

function isEmptyDoc(d: PiDoc) {
  return !d.meta.author && !d.process.name && d.process.activities.every(isBlankActivity)
}

export default function App() {
  const [doc, setDoc] = useState<PiDoc>(initial.doc)
  const [saved, setSaved] = useState(initial.saved)
  const [example, setExample] = useState<PiDoc | null>(null)
  // 행 추가·삭제·이동·붙여넣기 같은 구조 변경만 기록한다 (글자 입력은 브라우저 기본 undo)
  const history = useRef<PiDoc[]>([])
  const [showHelp, setShowHelp] = useState(() => !helpSeen())
  const [pasteText, setPasteText] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(true)
  const [showHints, setShowHints] = useState(true)
  const [toast, setToast] = useState<Toast | null>(
    initial.restored ? { id: 0, text: '이전에 작성하던 내용을 불러왔습니다.' } : null,
  )
  const fileInput = useRef<HTMLInputElement>(null)
  const docRef = useRef(doc)
  docRef.current = doc

  const active = example ?? doc
  const issues = useMemo(() => validate(active), [active])
  const warnCount = issues.filter((i) => i.level === 'warn').length
  const shownIssues = showHints ? issues : issues.filter((i) => i.level === 'warn')

  // ── 임시저장 & 이탈 경고 ──
  useEffect(() => {
    const t = setTimeout(() => saveDraft({ doc, savedToFile: saved }), 300)
    return () => clearTimeout(t)
  }, [doc, saved])
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!saved && !isEmptyDoc(doc)) e.preventDefault()
    }
    // 디바운스 대기 중에 창을 닫아도 마지막 입력까지 임시저장
    const onHide = () => saveDraft({ doc, savedToFile: saved })
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onHide)
    }
  }, [doc, saved])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.action ? 8000 : 4500)
    return () => clearTimeout(t)
  }, [toast])
  const notify = (text: string, extra: Omit<Toast, 'id' | 'text'> = {}) => setToast({ id: Date.now(), text, ...extra })

  // ── 변경 ──
  const update = useCallback(
    (fn: (d: PiDoc) => PiDoc, structural = false) => {
      const apply = (d: PiDoc) => {
        const n = fn(d)
        return { ...n, process: { ...n.process, activities: resolvePending(n.process.activities) } }
      }
      if (example) {
        setExample((d) => (d ? apply(d) : d))
        return
      }
      if (structural) history.current = [...history.current.slice(-29), doc]
      setDoc(apply)
      setSaved(false)
    },
    [example, doc],
  )

  const setActs = (fn: (acts: Activity[]) => Activity[], structural = false) =>
    update((d) => ({ ...d, process: { ...d.process, activities: fn(d.process.activities) } }), structural)

  const undo = () => {
    const prev = history.current.pop()
    if (!prev) return
    setDoc(prev)
    setSaved(false)
  }

  const patchRow = (id: string, patch: Partial<Activity>) => setActs((acts) => acts.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const insertRow = (index: number) => {
    const row = emptyActivity()
    setActs((acts) => [...acts.slice(0, index), row, ...acts.slice(index)], true)
    return row.id
  }
  const deleteRow = (id: string) => {
    const idx = active.process.activities.findIndex((a) => a.id === id)
    const wasBlank = isBlankActivity(active.process.activities[idx])
    setActs((acts) => {
      const rest = acts.filter((a) => a.id !== id)
      return rest.length ? rest : [emptyActivity()]
    }, true)
    if (!wasBlank && !example) notify(`${idx + 1}번 행을 삭제했습니다.`, { action: { label: '되돌리기', run: undo } })
  }
  const moveRow = (id: string, delta: -1 | 1) =>
    setActs((acts) => {
      const i = acts.findIndex((a) => a.id === id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= acts.length) return acts
      const out = [...acts]
      ;[out[i], out[j]] = [out[j], out[i]]
      return out
    }, true)
  const duplicateRow = (id: string) =>
    setActs((acts) => {
      const i = acts.findIndex((a) => a.id === id)
      const copy = { ...acts[i], id: newId(), tools: [...acts[i].tools], next: acts[i].next.map((n) => ({ ...n })) }
      return [...acts.slice(0, i + 1), copy, ...acts.slice(i + 1)]
    }, true)
  const applyPaste = (rows: Activity[], mode: 'append' | 'replace') => {
    setActs((acts) => {
      if (mode === 'replace') return rows
      const kept = [...acts]
      while (kept.length && isBlankActivity(kept[kept.length - 1])) kept.pop()
      return [...kept, ...rows]
    }, true)
    setPasteText(null)
    notify(`${rows.length}개 행을 가져왔습니다.`, example ? {} : { action: { label: '되돌리기', run: undo } })
  }

  // ── 파일 ──
  const save = () => {
    if (example) return
    const current = docRef.current
    const name = suggestFileName(current)
    downloadText(serialize(current), name)
    setSaved(true)
    const remaining = validate(current).filter((i) => i.level === 'warn').length
    notify(
      remaining > 0
        ? `"${name}"(으)로 저장했습니다. 아직 확인할 항목이 ${remaining}개 있습니다.`
        : `"${name}"(으)로 저장했습니다. 이 파일을 메일로 제출하세요.`,
      { tone: remaining > 0 ? 'warn' : 'ok' },
    )
  }
  const confirmDiscard = () => saved || isEmptyDoc(doc) || window.confirm('저장하지 않은 내용이 있습니다. 계속하면 현재 작성 중인 내용이 사라집니다.\n계속할까요?')
  const openFile = async (file: File) => {
    try {
      const loaded = deserialize(await file.text())
      if (!confirmDiscard()) return
      setExample(null)
      setDoc(loaded)
      history.current = []
      setSaved(true)
      notify(`"${file.name}" 파일을 열었습니다.`, { tone: 'ok' })
    } catch (e) {
      notify(e instanceof FileFormatError ? e.message : '파일을 열 수 없습니다.', { tone: 'warn' })
    }
  }
  const newFile = () => {
    if (!confirmDiscard()) return
    setExample(null)
    setDoc(newDoc(TAXONOMY.id))
    history.current = []
    setSaved(true)
    clearDraft()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        // 편집 중인 칸(다음 단계 등)을 먼저 확정한 뒤 최신 문서를 저장
        ;(document.activeElement as HTMLElement | null)?.blur()
        setTimeout(save, 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── 파생 값 ──
  const acts = active.process.activities
  const filled = acts.filter((a) => !isBlankActivity(a))
  const deptOptions = [...new Set([...acts.map((a) => a.dept.trim()).filter(Boolean), ...COMMON_DEPTS])]
  const knownCustomTools = [...new Set(acts.flatMap((a) => a.tools))].filter((t) => !(PRESET_TOOLS as readonly string[]).includes(t))
  const lanes = new Set(filled.map((a) => a.dept.trim()).filter(Boolean))
  const decisions = filled.filter((a) => a.kind === 'decision').length

  const closeHelp = () => { setShowHelp(false); markHelpSeen() }
  const openExample = () => {
    closeHelp()
    setExample(exampleDoc())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>◇</span>
          <div>
            <h1>PI 프로세스 캔버스</h1>
            <span className="sub">사전과제 · L5 활동 나열 <span className="ver">{APP_VERSION}</span></span>
          </div>
        </div>
        <div className="actions">
          <span className={`save-state ${example ? '' : saved ? 'ok' : 'dirty'}`}>
            {example ? '예시 보는 중' : saved ? '파일 저장됨' : '저장 안 됨 · 임시 보관 중'}
          </span>
          <button type="button" onClick={() => setShowHelp(true)}>도움말</button>
          <button type="button" onClick={openExample} disabled={!!example}>예시 보기</button>
          <button type="button" onClick={newFile} disabled={!!example}>새로 만들기</button>
          <button type="button" onClick={() => fileInput.current?.click()}>열기</button>
          <button type="button" className="primary" onClick={save} disabled={!!example} title="Ctrl+S">💾 저장 (제출용)</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) openFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      {example && (
        <div className="example-banner">
          <span>
            <b>작성 예시</b>를 보고 있습니다. 여기서 고친 내용은 저장되지 않습니다.
          </span>
          <button type="button" className="primary" onClick={() => setExample(null)}>내 작성 화면으로 돌아가기</button>
        </div>
      )}

      <div className="layout">
        <main className="main">
          <ProcessInfo
            doc={active}
            issues={issues}
            onMeta={(p) => update((d) => ({ ...d, meta: { ...d.meta, ...p } }))}
            onTaxonomy={(p) => update((d) => ({ ...d, taxonomy: { ...d.taxonomy, ...p, templateId: TAXONOMY.id } }))}
            onProcess={(p) => update((d) => ({ ...d, process: { ...d.process, ...p } }))}
          />

          <section className="card">
            <div className="card-title-row">
              <h2 className="card-title"><span className="step">3</span>L5 활동 목록</h2>
              <div className="card-tools">
                <span className="muted small">엑셀 범위를 복사해 칸에 붙여넣으면 여러 행을 한 번에 가져옵니다</span>
                <button type="button" onClick={() => setPasteText('')}>표 붙여넣기</button>
                <button type="button" onClick={() => insertAndFocus(() => insertRow(acts.length), 'row.dept')}>＋ 행 추가</button>
              </div>
            </div>
            <ActivityTable
              activities={acts}
              issues={shownIssues}
              deptOptions={deptOptions}
              knownCustomTools={knownCustomTools}
              onPatch={patchRow}
              onInsert={insertRow}
              onDelete={deleteRow}
              onMove={moveRow}
              onDuplicate={duplicateRow}
              onPasteTable={setPasteText}
            />
            <div className="table-foot">
              <button type="button" className="add-row" onClick={() => insertAndFocus(() => insertRow(acts.length), 'row.dept')}>＋ 행 추가</button>
              <span className="muted small">Enter: 아래 칸으로 · Shift+Enter: 위 칸으로 · 마지막 행에서 Enter를 누르면 새 행이 생깁니다</span>
            </div>
          </section>

          <section className="card">
            <div className="card-title-row">
              <h2 className="card-title"><span className="step">4</span>순서도 미리보기 <span className="badge">자동 생성</span></h2>
              <div className="card-tools">
                <span className="muted small">박스를 누르면 해당 행으로 이동합니다 · 순서도 편집은 교육 당일 버전에서 제공</span>
                <button type="button" onClick={() => setShowPreview((v) => !v)}>{showPreview ? '접기' : '펼치기'}</button>
              </div>
            </div>
            {showPreview && (filled.length ? (
              <FlowPreview activities={acts} onSelect={(id) => focusField('row.name', id)} />
            ) : (
              <p className="empty">L5 활동을 입력하면 순서도가 여기에 그려집니다.</p>
            ))}
          </section>
        </main>

        <aside className="side">
          <div className="card sticky">
            <h2 className="card-title small">작성 현황</h2>
            <dl className="stats">
              <div><dt>L5 활동</dt><dd>{filled.length}<small>개</small></dd></div>
              <div><dt>부서(레인)</dt><dd>{lanes.size}<small>개</small></dd></div>
              <div><dt>판단</dt><dd>{decisions}<small>개</small></dd></div>
            </dl>
            <div className="issues-head">
              <h2 className="card-title small">
                점검 {warnCount > 0 ? <span className="count warn">{warnCount}</span> : <span className="count ok">✓</span>}
              </h2>
              <label className="check small">
                <input type="checkbox" checked={showHints} onChange={(e) => setShowHints(e.target.checked)} />
                작성 팁 보기
              </label>
            </div>
            {shownIssues.length === 0 ? (
              <p className="all-good">필수 항목을 모두 채웠습니다. 저장해서 제출하세요.</p>
            ) : (
              <ul className="issues">
                {shownIssues.map((is, k) => (
                  <li key={k} className={is.level}>
                    <button type="button" onClick={() => focusField(is.field, is.rowId)}>{is.message}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <footer className="foot">
        PI 프로세스 캔버스 {APP_VERSION} · 프로세스 체계: {TAXONOMY.title} · 입력한 내용은 이 PC에만 보관되며 외부로 전송되지 않습니다
      </footer>

      {showHelp && <HelpDialog onClose={closeHelp} onLoadExample={openExample} />}
      {pasteText !== null && (
        <PasteDialog
          initialText={pasteText}
          hasExisting={filled.length > 0}
          onApply={applyPaste}
          onClose={() => setPasteText(null)}
        />
      )}
      {toast && (
        <div key={toast.id} className={`toast ${toast.tone ?? ''}`} role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button type="button" onClick={() => { toast.action!.run(); setToast(null) }}>{toast.action.label}</button>
          )}
        </div>
      )}
    </div>
  )
}
