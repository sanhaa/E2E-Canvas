// 빌드된 dist/pi-canvas.html 을 실제 브라우저(file://)로 열어 사전과제 흐름 전체를 점검한다.
// 사용: npm run build && node scripts/smoke.mjs [스크린샷 폴더]
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const shotDir = resolve(process.argv[2] ?? 'dist/smoke')
mkdirSync(shotDir, { recursive: true })
const url = 'file://' + resolve('dist/pi-canvas.html')

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'ko-KR' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('dialog', (d) => d.accept())
// 외부 요청이 하나라도 있으면 사내망에서 깨진다
const external = []
page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()) })

const step = (name) => console.log('•', name)
const assert = (cond, msg) => { if (!cond) throw new Error('검증 실패: ' + msg) }
const shot = (name) => page.screenshot({ path: `${shotDir}/${name}.png` }).catch((e) => console.log('  (스크린샷 생략: ' + e.message.split('\n')[0] + ')'))

await page.goto(url)
step('첫 실행 도움말')
await page.getByRole('dialog', { name: '사전과제 작성 안내' }).waitFor()
await shot('01-help')
await page.getByRole('button', { name: '시작하기' }).click()

step('작성자·프로세스 입력')
await page.locator('[data-field="meta.author"]').fill('김테스트')
await page.locator('[data-field="meta.dept"]').fill('인사팀')
await page.locator('[data-field="tax.l1"]').selectOption({ label: '인사' })
await page.locator('[data-field="tax.l2"]').selectOption({ label: '보상' })
await page.locator('[data-field="tax.l3"]').selectOption({ label: '급여' })
await page.locator('[data-field="process.name"]').fill('월 급여 지급')
await page.locator('[data-field="process.startEvent"]').fill('근태 마감')
await page.locator('[data-field="process.endEvent"]').fill('급여 입금 및 명세서 발송')
await page.locator('[data-field="process.customer"]').fill('임직원')

step('표 입력 + Enter 이동 (한글)')
const rowInputs = (field) => page.locator(`[data-field="${field}"]`)
await rowInputs('row.dept').nth(0).fill('인사팀')
await rowInputs('row.dept').nth(0).press('Enter')
await page.keyboard.type('재무팀')
await rowInputs('row.dept').nth(2).fill('인사팀')
await rowInputs('row.name').nth(0).fill('근태 데이터 수집')
await rowInputs('row.name').nth(1).fill('급여 대장 검토')
await rowInputs('row.name').nth(2).fill('급여 확정 여부 판단')
await rowInputs('row.name').nth(2).press('Enter') // 마지막 행 → 새 행
assert((await rowInputs('row.name').count()) === 4, '마지막 행 Enter 로 새 행 생성')
await page.keyboard.type('급여 이체')
await rowInputs('row.dept').nth(3).fill('재무팀')
assert((await rowInputs('row.name').nth(2).inputValue()) === '급여 확정 여부 판단', 'Enter 직후 입력이 이전 행에 섞이지 않음')
assert((await rowInputs('row.name').nth(3).inputValue()) === '급여 이체', '새 행에 입력')
assert((await rowInputs('row.dept').nth(0).inputValue()) === '인사팀' && (await rowInputs('row.dept').nth(1).inputValue()) === '재무팀', '부서 Enter 이동')

step('판단 행 + 아직 없는 순번 연결')
await page.locator('[data-field="row.kind"]').nth(2).selectOption('decision')
await rowInputs('row.next').nth(2).fill('확정→4, 수정→2, 보류→6')
await rowInputs('row.next').nth(2).blur()
assert((await page.locator('.issues').innerText()).includes('"6"번이 없습니다'), '없는 순번 경고')

step('도구 선택 팝업')
await page.locator('[data-field="row.tools"]').nth(0).click()
await page.locator('.tools-pop').getByRole('button', { name: 'HRIS' }).click()
await page.locator('.tools-pop').getByRole('button', { name: '엑셀' }).click()
await page.locator('.tools-pop input').fill('근태시스템')
await page.locator('.tools-pop input').press('Enter')
await page.locator('.tools-pop').getByRole('button', { name: '확인' }).click()
assert((await page.locator('[data-field="row.tools"]').nth(0).innerText()).includes('근태시스템'), '사용자 정의 도구 추가')

step('엑셀 붙여넣기 (헤더 포함) → 뒤에 추가')
await page.getByRole('button', { name: '표 붙여넣기' }).click()
await page.locator('.paste-area').fill('부서\t활동명\t시스템\n재무팀\t이체 결과 확인\t이메일, Excel\n인사팀\t급여 명세서 발송\tHRIS')
await page.getByRole('button', { name: /2행 뒤에 추가/ }).click()
assert((await rowInputs('row.name').count()) === 6, '붙여넣기 후 6행')
assert(!(await page.locator('.issues').innerText()).includes('"6"번이 없습니다'), '6번 행이 생기면 보류 링크 확정')
assert((await rowInputs('row.next').nth(2).inputValue()) === '확정→4, 수정→2, 보류→6', '다음 단계 표시')

