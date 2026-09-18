import { useState } from 'react'
import { formatNext, parseNextText, type NextLink } from '../model'

interface Props {
  next: NextLink[]
  idToSeq: Map<string, number>
  seqToId: (seq: number) => string | undefined
  isDecision: boolean
  onChange: (next: NextLink[]) => void
  rowId: string
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

/** 편집 중에는 입력한 글자를 그대로 두고, 포커스를 벗어날 때 링크로 변환한다. */
export function NextCell({ next, idToSeq, seqToId, isDecision, onChange, rowId, onKeyDown }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const shown = editing ?? formatNext(next, idToSeq)
  const commit = () => {
    if (editing === null) return
    onChange(parseNextText(editing, seqToId))
    setEditing(null)
  }
  return (
    <input
      className="cell-input"
      data-field="row.next"
      data-row={rowId}
      value={shown}
      placeholder={isDecision ? '승인→5, 반려→2' : '(다음 행)'}
      title={'비워 두면 다음 행으로 이어집니다.\n특정 순번으로 가려면 숫자(예: 7), 끝나면 "종료".\n판단 행은 "조건→순번" 을 쉼표로 구분 (예: 승인→5, 반려→종료)'}
      onFocus={() => setEditing(formatNext(next, idToSeq))}
      onChange={(e) => setEditing(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') commit()
        onKeyDown(e)
      }}
    />
  )
}
