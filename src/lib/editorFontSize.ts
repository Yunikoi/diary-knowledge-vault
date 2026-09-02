const STORAGE_KEY = 'dkv-editor-font-size'
export const EDITOR_FONT_DEFAULT = 17
export const EDITOR_FONT_MIN = 12
export const EDITOR_FONT_MAX = 28
export const EDITOR_FONT_STEP = 1

export function loadEditorFontSize(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const n = Number(raw)
    if (Number.isFinite(n)) {
      return Math.min(EDITOR_FONT_MAX, Math.max(EDITOR_FONT_MIN, Math.round(n)))
    }
  } catch {
    /* ignore */
  }
  return EDITOR_FONT_DEFAULT
}

export function saveEditorFontSize(px: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(px))
  } catch {
    /* ignore */
  }
}

export function clampEditorFontSize(px: number) {
  return Math.min(EDITOR_FONT_MAX, Math.max(EDITOR_FONT_MIN, Math.round(px)))
}
