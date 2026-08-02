import {
  InputRule,
  Node,
  PasteRule,
  mergeAttributes,
  type Editor,
} from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export type WikiLinkAttrs = {
  title: string
  alias: string | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (attrs: { title: string; alias?: string | null }) => ReturnType
      convertWikiLinks: () => ReturnType
    }
  }
}

/** Match [[title]] or escaped \[\[title\]\] (turndown artifact). */
const WIKI_FIND = /(?:\\\[\\\[|\[\[)([^\]|#\n\\]+)(?:\|([^\]\n\\]+))?(?:\\\]\\\]|\]\])/g

/** Replace plain-text [[title]] in the doc with wikiLink nodes. */
export function convertWikiTextToNodes(editor: Editor): boolean {
  const { state } = editor
  const type = state.schema.nodes.wikiLink
  if (!type) return false

  const matches: { from: number; to: number; title: string; alias: string | null }[] =
    []

  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text
    const re = new RegExp(WIKI_FIND.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      matches.push({
        from: pos + m.index,
        to: pos + m.index + m[0].length,
        title: m[1].trim(),
        alias: m[2]?.trim() || null,
      })
    }
  })

  if (!matches.length) return false

  const tr = state.tr
  for (let i = matches.length - 1; i >= 0; i--) {
    const item = matches[i]
    tr.replaceWith(
      item.from,
      item.to,
      type.create({ title: item.title, alias: item.alias }),
    )
  }
  editor.view.dispatch(tr)
  return true
}

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      title: { default: '' },
      alias: { default: null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-wiki]',
        getAttrs: (el) => {
          const element = el as HTMLElement
          const title =
            element.getAttribute('data-wiki') || element.textContent || ''
          const aliasAttr = element.getAttribute('data-alias')
          const text = element.textContent || title
          return {
            title,
            alias: aliasAttr && aliasAttr !== title ? aliasAttr : text !== title ? text : null,
          }
        },
      },
      {
        tag: 'a.wiki-link',
        getAttrs: (el) => {
          const element = el as HTMLElement
          const title =
            element.getAttribute('data-wiki') ||
            decodeURIComponent(element.getAttribute('href')?.replace(/^#wiki:/, '') || '') ||
            element.textContent ||
            ''
          return { title, alias: element.textContent !== title ? element.textContent : null }
        },
      },
    ]
  },

  renderHTML({ node }) {
    const title = String(node.attrs.title || '')
    const alias = node.attrs.alias ? String(node.attrs.alias) : null
    return [
      'span',
      mergeAttributes({
        'data-wiki': title,
        'data-alias': alias || title,
        class: 'wiki-link',
        contenteditable: 'false',
      }),
      alias || title,
    ]
  },

  addCommands() {
    return {
      insertWikiLink:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              title: attrs.title,
              alias: attrs.alias ?? null,
            },
          }),
      convertWikiLinks:
        () =>
        ({ editor }) => {
          convertWikiTextToNodes(editor)
          return true
        },
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]|#\n]+)(?:\|([^\]\n]+))?\]\]$/,
        handler: ({ range, match, chain }) => {
          const title = match[1].trim()
          const alias = match[2]?.trim() || null
          if (!title) return null
          chain()
            .deleteRange(range)
            .insertContentAt(range.from, {
              type: this.name,
              attrs: { title, alias },
            })
            .run()
        },
      }),
    ]
  },

  addPasteRules() {
    return [
      new PasteRule({
        find: /\[\[([^\]|#\n]+)(?:\|([^\]\n]+))?\]\]/g,
        handler: ({ range, match, chain }) => {
          const title = match[1].trim()
          const alias = match[2]?.trim() || null
          if (!title) return null
          chain()
            .deleteRange(range)
            .insertContentAt(range.from, {
              type: this.name,
              attrs: { title, alias },
            })
            .run()
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    const key = new PluginKey('wikiLinkAutoConvert')
    return [
      new Plugin({
        key,
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null

          const type = newState.schema.nodes.wikiLink
          if (!type) return null

          const matches: {
            from: number
            to: number
            title: string
            alias: string | null
          }[] = []

          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return
            if (!node.text.includes('[[')) return
            const re = new RegExp(WIKI_FIND.source, 'g')
            let m: RegExpExecArray | null
            while ((m = re.exec(node.text)) !== null) {
              matches.push({
                from: pos + m.index,
                to: pos + m.index + m[0].length,
                title: m[1].trim(),
                alias: m[2]?.trim() || null,
              })
            }
          })

          if (!matches.length) return null

          const tr = newState.tr
          for (let i = matches.length - 1; i >= 0; i--) {
            const item = matches[i]
            tr.replaceWith(
              item.from,
              item.to,
              type.create({ title: item.title, alias: item.alias }),
            )
          }
          return tr
        },
      }),
    ]
  },
})

const WIKI_RE = /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g

/** Before markdown→HTML: turn wiki links into spans TipTap can parse. */
export function wikiMarkdownToHtmlSpans(md: string): string {
  return md.replace(WIKI_RE, (_full, title: string, alias?: string) => {
    const t = escapeAttr(title.trim())
    const label = escapeHtml((alias || title).trim())
    const a = alias ? escapeAttr(alias.trim()) : t
    return `<span data-wiki="${t}" data-alias="${a}" class="wiki-link">${label}</span>`
  })
}

/** After HTML→markdown: restore wiki syntax TipTap/turndown may leave as spans. */
export function htmlSpansToWikiMarkdown(html: string): string {
  return html.replace(
    /<span[^>]*data-wiki="([^"]*)"[^>]*>(.*?)<\/span>/gi,
    (_full, title: string, label: string) => {
      const t = decodeAttr(title)
      const plain = stripTags(label).trim()
      if (!plain || plain === t) return `[[${t}]]`
      return `[[${t}|${plain}]]`
    },
  )
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttr(s: string) {
  return escapeHtml(s)
}

function decodeAttr(s: string) {
  return s
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&')
}

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, '')
}
