"""사전과제 엑셀 예시 생성: samples/사전과제_엑셀예시.xlsx

표의 머리글(순번·유형·부서·담당자·활동명·시스템/도구·다음 단계·비고)은
툴의 붙여넣기 자동 인식(src/pasteImport.ts)과 맞춰 두었다.
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parent.parent / "samples" / "사전과제_엑셀예시.xlsx"

HEADERS = ["순번", "유형", "부서", "담당자", "활동명", "시스템/도구", "다음 단계", "비고"]
WIDTHS = [7, 8, 14, 16, 30, 24, 22, 44]

EXAMPLES = [
    {
        "sheet": "예시① 입사 처리",
        "info": {
            "이름": "김지원", "소속": "인사팀", "담당 직무": "입사·온보딩",
            "L1": "인사", "L2": "입사·온보딩", "L3": "입사 처리", "L4": "경력 입사자 입사 처리",
            "E2E 시작 (트리거)": "최종 합격자 입사 확정 (처우 협의 완료)",
            "E2E 종료 (결과)": "입사자 첫 출근 및 업무 환경 준비 완료",
            "고객": "입사자, 현업 부서",
            "프로세스 오너": "인사팀장", "발생 빈도": "월 10건",
        },
        "rows": [
            ("활동", "인사팀", "채용담당", "입사 확정 통보", "메일, 전화", "", ""),
            ("활동", "인사팀", "입사담당", "입사 서류 안내", "메일", "", "제출 서류 목록을 매번 메일로 새로 작성"),
            ("활동", "입사자", "", "입사 서류 제출", "메일, 종이/출력", "", "원본 서류는 첫 출근일에 지참"),
            ("판단", "인사팀", "입사담당", "입사 서류 보완 필요 여부 판단", "엑셀", "보완 필요→5, 이상 없음→6", "누락 여부를 엑셀 체크리스트로 확인"),
            ("활동", "입사자", "", "입사 서류 보완 제출", "메일", "4", ""),
            ("활동", "인사팀", "입사담당", "인사정보 등록", "HRIS, 엑셀", "", "엑셀 입사자 대장과 HRIS에 이중 입력"),
            ("활동", "인사팀", "입사담당", "IT 계정 생성 요청", "메일", "", ""),
            ("활동", "IT", "시스템 담당", "사내 계정·메일 생성", "그룹웨어", "", "요청이 누락되면 첫 출근일에 계정 없음"),
            ("활동", "인사팀", "입사담당", "좌석·PC 준비 요청", "메일, 메신저", "", ""),
            ("활동", "총무", "자산 담당", "좌석·PC 배정", "엑셀", "", "장비 재고를 엑셀로 관리해 확인에 1~2일 소요"),
            ("활동", "인사팀", "급여담당", "급여 계좌·4대보험 등록", "HRIS, EDI", "", "4대보험 취득신고 기한(입사 후 14일) 관리 필요"),
            ("활동", "현업 부서", "팀장", "멘토·첫 주 업무 지정", "메일", "", "팀마다 준비 수준 편차가 큼"),
            ("활동", "인사팀", "입사담당", "입사 오리엔테이션 진행", "대면, 종이/출력", "", ""),
            ("활동", "입사자", "", "보안 서약서 서명", "종이/출력", "", "종이에 서명한 뒤 스캔해 보관"),
        ],
    },
    {
        "sheet": "예시② 성과 평가",
        "info": {
            "이름": "박성과", "소속": "인사팀", "담당 직무": "평가",
            "L1": "인사", "L2": "평가", "L3": "성과 평가", "L4": "상반기 성과평가 운영",
            "E2E 시작 (트리거)": "평가 시즌 도래 (연간 인사 일정)",
            "E2E 종료 (결과)": "평가 결과 확정 및 피드백 완료",
            "고객": "임직원, 경영진",
            "프로세스 오너": "인사팀장", "발생 빈도": "연 2회",
        },
        "rows": [
            ("활동", "인사팀", "평가담당", "평가 일정·기준 수립", "엑셀, 워드", "", ""),
            ("판단", "경영진", "인사 임원", "평가 계획 승인 여부 판단", "전자결재", "승인→3, 보완 요청→1", ""),
            ("활동", "인사팀", "평가담당", "평가 대상자 명단 추출", "HRIS, 엑셀", "", "휴직자·전입자는 수기로 보정"),
            ("활동", "인사팀", "평가담당", "평가 안내 공지", "메일, 그룹웨어", "", ""),
            ("활동", "임직원", "", "자기평가 작성", "HRIS", "", ""),
            ("활동", "인사팀", "평가담당", "미제출자 독촉", "메일, 전화, 메신저", "", "제출률을 엑셀로 집계해 개별 연락 (마감 전후 1주)"),
            ("활동", "현업 부서", "1차 평가자(팀장)", "1차 평가 입력", "HRIS", "", ""),
            ("활동", "현업 부서", "2차 평가자(본부장)", "2차 평가 입력", "HRIS", "", "본부장 일정 때문에 지연이 잦음"),
            ("활동", "인사팀", "평가담당", "평가 등급 분포 검토", "HRIS, 엑셀", "", "HRIS에서 내려받아 엑셀로 등급 비율 계산"),
            ("판단", "인사팀", "평가담당", "등급 분포 조정 필요 여부 판단", "", "조정 필요→11, 이상 없음→12", ""),
            ("활동", "현업 부서", "2차 평가자(본부장)", "평가 등급 조정", "HRIS, 메일", "9", ""),
            ("활동", "경영진", "인사위원회", "평가 결과 확정", "대면, 종이/출력", "", "회의 자료 출력물 준비에 2~3일"),
            ("활동", "인사팀", "평가담당", "평가 결과 통보", "HRIS, 메일", "", ""),
            ("활동", "현업 부서", "팀장", "평가 피드백 면담", "대면", "", "면담 실시 여부를 확인할 방법이 없음"),
            ("판단", "임직원", "", "이의 신청 여부 판단", "", "이의 신청→16, 없음→종료", ""),
            ("활동", "인사팀", "평가담당", "이의 신청 검토·회신", "메일, 엑셀", "", ""),
        ],
    },
]

BLUE = "2F5BD3"
thin = Side(style="thin", color="C9D0DC")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
HEAD_FILL = PatternFill("solid", fgColor=BLUE)
INFO_FILL = PatternFill("solid", fgColor="EEF2FB")
DEC_FILL = PatternFill("solid", fgColor="F4EFFF")
TABLE_MARK = PatternFill("solid", fgColor="FFF4D6")
WRAP = Alignment(vertical="center", wrap_text=True)
CENTER = Alignment(horizontal="center", vertical="center")


def setup_columns(ws):
    for i, w in enumerate(WIDTHS, start=1):
        ws.column_dimensions[chr(64 + i)].width = w


def write_sheet(ws, title, info, rows, blank_rows=0):
    setup_columns(ws)
    ws["A1"] = title
    ws["A1"].font = Font(size=14, bold=True)
    ws["A2"] = (
        "① [과제 정보]는 툴 화면의 '작성자'와 '프로세스' 칸에 직접 입력합니다.   "
        "② [L5 활동 목록]은 노란 머리글 행부터 마지막 행까지 범위를 선택해 복사(Ctrl+C)한 뒤, 툴 표의 아무 칸에 붙여넣습니다(Ctrl+V)."
    )
    ws["A2"].font = Font(size=10, color="6B4D00")
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("A2:H2")
    ws.row_dimensions[2].height = 32

    r = 4
    ws.cell(r, 1, "[과제 정보]").font = Font(bold=True, color=BLUE)
    r += 1
    for label, value in info.items():
        a = ws.cell(r, 1, label)
        a.font = Font(bold=True, size=10)
        a.fill = INFO_FILL
        a.border = BOX
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)
        b = ws.cell(r, 3, value)
        b.border = BOX
        ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=6)
        r += 1

    r += 1
    ws.cell(r, 1, "[L5 활동 목록]  ▼ 이 아래 머리글 행부터 복사").font = Font(bold=True, color=BLUE)
    r += 1
    head_row = r
    for c, h in enumerate(HEADERS, start=1):
        cell = ws.cell(r, c, h)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = HEAD_FILL
        cell.alignment = CENTER
        cell.border = BOX
    ws.cell(r - 1, 1).fill = TABLE_MARK

    data = [(i + 1, *row) for i, row in enumerate(rows)]
    data += [(len(rows) + i + 1, "활동", "", "", "", "", "", "") for i in range(blank_rows)]
    for seq, kind, dept, performer, name, tools, nxt, note in data:
        r += 1
        values = [seq, kind, dept, performer, name, tools, nxt, note]
        for c, v in enumerate(values, start=1):
            cell = ws.cell(r, c, v)
            cell.border = BOX
            cell.alignment = CENTER if c in (1, 2) else WRAP
            if kind == "판단":
                cell.fill = DEC_FILL
        ws.cell(r, 5).font = Font(bold=True)

    # 유형 칸 드롭다운
    dv = DataValidation(type="list", formula1='"활동,판단"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"B{head_row + 1}:B{r}")
    ws.freeze_panes = ws.cell(head_row + 1, 1)
    ws.sheet_view.zoomScale = 100
    return head_row, r


def write_guide(ws):
    ws.column_dimensions["A"].width = 18
    ws.column_dimensions["B"].width = 90
    ws["A1"] = "사전과제 엑셀 작성 안내"
    ws["A1"].font = Font(size=14, bold=True)
    lines = [
        ("이 파일은", "PI 프로세스 캔버스(pi-canvas.html)에 붙여넣을 수 있는 엑셀 예시입니다. 엑셀로 먼저 정리하고 싶은 분은 '빈 양식' 시트를 쓰세요."),
        ("시트 구성", "예시① 입사 처리 · 예시② 성과 평가 · 빈 양식"),
        ("붙여넣는 방법", "툴에서 작성자·프로세스 정보를 입력한 뒤, 시트의 [L5 활동 목록] 머리글 행부터 마지막 행까지 선택 → Ctrl+C → 툴의 활동 표 아무 칸에 Ctrl+V → 열이 맞는지 확인하고 [가져오기]."),
        ("유형", "활동 또는 판단. 판단은 갈림길(승인/반려 등)이 생기는 지점입니다."),
        ("부서", "그 활동을 하는 조직. 순서도에서 가로 레인이 됩니다. 인사팀이 아닌 현업·입사자·타 부서도 그대로 적습니다."),
        ("활동명", "명사+동사로 짧게. 예) 입사 서류 안내, 평가 등급 분포 검토"),
        ("시스템/도구", "쉼표로 구분. 메일·엑셀·전화·종이처럼 수작업 도구도 빠짐없이. 예) HRIS, 엑셀"),
        ("다음 단계", "비워 두면 다음 행으로 이어집니다. 되돌아가거나 건너뛸 때만 순번이나 '종료'를 적습니다. 판단 행은 '조건→순번'을 쉼표로 구분. 예) 승인→3, 반려→종료"),
        ("비고", "문제점, 대기 시간, 예외 상황. 교육 당일 진단에 활용합니다."),
        ("제출", "엑셀 파일이 아니라, 툴에서 [💾 저장]으로 만든 .json 파일을 제출합니다."),
    ]
    for i, (k, v) in enumerate(lines, start=3):
        a = ws.cell(i, 1, k)
        a.font = Font(bold=True)
        a.fill = INFO_FILL
        a.alignment = Alignment(vertical="top")
        b = ws.cell(i, 2, v)
        b.alignment = Alignment(wrap_text=True, vertical="top")
        a.border = b.border = BOX


def main():
    wb = Workbook()
    write_guide(wb.active)
    wb.active.title = "사용법"
    for ex in EXAMPLES:
        ws = wb.create_sheet(ex["sheet"])
        write_sheet(ws, f"사전과제 예시 — {ex['info']['이름']} ({ex['info']['L4']})", ex["info"], ex["rows"])
    blank_info = {k: "" for k in EXAMPLES[0]["info"]}
    write_sheet(wb.create_sheet("빈 양식"), "사전과제 빈 양식", blank_info, [], blank_rows=20)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f"✔ {OUT}")


if __name__ == "__main__":
    main()
