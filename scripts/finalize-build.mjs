// dist/index.html → dist/pi-canvas.html 로 이름 변경
import { renameSync, statSync } from 'node:fs'

renameSync('dist/index.html', 'dist/pi-canvas.html')
const kb = (statSync('dist/pi-canvas.html').size / 1024).toFixed(0)
console.log(`✔ dist/pi-canvas.html (${kb} KB)`)
