import { Modal } from './Modal'

interface Props {
  onClose: () => void
  onLoadExample: () => void
}

export function HelpDialog({ onClose, onLoadExample }: Props) {
  return (
    <Modal title="사용 안내" onClose={onClose} wide>
      <ol className="steps">
        <li>
          <b>① 프로세스 정하기</b>
          <p>L1 › L2 › L3에서 내 업무를 고르고, 그 아래에서 <b>L4 프로세스 1개</b>의 이름을 정합니다.</p>
          <p className="muted">
            L4 범위는 <b>E2E 시작(누가, 무엇을 요청하며 시작되는가)</b>과 <b>종료(어떤 결과가 나오면 끝나는가)</b>로 정합니다.
            인사팀 안에서 끝나지 않아도 됩니다. 현업, 지원자, 타 부서·담당자가 등장하는 게 자연스럽습니다.
          </p>
        </li>
        <li>
          <b>② L5 활동 나열하기 — 엑셀에서 붙여넣기</b>
          <p>
            과제 엑셀 양식의 <b>No. 머리글 행부터 종료 행까지</b> 복사해서 활동 표의 아무 칸에 붙여넣으세요(Ctrl+V).
            직접 한 줄씩 적어도 됩니다. 권장 분량은 <b>8–20개</b>입니다.
          </p>
          <table className="help-table">
            <tbody>
              <tr><th>담당자</th><td>그 활동을 하는 사람·역할. 순서도에서 가로 레인이 됩니다. (채용담당, 팀장, 지원자 …) 인사팀 담당자만 계속 나오지 않는지 확인해 보세요.</td></tr>
              <tr><th>활동명</th><td><b>명사+동사</b>로 짧게.</td></tr>
              <tr><th>시스템/프로그램</th><td>그 활동에 쓰는 시스템·수단. 메일, 엑셀, 전화처럼 수작업 도구도 빠짐없이.</td></tr>
              <tr><th>Input / Output</th><td>그 활동에 들어가는 자료와 나오는 결과물. (예: Input 채용 요청서 → Output 채용 품의서)</td></tr>
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
            정형화되지 않은 업무("케이스별로 다름", "담당자 판단")도 있는 그대로 적어 주세요.
          </p>
        </li>
        <li>
          <b>③ 순서도 편집하기</b>
          <p>위의 <b>[2 순서도 편집]</b> 탭에서 표로 만든 순서도를 다듬습니다. 여기서 고친 내용은 표에 그대로 반영됩니다.</p>
          <table className="help-table">
            <tbody>
              <tr><th>추가</th><td>[활동]·[판단]을 캔버스로 끌어다 놓기. 선택한 박스의 [＋ 뒤에 활동 추가]는 그 사이에 끼워 넣습니다.</td></tr>
              <tr><th>연결</th><td>박스 테두리의 점을 다른 박스로 끌기. 연결선을 누른 뒤 화살표 끝을 끌면 다른 박스로 옮겨집니다.</td></tr>
              <tr><th>담당자</th><td>박스를 다른 레인으로 끌면 담당자가 바뀝니다. 왼쪽 레인 이름을 누르면 한꺼번에 바꿀 수 있습니다.</td></tr>
              <tr><th>수정·삭제</th><td>박스를 더블클릭해 이름 수정, 선택하고 Delete 로 삭제. 실수하면 Ctrl+Z.</td></tr>
              <tr><th>번호</th><td>[번호 다시 매기기]는 순서도의 왼쪽→오른쪽 순서대로 행 번호를 정리합니다.</td></tr>
            </tbody>
          </table>
        </li>
        <li>
          <b>④ 엑셀로 내려받기 · 저장하기</b>
          <p>
            <b>[📊 엑셀 내보내기]</b>는 편집한 순서도를 과제 엑셀 양식으로 내려받습니다. <b>BDW · ERASK · ERASK To-be</b> 칸은 엑셀에서 작성합니다.
            <b>[💾 저장]</b>은 <code>L4명_이름.json</code> 파일로 저장하며, 나중에 <b>[열기]</b>로 순서도 배치까지 그대로 이어서 작업할 수 있습니다.
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
