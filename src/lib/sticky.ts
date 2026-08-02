export type StickyNote = {
  id: string
  quote: string
  note: string
  /** Local asset URL like /api/assets/stickies/xxx.png */
  image?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  updatedAt: string
}

export type StickyPayload = {
  note: string
  image?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
}

export function normalizeQuote(q: string) {
  return q.replace(/\s+/g, ' ').trim()
}

export function newStickyId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function findStickyForQuote(stickies: StickyNote[], quote: string) {
  const q = normalizeQuote(quote)
  if (!q) return null
  return (
    stickies.find((s) => normalizeQuote(s.quote) === q) ||
    stickies.find(
      (s) =>
        q.includes(normalizeQuote(s.quote)) ||
        normalizeQuote(s.quote).includes(q),
    ) ||
    null
  )
}

export function upsertSticky(
  stickies: StickyNote[],
  quote: string,
  payload: StickyPayload,
  existingId?: string,
): StickyNote[] {
  const q = normalizeQuote(quote)
  const now = new Date().toISOString()
  if (!q) return stickies

  const idx = stickies.findIndex(
    (s) => s.id === existingId || normalizeQuote(s.quote) === q,
  )
  const nextItem: StickyNote = {
    id: idx >= 0 ? stickies[idx].id : newStickyId(),
    quote: q,
    note: payload.note || '',
    image: payload.image ?? null,
    imageWidth: payload.imageWidth ?? null,
    imageHeight: payload.imageHeight ?? null,
    updatedAt: now,
  }

  if (idx >= 0) {
    const next = [...stickies]
    next[idx] = nextItem
    return next
  }
  return [...stickies, nextItem]
}

export function removeSticky(stickies: StickyNote[], id: string) {
  return stickies.filter((s) => s.id !== id)
}

export function parseStickies(raw: unknown): StickyNote[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const o = item as Record<string, unknown>
      const quote = normalizeQuote(String(o.quote || ''))
      if (!quote) return null
      return {
        id: String(o.id || newStickyId()),
        quote,
        note: String(o.note || ''),
        image: o.image ? String(o.image) : null,
        imageWidth: typeof o.imageWidth === 'number' ? o.imageWidth : null,
        imageHeight: typeof o.imageHeight === 'number' ? o.imageHeight : null,
        updatedAt: String(o.updatedAt || new Date().toISOString()),
      } satisfies StickyNote
    })
    .filter(Boolean) as StickyNote[]
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

export function fitImageSize(
  naturalW: number,
  naturalH: number,
  maxW = 480,
  maxH = 520,
) {
  if (!naturalW || !naturalH) return { w: maxW, h: 200 }
  const scale = Math.min(1, maxW / naturalW, maxH / naturalH)
  return {
    w: Math.max(120, Math.round(naturalW * scale)),
    h: Math.max(80, Math.round(naturalH * scale)),
  }
}
