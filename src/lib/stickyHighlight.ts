import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { normalizeQuote, type StickyNote } from './sticky'

declare module '@tiptap/core' {
  interface Storage {
    stickyHighlight: {
      stickies: StickyNote[]
    }
  }

  interface Commands<ReturnType> {
    stickyHighlight: {
      setStickyHighlights: (stickies: StickyNote[]) => ReturnType
    }
  }
}

function findRanges(doc: ProseMirrorNode, quote: string) {
  const q = normalizeQuote(quote)
  const ranges: { from: number; to: number }[] = []
  if (!q) return ranges

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text
    let from = 0
    while (from < text.length) {
      const idx = text.indexOf(q, from)
      if (idx < 0) break
      ranges.push({ from: pos + idx, to: pos + idx + q.length })
      from = idx + q.length
    }
  })
  return ranges
}

const key = new PluginKey<StickyNote[]>('stickyHighlight')

export const StickyHighlight = Extension.create({
  name: 'stickyHighlight',

  addStorage() {
    return {
      stickies: [] as StickyNote[],
    }
  },

  addCommands() {
    return {
      setStickyHighlights:
        (stickies) =>
        ({ editor }) => {
          editor.storage.stickyHighlight.stickies = stickies
          editor.view.dispatch(editor.state.tr.setMeta(key, stickies))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin({
        key,
        state: {
          init: () => extension.storage.stickies as StickyNote[],
          apply(tr, value) {
            const meta = tr.getMeta(key) as StickyNote[] | undefined
            if (meta) return meta
            return value
          },
        },
        props: {
          decorations(state) {
            const stickies =
              key.getState(state) || (extension.storage.stickies as StickyNote[])
            const decos: Decoration[] = []
            for (const sticky of stickies) {
              for (const range of findRanges(state.doc, sticky.quote)) {
                decos.push(
                  Decoration.inline(range.from, range.to, {
                    class: 'sticky-mark',
                    'data-sticky-id': sticky.id,
                    title: sticky.image
                      ? sticky.note
                        ? `🖼 ${sticky.note.slice(0, 60)}`
                        : '🖼 图片便利贴'
                      : sticky.note
                        ? sticky.note.slice(0, 80)
                        : '便利贴',
                  }),
                )
              }
            }
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
