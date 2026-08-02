const WIKI_RE = /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g

export function extractWikiLinks(text: string): string[] {
  return [...text.matchAll(WIKI_RE)].map((m) => m[1].trim())
}

/** Turn [[Title|alias]] into clickable placeholders before markdown render */
export function wikiToHtmlPlaceholders(md: string): string {
  return md.replace(WIKI_RE, (_full, title: string, alias?: string) => {
    const t = title.trim()
    const label = (alias || t).trim()
    return `<a class="wiki-link" data-wiki="${encodeURIComponent(t)}" href="#">${escapeHtml(label)}</a>`
  })
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function insertWikiLink(content: string, selectionStart: number, selectionEnd: number, title: string) {
  const selected = content.slice(selectionStart, selectionEnd)
  const link = selected ? `[[${title}|${selected}]]` : `[[${title}]]`
  return {
    content: content.slice(0, selectionStart) + link + content.slice(selectionEnd),
    cursor: selectionStart + link.length,
  }
}
