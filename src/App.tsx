import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TAXONOMY } from './config/settings'
import { exampleDoc } from './example'
import {
  APP_VERSION, PRESET_TOOLS, emptyActivity, isBlankActivity, newDoc, newId, resolvePending, validate,
  type Activity, type PiDoc,
} from './model'
import { buildWorkbook } from './excelExport'
import { clearDraft, deserialize, downloadBlob, downloadText, FileFormatError, helpSeen, loadDraft, markHelpSeen, saveDraft, serialize, suggestFileName } from './storage'
import { ActivityTable, focusField, insertAndFocus } from './components/ActivityTable'
import { FlowCanvas, type CanvasEdit } from './components/FlowCanvas'
import { computeGeometry, freezeLayout, readLayout, writeLayout } from './flow'
import { HelpDialog } from './components/HelpDialog'
import { PasteDialog } from './components/PasteDialog'
import { ProcessInfo } from './components/ProcessInfo'

interface Toast {
  id: number
  text: string
  tone?: 'ok' | 'warn'
  action?: { label: string; run: () => void }
}

/** 행 추가·삭제·이동·복제·붙여넣기의 되돌리기 정보. 문서 전체가 아니라 이 변경 자체만 되돌리므로,
 *  그 사이에 다른 칸에 입력한 내용은 보존된다. */
type HistoryEntry =
  | { kind: 'insert'; id: string }
  | { kind: 'delete'; index: number; activity: Activity }
  | { kind: 'swap'; idA: string; idB: string }
  | { kind: 'pasteAppend'; addedIds: string[]; poppedBlanks: Activity[] }
  | { kind: 'replace'; previous: Activity[] }
  | ({ kind: 'snapshot' } & Snapshot)

/** 순서도 편집은 활동 목록과 배치(asis)를 함께 바꾸므로 둘을 통째로 되돌린다 */
interface Snapshot {
  acts: Activity[]
  asis: unknown
}

