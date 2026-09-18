// dist/index.html → 배포용 파일 이름으로 정리하고, 저장소에 포함되는 release/ 로 복사
import { copyFileSync, mkdirSync, renameSync, statSync } from 'node:fs'

renameSync('dist/index.html', 'dist/pi-canvas.html')
mkdirSync('release', { recursive: true })
copyFileSync('dist/pi-canvas.html', 'release/pi-canvas.html')
const kb = (statSync('release/pi-canvas.html').size / 1024).toFixed(0)
console.log(`✔ release/pi-canvas.html (${kb} KB) — 이 파일 하나를 배포하면 됩니다`)