step('행 이동 후에도 링크 유지')
await page.locator('.row-actions').nth(1).getByTitle('아래로').click() // 2번 ↔ 3번
assert((await rowInputs('row.next').nth(1).inputValue()) === '확정→4, 수정→3, 보류→6', '이동 후 순번 재계산')

step('행 삭제 → 되돌리기')
await page.locator('.row-actions').nth(5).getByTitle('행 삭제').click()
assert((await rowInputs('row.name').count()) === 5, '삭제')
await page.locator('.toast').getByRole('button', { name: '되돌리기' }).click()
assert((await rowInputs('row.name').count()) === 6, '되돌리기')

step('순서도 미리보기')
await page.locator('.flow .task').first().waitFor()
const tasks = await page.locator('.flow .task').count()
const gws = await page.locator('.flow .gw').count()
assert(tasks === 5 && gws === 1, `미리보기 노드 수 task=${tasks} gw=${gws}`)
const laneNames = (await page.locator('.lane-label').allInnerTexts()).join(',')
assert(laneNames === '인사팀,재무팀', '레인 ' + laneNames)
await shot('02-filled')
await page.locator('.flow-scroll').screenshot({ path: `${shotDir}/02b-flow.png` }).catch(() => {})

step('저장(다운로드)')
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /저장/ }).click()])
assert(dl.suggestedFilename() === '월_급여_지급_김테스트.json', '파일명 ' + dl.suggestedFilename())
const savedPath = `${shotDir}/${dl.suggestedFilename()}`
await dl.saveAs(savedPath)
const saved = JSON.parse(readFileSync(savedPath, 'utf8'))
assert(saved.format === 'pi-canvas' && saved.version === 1, '포맷')
assert(saved.taxonomy.l3.name === '급여' && saved.process.activities.length === 6, '저장 내용')
assert(saved.process.activities[1].next.length === 3, '판단 링크 저장')
assert((await page.locator('.save-state').innerText()) === '파일 저장됨', '저장 상태')

step('새로고침 → 임시저장 복구')
await rowInputs('row.note').nth(0).fill('마감 지연 잦음')
await page.reload()
assert((await rowInputs('row.note').nth(0).inputValue()) === '마감 지연 잦음', '임시저장 복구')
assert(!(await page.getByRole('dialog').count()), '두 번째 실행에는 도움말 자동 표시 안 함')

step('예시 보기 → 돌아가기 (내 작업 보존)')
await page.getByRole('button', { name: '예시 보기' }).click()
assert((await page.locator('[data-field="process.name"]').inputValue()) === '채용 요청 및 공고', '예시 로드')
await page.locator('.flow .task').first().waitFor()
await shot('03-example')
await page.locator('.flow-scroll').screenshot({ path: `${shotDir}/03b-example-flow.png` }).catch(() => {})
await page.getByRole('button', { name: '내 작성 화면으로 돌아가기' }).click()
assert((await page.locator('[data-field="process.name"]').inputValue()) === '월 급여 지급', '내 작업 보존')

step('새로 만들기 → 저장 파일 열기')
await page.getByRole('button', { name: '새로 만들기' }).click()
assert((await page.locator('[data-field="process.name"]').inputValue()) === '', '새 문서')
await page.locator('input[type=file]').setInputFiles(savedPath)
await page.locator('.toast.ok').waitFor()
assert((await page.locator('[data-field="process.name"]').inputValue()) === '월 급여 지급', '파일 열기')
assert((await rowInputs('row.name').count()) === 6, '열기 후 행 수')

step('잘못된 파일 열기')
await page.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') })
await page.locator('.toast.warn').waitFor()

step('셀에 엑셀 범위 직접 붙여넣기 (Ctrl+V) → 가져오기 창')
await rowInputs('row.note').nth(0).focus()
await page.evaluate(() => {
  const dt = new DataTransfer()
  dt.setData('text/plain', '인사팀\t담당\t지급 결과 보고\n인사팀\t담당\t급여 마감 회의')
  document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
})
await page.getByRole('dialog', { name: '표 붙여넣기' }).waitFor()
assert((await page.locator('.preview-table tbody tr').count()) === 2, '붙여넣기 미리보기 2행')
await page.getByRole('dialog').getByRole('button', { name: '취소' }).click()

step('노트북 화면 (1366×768)')
await page.setViewportSize({ width: 1366, height: 768 })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
assert(overflow <= 0, '페이지 가로 넘침 ' + overflow)
const tableScroll = await page.locator('.table-wrap').first().evaluate((el) => el.scrollWidth - el.clientWidth)
assert(tableScroll <= 0, '1366px 에서 표 가로 스크롤 ' + tableScroll)
await shot('05-laptop')
await page.locator('.act-table').scrollIntoViewIfNeeded()
await shot('06-laptop-table')

await shot('04-reopened')
assert(errors.length === 0, '콘솔 오류: ' + errors.join('\n'))
assert(external.length === 0, '외부 요청: ' + external.join(', '))
console.log(`\n✔ 모든 점검 통과 · 스크린샷: ${shotDir}`)
await browser.close()
