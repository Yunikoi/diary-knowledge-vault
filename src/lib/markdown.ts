import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

/** Turn [[wiki]] into clickable placeholders before markdown parse. */
export function renderMarkdown(source: string): string {
  const withWiki = source.replace(
    /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g,
    (_full, target: string, alias?: string) => {
      const name = target.trim()
      const label = (alias ?? name).trim()
      const safeName = encodeURIComponent(name)
      return `<a class="wiki-link" href="#wiki:${safeName}" data-wiki="${escapeAttr(name)}">${escapeHtml(label)}</a>`
    },
  )
  return marked.parse(withWiki, { async: false }) as string
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttr(s: string) {
  return escapeHtml(s).replaceAll("'", '&#39;')
}

export function extractWikiLinks(source: string): string[] {
  const set = new Set<string>()
  const re = /\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    set.add(m[1].trim())
  }
  return [...set]
}
