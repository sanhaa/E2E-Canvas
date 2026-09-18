# PI 프로세스 캔버스

PI·E2E 재설계 교육용 프로세스 작성 툴. 결과물은 **HTML 파일 하나**(`dist/pi-canvas.html`)이고, 설치·서버·인터넷 없이 Edge에서 더블클릭으로 실행된다.

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
npm run build      # → dist/pi-canvas.html
node scripts/smoke.mjs   # 빌드 결과를 실제 브라우저로 열어 사전과제 흐름 전체 점검 (Playwright)
```

`smoke` 는 Playwright Chromium 이 필요하다(`npx playwright install chromium`). sudo 없이 WSL 에서 `libnss3` 등이 없다고 나오면 `apt-get download libnspr4 libnss3 libasound2t64` 후 `dpkg-deb -x` 로 풀고 `LD_LIBRARY_PATH` 로 지정한다.

사내 프록시 인증서 때문에 npm 이 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 로 실패하면 `NODE_OPTIONS=--use-system-ca` 를 붙인다.

## L1–L3 체계 교체 (강사 확정본 수령 시)

1. `src/config/taxonomy.ts` 의 `tree` 를 확정본으로 바꾼다.
2. `id` 를 새 값으로 바꾸고(예: `hr-edu-2026-09`), 자유 입력을 막으려면 `allowCustom: false`.
3. `npm run build` 후 `dist/pi-canvas.html` 을 배포한다.

파일에는 L1–L3의 **코드와 이름**이 함께 저장되므로, 체계를 바꿔도 이미 제출된 파일은 그대로 열린다.

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
| `src/config/taxonomy.ts` | 강사 지정 L1–L3 체계 |
| `src/components/` | 화면 컴포넌트 |