type View = 'table' | 'canvas'

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
  const history = useRef<HistoryEntry[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const [, setHistoryTick] = useState(0)
  const [view, setView] = useState<View>('table')
  const [showHelp, setShowHelp] = useState(() => !helpSeen())
  const [pasteText, setPasteText] = useState<string | null>(null)
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
    (fn: (d: PiDoc) => PiDoc) => {
      const apply = (d: PiDoc) => {
        const n = fn(d)
        return { ...n, process: { ...n.process, activities: resolvePending(n.process.activities) } }
      }
      if (example) {
        setExample((d) => (d ? apply(d) : d))
        return
      }
      setDoc(apply)
      setSaved(false)
    },
    [example],
  )

  const setActs = (fn: (acts: Activity[]) => Activity[]) =>
    update((d) => ({ ...d, process: { ...d.process, activities: fn(d.process.activities) } }))

  const pushHistory = (entry: HistoryEntry) => {
    if (example) return
    history.current = [...history.current.slice(-49), entry]
    redoStack.current = []
    setHistoryTick((t) => t + 1)
  }
  const resetHistory = () => {
    history.current = []
    redoStack.current = []
    setHistoryTick((t) => t + 1)
  }
  const snapshotNow = (): Snapshot => ({ acts: docRef.current.process.activities, asis: docRef.current.process.asis })
  const restore = (snap: Snapshot) => update((d) => ({ ...d, process: { ...d.process, activities: snap.acts, asis: snap.asis } }))

  // 삭제·이동 등 변경 자체만 되돌린다 — 그 사이에 다른 칸에 입력한 내용은 그대로 남는다
  const undo = () => {
    const entry = history.current.pop()
    if (!entry) return
    redoStack.current.push(snapshotNow())
    setHistoryTick((t) => t + 1)
    if (entry.kind === 'snapshot') {
      restore(entry)
    } else if (entry.kind === 'insert') {
      setActs((acts) => {
        const rest = acts.filter((a) => a.id !== entry.id)
        return rest.length ? rest : [emptyActivity()]
      })
    } else if (entry.kind === 'delete') {
      setActs((acts) => {
        const out = [...acts]
        out.splice(Math.min(entry.index, out.length), 0, entry.activity)
        return out
      })
    } else if (entry.kind === 'swap') {
      setActs((acts) => {
        const i = acts.findIndex((a) => a.id === entry.idA)
        const j = acts.findIndex((a) => a.id === entry.idB)
        if (i < 0 || j < 0) return acts
        const out = [...acts]
        ;[out[i], out[j]] = [out[j], out[i]]
        return out
      })
    } else if (entry.kind === 'pasteAppend') {
      setActs((acts) => {
        const withoutAdded = acts.filter((a) => !entry.addedIds.includes(a.id))
        const restored = [...withoutAdded, ...entry.poppedBlanks]
        return restored.length ? restored : [emptyActivity()]
      })
    } else {
      setActs(() => entry.previous)
    }
    setSaved(false)
  }
  const redo = () => {
    const snap = redoStack.current.pop()
    if (!snap) return
    history.current.push({ kind: 'snapshot', ...snapshotNow() })
    setHistoryTick((t) => t + 1)
    restore(snap)
  }

  /** 순서도 캔버스에서 온 편집. 지금 화면의 배치를 고정한 뒤 편집을 적용하고, 되돌리기 한 단계로 기록한다. */
  const commitCanvas = (edit: CanvasEdit) => {
    const before = snapshotNow()
    update((d) => {
      const layout = freezeLayout(computeGeometry(d.process.activities, readLayout(d.process.asis)))
      const r = edit(d.process.activities, layout)
      return {
        ...d,
        process: { ...d.process, activities: r.acts.length ? r.acts : [emptyActivity()], asis: writeLayout(d.process.asis, r.layout) },
      }
    })
    pushHistory({ kind: 'snapshot', ...before })
  }

  const patchRow = (id: string, patch: Partial<Activity>) => setActs((acts) => acts.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const insertRow = (index: number) => {
    const row = emptyActivity()
    setActs((acts) => [...acts.slice(0, index), row, ...acts.slice(index)])
    pushHistory({ kind: 'insert', id: row.id })
    return row.id
  }
  const deleteRow = (id: string) => {
    const idx = active.process.activities.findIndex((a) => a.id === id)
    const activity = active.process.activities[idx]
    const wasBlank = isBlankActivity(activity)
    setActs((acts) => {
      const rest = acts.filter((a) => a.id !== id)
      return rest.length ? rest : [emptyActivity()]
    })
    pushHistory({ kind: 'delete', index: idx, activity })
    if (!wasBlank && !example) notify(`${idx + 1}번 행을 삭제했습니다.`, { action: { label: '되돌리기', run: undo } })
  }
  const moveRow = (id: string, delta: -1 | 1) => {
    const acts = active.process.activities
    const i = acts.findIndex((a) => a.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= acts.length) return
    const otherId = acts[j].id
    setActs((cur) => {
      const ci = cur.findIndex((a) => a.id === id)
      const cj = cur.findIndex((a) => a.id === otherId)
      if (ci < 0 || cj < 0) return cur
      const out = [...cur]
      ;[out[ci], out[cj]] = [out[cj], out[ci]]
      return out
    })
    pushHistory({ kind: 'swap', idA: id, idB: otherId })
  }
  const duplicateRow = (id: string) => {
    const copyId = newId()
    setActs((acts) => {
      const i = acts.findIndex((a) => a.id === id)
      const copy = { ...acts[i], id: copyId, tools: [...acts[i].tools], next: acts[i].next.map((n) => ({ ...n })) }
      return [...acts.slice(0, i + 1), copy, ...acts.slice(i + 1)]
    })
    pushHistory({ kind: 'insert', id: copyId })
  }
  const applyPaste = (rows: Activity[], mode: 'append' | 'replace', events: { startEvent: string; endEvent: string }) => {
    if (mode === 'replace') {
      // 표를 통째로 바꾸면 예전 배치는 의미가 없으므로 순서도도 자동 배치로 돌아간다
      const before = snapshotNow()
      update((d) => ({ ...d, process: { ...d.process, activities: rows, asis: writeLayout(d.process.asis, null) } }))
      pushHistory({ kind: 'snapshot', ...before })
    } else {
      const poppedBlanks: Activity[] = []
      setActs((acts) => {
        const kept = [...acts]
        while (kept.length && isBlankActivity(kept[kept.length - 1])) poppedBlanks.push(kept.pop()!)
        return [...kept, ...rows]
      })
      pushHistory({ kind: 'pasteAppend', addedIds: rows.map((r) => r.id), poppedBlanks })
    }
    // 붙여넣은 표에 '시작'/'종료' 행이 있었으면 그 문구를 채운다 (이미 입력된 값은 덮어쓰지 않는다)
    if (events.startEvent || events.endEvent) {
      update((d) => ({
        ...d,
        process: {
          ...d.process,
          startEvent: !d.process.startEvent && events.startEvent ? events.startEvent : d.process.startEvent,
          endEvent: !d.process.endEvent && events.endEvent ? events.endEvent : d.process.endEvent,
        },
      }))
    }
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
  /** 편집한 순서도(행 순서·담당자·연결)를 과제 엑셀 양식으로 — TO-BE 는 이 엑셀에 적는다 */
  const exportExcel = () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    setTimeout(() => {
      const current = example ?? docRef.current
      const name = suggestFileName(current, 'xlsx')
      const bytes = buildWorkbook(current)
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
      notify(`"${name}"(으)로 내보냈습니다. BDW · ERASK · ERASK To-be 칸은 엑셀에서 작성하세요.`, { tone: 'ok' })
    }, 0)
  }
  const confirmDiscard = () => saved || isEmptyDoc(doc) || window.confirm('저장하지 않은 내용이 있습니다. 계속하면 현재 작성 중인 내용이 사라집니다.\n계속할까요?')
  const openFile = async (file: File) => {
    try {
      const loaded = deserialize(await file.text())
      if (!confirmDiscard()) return
      setExample(null)
      setDoc(loaded)
      resetHistory()
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
    resetHistory()
    setSaved(true)
    clearDraft()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        // 편집 중인 칸(다음 단계 등)을 먼저 확정한 뒤 최신 문서를 저장
        ;(document.activeElement as HTMLElement | null)?.blur()
        setTimeout(save, 0)
      }
      // 입력칸 안에서는 브라우저 기본 되돌리기(글자 단위)를 쓴다
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
      if (mod && !typing && !example) {
        const k = e.key.toLowerCase()
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── 파생 값 ──
  const acts = active.process.activities
  const filled = acts.filter((a) => !isBlankActivity(a))
  const performerOptions = [...new Set(acts.map((a) => a.performer.trim()).filter(Boolean))]
  const knownCustomTools = [...new Set(acts.flatMap((a) => a.tools))].filter((t) => !PRESET_TOOLS.includes(t))
  // 스윔레인은 담당자 기준 (기획서: 여러 담당자를 넘나드는 E2E 흐름이 핵심)
  const lanes = new Set(filled.map((a) => a.performer.trim()))
  const decisions = filled.filter((a) => a.kind === 'decision').length

  const closeHelp = () => { setShowHelp(false); markHelpSeen() }
  const openExample = () => {
    closeHelp()
    setExample(exampleDoc())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className={`app ${view === 'canvas' ? 'canvas-mode' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>◇</span>
          <div>
            <h1>PI 프로세스 캔버스</h1>
            <span className="sub">교육판 · 활동 목록 · 순서도 편집 <span className="ver">{APP_VERSION}</span></span>
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
          <button type="button" onClick={exportExcel} title="편집한 순서도를 과제 엑셀 양식으로 내려받습니다">📊 엑셀 내보내기</button>
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

      <nav className="view-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>
          <span className="step">1</span>과제 정보 · 활동 목록
          <small>{filled.length}개 활동{warnCount > 0 ? ` · 확인 ${warnCount}` : ''}</small>
        </button>
        <button type="button" role="tab" aria-selected={view === 'canvas'} className={view === 'canvas' ? 'on' : ''} onClick={() => setView('canvas')}>
          <span className="step">2</span>순서도 편집
          <small>{lanes.size}개 레인</small>
        </button>
      </nav>

      {view === 'canvas' ? (
        <FlowCanvas
          doc={active}
          issues={shownIssues}
          performerOptions={performerOptions}
          knownCustomTools={knownCustomTools}
          onCommit={commitCanvas}
          onPatch={patchRow}
          onProcess={(p) => update((d) => ({ ...d, process: { ...d.process, ...p } }))}
          onUndo={undo}
          onRedo={redo}
          canUndo={!example && history.current.length > 0}
          canRedo={!example && redoStack.current.length > 0}
          notify={(text, tone) => notify(text, tone ? { tone } : {})}
        />
      ) : (
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
                <button type="button" onClick={() => insertAndFocus(() => insertRow(acts.length), 'row.performer')}>＋ 행 추가</button>
              </div>
            </div>
            <ActivityTable
              activities={acts}
              issues={shownIssues}
              performerOptions={performerOptions}
              knownCustomTools={knownCustomTools}
              onPatch={patchRow}
              onInsert={insertRow}
              onDelete={deleteRow}
              onMove={moveRow}
              onDuplicate={duplicateRow}
              onPasteTable={setPasteText}
            />
            <div className="table-foot">
              <button type="button" className="add-row" onClick={() => insertAndFocus(() => insertRow(acts.length), 'row.performer')}>＋ 행 추가</button>
              <span className="muted small">Enter: 아래 칸으로 · Shift+Enter: 위 칸으로 · 마지막 행에서 Enter를 누르면 새 행이 생깁니다</span>
            </div>
          </section>

        </main>

        <aside className="side">
          <div className="card sticky">
            <h2 className="card-title small">작성 현황</h2>
            <dl className="stats">
              <div><dt>L5 활동</dt><dd>{filled.length}<small>개</small></dd></div>
              <div><dt>담당자(레인)</dt><dd>{lanes.size}<small>개</small></dd></div>
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
      )}

      {view === 'table' && <footer className="foot">
        PI 프로세스 캔버스 {APP_VERSION} · 프로세스 체계: {TAXONOMY.title} · 입력한 내용은 이 PC에만 보관되며 외부로 전송되지 않습니다
      </footer>}

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
