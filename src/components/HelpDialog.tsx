import { Modal } from './Modal'

interface Props {
  onClose: () => void
  onLoadExample: () => void
}

export function HelpDialog({ onClose, onLoadExample }: Props) {
  return (
    <Modal title="사전과제 작성 안내" onClose={onClose} wide>
      <ol className="steps">
        <li>
          <b>① 프로세스 정하기</b>
          <p>L1 › L2 › L3에서 내 업무를 고르고, 그 아래에서 <b>L4 프로세스 1개</b>의 이름을 정합니다.</p>
          <p className="muted">
            L4 범위는 <b>E2E 시작(누가, 무엇을 요청하며 시작되는가)</b>과 <b>종료(어떤 결과가 나오면 끝나는가)</b>로 정합니다.
            인사팀 안에서 끝나지 않아도 됩니다. 현업, 지원자, 타 부서가 등장하는 게 자연스럽습니다.
          </p>
        </li>
        <li>
          <b>② L5 활동 나열하기</b>
          <p>시작부터 종료까지 활동을 순서대로 한 줄씩 적습니다. 권장 분량은 <b>8–20개</b>입니다.</p>
          <table className="help-table">
            <tbody>
              <tr><th>부서</th><td>그 활동을 하는 조직. 순서도에서 가로 레인이 됩니다. (인사팀, 현업 부서, 지원자 …)</td></tr>
              <tr><th>담당자</th><td>부서 안의 역할. (채용담당, 팀장 …)</td></tr>
              <tr><th>활동명</th><td><b>명사+동사</b>로 짧게.</td></tr>
              <tr><th>시스템/도구</th><td>그 활동에 쓰는 시스템·수단. 메일, 엑셀, 전화처럼 수작업 도구도 빠짐없이.</td></tr>
              <tr><th>다음 단계</th><td>비우면 다음 행으로 이어집니다. 되돌아가거나 건너뛸 때만 순번(예: <code>2</code>)이나 <code>종료</code>를 적습니다.</td></tr>
              <tr><th>◇ 판단</th><td>갈림길이 생기는 지점. 다음 단계에 <code>조건→순번</code>을 쉼표로 적습니다. 예: <code>승인→8, 반려→종료</code></td></tr>
              <tr><th>비고</th><td>느끼는 문제점, 대기 시간, 예외 상황 등. 교육 당일 진단 때 활용합니다.</td></tr>
            </tbody>
          </table>
          <div className="good-bad">
            <div><span className="tag good">좋은 예</span> 채용 요청서 검토 · 면접 일정 안내 · 급여 대장 확정</div>
            <div><span className="tag bad">고칠 예</span> 검토 · 요청서를 확인함 · 담당자가 이것저것 처리</div>
          </div>
          <p className="muted">
            엑셀에 정리해 둔 목록이 있다면 범위를 복사해서 표의 아무 칸에 붙여넣으세요(Ctrl+V). 열을 맞춰 한 번에 가져옵니다.
            정형화되지 않은 업무("케이스별로 다름", "담당자 판단")도 있는 그대로 적어 주세요.
          </p>
        </li>
        <li>
          <b>③ 저장해서 제출하기</b>
          <p>
            상단의 <b>[💾 저장]</b>을 누르면 <code>L4명_이름.json</code> 파일이 내려받아집니다. 이 파일을 메일로 제출하세요.
            나중에 이어서 쓰려면 <b>[열기]</b>로 이 파일을 다시 엽니다.
          </p>
          <p className="muted">
            작성 중인 내용은 이 PC의 브라우저에도 임시 보관되지만, 브라우저 설정에 따라 사라질 수 있으니 중간중간 저장해 주세요.
          </p>
        </li>
      </ol>
      <div className="modal-actions">
        <button type="button" onClick={onLoadExample}>작성 예시 보기</button>
        <button type="button" className="primary" onClick={onClose}>시작하기</button>
      </div>
    </Modal>
  )
}
