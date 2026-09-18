/**
 * 툴 설정은 config/설정.md 에서 읽는다 (빌드 시 HTML 에 함께 포함).
 * 형식 검사는 vite.config.ts 의 빌드 단계에서 하므로 여기서는 결과만 쓴다.
 */
import raw from '../../config/설정.md?raw'
import { parseSettings } from './settingsParser'

export type { TaxNode } from './settingsParser'

export const SETTINGS = parseSettings(raw).settings

export const TAXONOMY = {
  id: SETTINGS.templateId,
  title: SETTINGS.title,
  allowCustom: SETTINGS.allowCustom,
  tree: SETTINGS.tree,
}
