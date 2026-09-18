import { TAXONOMY, type TaxNode } from '../config/taxonomy'
import type { Issue, PiDoc, TaxRef } from '../model'

interface Props {
  doc: PiDoc
  issues: Issue[]
  onMeta: (patch: Partial<PiDoc['meta']>) => void
  onTaxonomy: (patch: Partial<PiDoc['taxonomy']>) => void
  onProcess: (patch: Partial<PiDoc['process']>) => void
}

const CUSTOM = '__custom'

export function ProcessInfo({ doc, issues, onMeta, onTaxonomy, onProcess }: Props) {
  const warned = new Set(issues.filter((i) => !i.rowId && i.level === 'warn').map((i) => i.field))
  const cls = (field: string) => (warned.has(field) ? 'has-warn' : '')

  const { l1, l2, l3 } = doc.taxonomy
  const find = (list: TaxNode[] | undefined, ref: TaxRef | null) => (ref?.code ? list?.find((n) => n.code === ref.code) : undefined)
  const n1 = find(TAXONOMY.tree, l1)
  const n2 = find(n1?.children, l2)

  const level = (
    key: 'l1' | 'l2' | 'l3',
    label: string,
    options: TaxNode[] | undefined,
    value: TaxRef | null,
    parentCustom: boolean,
    parentMissing: boolean,
    reset: Partial<PiDoc['taxonomy']>,
  ) => {
    const isCustom = parentCustom || (!!value && !value.code)
    const selectValue = !value ? '' : value.code ? value.code : CUSTOM
    return (
      <div className="tax-level">
        <span className="tax-tag">{label}</span>
        {!parentCustom && (
          <select
            className={cls('tax.l1') && !value ? 'has-warn' : ''}
            data-field={`tax.${key}`}
            value={selectValue}
            disabled={parentMissing}
            onChange={(e) => {
              const v = e.target.value
              if (v === '') onTaxonomy({ [key]: null, ...reset })
              else if (v === CUSTOM) onTaxonomy({ [key]: { code: '', name: '' }, ...reset })
              else {
                const node = options?.find((n) => n.code === v)
                if (node) onTaxonomy({ [key]: { code: node.code, name: node.name }, ...reset })
              }
            }}
          >
            <option value="">{parentMissing ? '—' : '선택'}</option>
            {options?.map((n) => <option key={n.code} value={n.code}>{n.name}</option>)}
            {TAXONOMY.allowCustom && <option value={CUSTOM}>직접 입력…</option>}
          </select>
        )}
        {isCustom && (
          <input
            className={`tax-custom ${cls('tax.l1') && !value?.name ? 'has-warn' : ''}`}
            data-field={parentCustom ? `tax.${key}` : undefined}
            value={value?.name ?? ''}
            placeholder={`${label} 이름`}
            onChange={(e) => onTaxonomy({ [key]: { code: '', name: e.target.value } })}
          />
        )}
      </div>
    )
  }

  const l1Custom = !!l1 && !l1.code
  const l2Custom = l1Custom || (!!l2 && !l2.code)

  return (
    <>
      <section className="card">
        <h2 className="card-title"><span className="step">1</span>작성자</h2>
        <div className="form-row">
          <label className="field">
            <span>이름<span className="req">*</span></span>
            <input data-field="meta.author" className={cls('meta.author')} value={doc.meta.author} onChange={(e) => onMeta({ author: e.target.value })} placeholder="홍길동" />
          </label>
          <label className="field">
            <span>소속<span className="req">*</span></span>
            <input data-field="meta.dept" className={cls('meta.dept')} value={doc.meta.dept} onChange={(e) => onMeta({ dept: e.target.value })} placeholder="인사팀" />
          </label>
          <label className="field">
            <span>담당 직무</span>
            <input data-field="meta.job" value={doc.meta.job} onChange={(e) => onMeta({ job: e.target.value })} placeholder="채용, 급여 등" />
          </label>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title"><span className="step">2</span>프로세스 (L1 › L2 › L3 › L4)</h2>
        <div className="tax-row">
          {level('l1', 'L1', TAXONOMY.tree, l1, false, false, { l2: null, l3: null })}
          <span className="tax-sep">›</span>
          {level('l2', 'L2', n1?.children, l2, l1Custom, !l1, { l3: null })}
          <span className="tax-sep">›</span>
          {level('l3', 'L3', n2?.children, l3, l2Custom, !l2, {})}
          <span className="tax-sep">›</span>
          <div className="tax-level grow">
            <span className="tax-tag l4">L4</span>
            <input
              data-field="process.name"
              className={`l4-input ${cls('process.name')}`}
              value={doc.process.name}
              onChange={(e) => onProcess({ name: e.target.value })}
              placeholder="내가 그릴 프로세스 이름 (예: 채용 요청 및 공고)"
            />
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>E2E 시작 (트리거)<span className="req">*</span></span>
            <input data-field="process.startEvent" className={cls('process.startEvent')} value={doc.process.startEvent} onChange={(e) => onProcess({ startEvent: e.target.value })} placeholder="무엇이 일어나면 시작되나요? (예: 현업의 채용 요청)" />
          </label>
          <label className="field">
            <span>E2E 종료 (결과)<span className="req">*</span></span>
            <input data-field="process.endEvent" className={cls('process.endEvent')} value={doc.process.endEvent} onChange={(e) => onProcess({ endEvent: e.target.value })} placeholder="어떤 결과가 나오면 끝나나요? (예: 채용 공고 게시)" />
          </label>
          <label className="field">
            <span>고객<span className="req">*</span></span>
            <input data-field="process.customer" className={cls('process.customer')} value={doc.process.customer} onChange={(e) => onProcess({ customer: e.target.value })} placeholder="이 프로세스의 결과를 받는 사람 (예: 현업 부서)" />
          </label>
          <label className="field">
            <span>프로세스 오너</span>
            <input data-field="process.owner" value={doc.process.owner} onChange={(e) => onProcess({ owner: e.target.value })} placeholder="예: 인사팀장" />
          </label>
          <label className="field">
            <span>발생 빈도</span>
            <input data-field="process.frequency" value={doc.process.frequency} onChange={(e) => onProcess({ frequency: e.target.value })} placeholder="예: 월 8건, 연 2회" />
          </label>
          <label className="field span-all">
            <span>설명</span>
            <input data-field="process.description" value={doc.process.description} onChange={(e) => onProcess({ description: e.target.value })} placeholder="범위, 예외, 참고 사항" />
          </label>
        </div>
      </section>
    </>
  )
}
