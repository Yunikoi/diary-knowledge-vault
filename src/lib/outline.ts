import type { Editor } from '@tiptap/react'

export type OutlineItem = {
  level: number
  text: string
  pos: number
  index: number
}

export function extractOutlineFromEditor(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    items.push({
      level: Number(node.attrs.level) || 1,
      text: node.textContent.trim() || '无标题',
      pos,
      index: items.length,
    })
  })
  return items
}

export function extractOutlineFromMarkdown(md: string): OutlineItem[] {
  const items: OutlineItem[] = []
  const re = /^(#{1,6})\s+(.+)$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(md || '')) !== null) {
    items.push({
      level: m[1].length,
      text: m[2].trim() || '无标题',
      pos: m.index,
      index: items.length,
    })
  }
  return items
}

/** Heading whose start is at or before the cursor. */
export function activeOutlineIndex(editor: Editor, items: OutlineItem[]): number {
  if (!items.length) return -1
  const pos = editor.state.selection.from
  let active = 0
  for (let i = 0; i < items.length; i++) {
    if (items[i].pos <= pos) active = i
    else break
  }
  return active
}

export function jumpToEditorHeading(editor: Editor, pos: number) {
  editor.chain().focus().setTextSelection(pos + 1).run()
  requestAnimationFrame(() => {
    try {
      const dom = editor.view.nodeDOM(pos) as HTMLElement | null
      dom?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch {
      editor.commands.scrollIntoView()
    }
  })
}
