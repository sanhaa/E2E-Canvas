import { FORMAT, FORMAT_VERSION, APP_VERSION, emptyActivity, isBlankActivity, type Activity, type PiDoc, type TaxRef } from './model'

const DRAFT_KEY = 'pi-canvas:draft:v1'
const HELP_SEEN_KEY = 'pi-canvas:help-seen'

// ───────────────────────── 파일 ─────────────────────────

export function serialize(doc: PiDoc): string {
  const out: PiDoc = {
    ...doc,
    meta: { ...doc.meta, updatedAt: new Date().toISOString(), appVersion: APP_VERSION },
    process: { ...doc.process, activities: doc.process.activities.filter((a) => !isBlankActivity(a)) },
  }
  return JSON.stringify(out, null, 2)
}

export class FileFormatError extends Error {}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const taxRef = (v: unknown): TaxRef | null =>
  v && typeof v === 'object' && typeof (v as TaxRef).name === 'string' ? { code: str((v as TaxRef).code), name: (v as TaxRef).name } : null

/** 불완전하거나 수작업으로 고친 파일도 최대한 열리도록 필드를 하나씩 정규화한다. */
export function deserialize(text: string): PiDoc {
  let raw: any
  try {
    raw = JSON.parse(text)
  } catch {
    throw new FileFormatError('JSON 파일 형식이 아닙니다.')
  }
  if (!raw || raw.format !== FORMAT) throw new FileFormatError('PI 프로세스 캔버스에서 저장한 파일이 아닙니다.')
  if (typeof raw.version !== 'number' || raw.version > FORMAT_VERSION)
    throw new FileFormatError('더 새로운 버전의 툴에서 저장한 파일입니다. 최신 버전의 툴로 열어 주세요.')

  const m = raw.meta ?? {}
  const t = raw.taxonomy ?? {}
  const p = raw.process ?? {}
  const acts: Activity[] = Array.isArray(p.activities)
    ? p.activities.map((a: any) => ({
        id: str(a?.id) || emptyActivity().id,
        kind: a?.kind === 'decision' ? 'decision' : 'task',
        dept: str(a?.dept),
        performer: str(a?.performer),
        name: str(a?.name),
        tools: Array.isArray(a?.tools) ? a.tools.filter((x: unknown) => typeof x === 'string') : [],
        next: Array.isArray(a?.next)
          ? a.next.filter((n: any) => typeof n?.to === 'string').map((n: any) => (n.label ? { to: n.to, label: String(n.label) } : { to: n.to }))
          : [],
        note: str(a?.note),
      }))
    : []
  if (acts.length === 0) acts.push(emptyActivity())

  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    meta: {
      author: str(m.author), dept: str(m.dept), job: str(m.job),
      createdAt: str(m.createdAt) || new Date().toISOString(),
      updatedAt: str(m.updatedAt), appVersion: str(m.appVersion),
    },
    taxonomy: { templateId: str(t.templateId), l1: taxRef(t.l1), l2: taxRef(t.l2), l3: taxRef(t.l3) },
    process: {
      name: str(p.name), startEvent: str(p.startEvent), endEvent: str(p.endEvent), customer: str(p.customer),
      owner: str(p.owner), frequency: str(p.frequency), description: str(p.description),
      activities: acts,
      asis: p.asis ?? null,
      tobe: p.tobe ?? null,
    },
  }
}

export function suggestFileName(doc: PiDoc): string {
  const clean = (s: string) => s.trim().replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '')
  const l4 = clean(doc.process.name) || 'L4프로세스'
  const who = clean(doc.meta.author) || '이름없음'
  return `${l4}_${who}.json`
}

export function downloadText(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ───────────────────────── 브라우저 임시저장 ─────────────────────────
// 파일이 원본이고, 여기는 창을 실수로 닫았을 때를 위한 복구용이다.

export interface Draft {
  doc: PiDoc
  savedToFile: boolean
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { doc: deserialize(JSON.stringify(parsed.doc)), savedToFile: !!parsed.savedToFile }
  } catch {
    return null
  }
}

export function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* 저장소 사용 불가 환경 — 파일 저장으로만 동작 */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* noop */
  }
}

export function helpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markHelpSeen() {
  try {
    localStorage.setItem(HELP_SEEN_KEY, '1')
  } catch {
    /* noop */
  }
}
