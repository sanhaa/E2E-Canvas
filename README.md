# PI 프로세스 캔버스

PI·E2E 재설계 교육용 프로세스 작성 툴. 결과물은 **HTML 파일 하나**([`release/pi-canvas.html`](release/pi-canvas.html))이고, 설치·서버·인터넷 없이 Edge에서 더블클릭으로 실행된다.

> **배포할 파일은 `release/pi-canvas.html` 하나뿐이다.** npm·서버는 개발할 때만 필요하다. GitHub에서는 파일을 연 뒤 [Download raw file] 버튼으로 받는다.

- 기획서: [docs/기획서.md](docs/기획서.md)
- 교육생 배포 안내문: [docs/배포안내.md](docs/배포안내.md)

## 현재 릴리스: R1 (사전과제판)

작성자 정보 → L1–L3 선택(강사 지정 체계) → L4 입력 → **L5 활동 표 입력** → `.json` 저장·제출.
순서도 미리보기(읽기 전용), 엑셀 붙여넣기, 입력 점검, 임시저장, 작성 예시를 포함한다.

## 개발

Node 24 이상.

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm test           # 단위 테스트
npm run build      # → release/pi-canvas.html (배포용, 저장소에 포함)
node scripts/smoke.mjs   # 빌드 결과를 실제 브라우저로 열어 사전과제 흐름 전체 점검 (Playwright)
```

`smoke` 는 Playwright Chromium 이 필요하다(`npx playwright install chromium`). sudo 없이 WSL 에서 `libnss3` 등이 없다고 나오면 `apt-get download libnspr4 libnss3 libasound2t64` 후 `dpkg-deb -x` 로 풀고 `LD_LIBRARY_PATH` 로 지정한다.

사내 프록시 인증서 때문에 npm 이 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 로 실패하면 `NODE_OPTIONS=--use-system-ca` 를 붙인다.

## 설정 바꾸기 — [`config/설정.md`](config/설정.md) 하나만 고친다

코드(.ts/.tsx)를 몰라도 되도록, 운영 중에 바뀌는 값은 모두 이 md 파일에 있다. 빌드하면 툴에 반영된다.

| 바꾸고 싶은 것 | 설정.md 의 위치 |
|---|---|
| L1–L3 프로세스 체계 (강사 확정본) | `## 프로세스 체계` — 들여쓰기 목록 |
| 목록에 없는 L1–L3 직접 입력 허용 여부 | `## 기본 정보` → `직접 입력 허용: 예/아니오` |
| 체계 버전 표시 | `## 기본 정보` → `체계 ID`, `체계 이름` |
| 권장 L5 활동 개수 | `## 작성 규칙` |
| 시스템/도구 기본 칩 | `## 시스템/도구 기본 목록` |
| 부서 자동완성 | `## 부서 자동완성 목록` |
| 진단 용어 정의 (R2) | `## 진단 용어` |

1. `config/설정.md` 를 고친다 (GitHub 웹에서 연필 아이콘으로 바로 수정해도 된다).
2. `npm run build` — 형식이 틀리면 **몇 번째 줄이 문제인지** 알려주고 멈춘다.
3. 갱신된 `release/pi-canvas.html` 을 커밋·배포한다.

제출 파일에는 L1–L3의 **코드와 이름**이 함께 저장되므로, 체계를 바꿔도 이미 제출된 파일은 그대로 열린다.
레벨 구조 자체(예: L5 대신 L4까지만 나열)를 바꾸는 것은 설정이 아니라 코드 변경이다.

## 파일 포맷

`format: "pi-canvas"`, `version: 1`. 구조는 기획서 7장 참고. R2·R3는 필드를 **추가만** 하므로 R1 파일은 이후 버전에서 그대로 열린다. 형식 변경 시 `src/model.ts` 의 `FORMAT_VERSION` 을 올리고 `src/storage.ts` 의 `deserialize` 에 변환을 추가한다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/model.ts` | 파일 포맷 타입, 다음 단계 파싱, 입력 점검 |
| `src/storage.ts` | 파일 저장/열기, 브라우저 임시저장 |
| `src/pasteImport.ts` | 엑셀 붙여넣기(TSV) 파싱, 열 자동 인식 |
| `src/layout.ts` | 미리보기 순서도 배치 (레인 = 부서, 열 = 행 순서) |
| `src/example.ts` | 작성 예시 (경력 채용 › 채용 요청 및 공고) |
| `config/설정.md` | **운영 설정** (L1–L3 체계, 도구·부서 목록, 작성 규칙, 진단 용어) |
| `src/config/settingsParser.ts` | 설정.md 파서 (빌드 시 형식 검사) |
| `src/components/` | 화면 컴포넌트 |
