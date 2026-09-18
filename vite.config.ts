import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { parseSettings, summarize } from './src/config/settingsParser.ts'

const SETTINGS_MD = 'config/설정.md'

/** config/설정.md 형식 검사 — 잘못되면 몇 번째 줄이 문제인지 알려주고 빌드를 멈춘다 */
function checkSettings(): Plugin {
  return {
    name: 'check-settings-md',
    buildStart() {
      this.addWatchFile(SETTINGS_MD)
      const { settings, errors } = parseSettings(readFileSync(SETTINGS_MD, 'utf8'))
      if (errors.length) this.error(`\n${SETTINGS_MD} 을(를) 고쳐 주세요:\n  - ${errors.join('\n  - ')}\n`)
      console.log(`✔ ${SETTINGS_MD}: ${summarize(settings)}`)
    },
  }
}

// 결과물은 외부 요청이 전혀 없는 HTML 파일 하나(release/pi-canvas.html)
export default defineConfig({
  base: './',
  plugins: [checkSettings(), react(), viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true },
})
