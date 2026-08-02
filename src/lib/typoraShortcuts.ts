import { Extension } from '@tiptap/core'

type TyporaShortcutOptions = {
  onToggleSource?: () => void
  onInsertWikiLink?: () => void
}

function headingLevel(editor: {
  isActive: (name: string, attrs?: object) => boolean
  commands: {
    setParagraph: () => boolean
    toggleHeading: (attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 }) => boolean
  }
}): number {
  for (let level = 1; level <= 6; level++) {
    if (editor.isActive('heading', { level })) return level
  }
  return 0
}

/**
 * Typora-compatible shortcuts (Windows/Linux).
 * @see https://support.typora.io/Shortcut-Keys/
 */
export const TyporaShortcuts = Extension.create<TyporaShortcutOptions>({
  name: 'typoraShortcuts',

  addOptions() {
    return {
      onToggleSource: undefined,
      onInsertWikiLink: undefined,
    }
  },

  addKeyboardShortcuts() {
    const setHeading = (level: 1 | 2 | 3 | 4 | 5 | 6) => () =>
      this.editor.commands.toggleHeading({ level })

    return {
      // Headings / paragraph
      'Mod-1': setHeading(1),
      'Mod-2': setHeading(2),
      'Mod-3': setHeading(3),
      'Mod-4': setHeading(4),
      'Mod-5': setHeading(5),
      'Mod-6': setHeading(6),
      'Mod-0': () => this.editor.commands.setParagraph(),

      // Increase / decrease heading level
      'Mod-=': () => {
        const level = headingLevel(this.editor)
        if (level === 0) return this.editor.commands.toggleHeading({ level: 1 })
        if (level >= 6) return true
        return this.editor.commands.toggleHeading({
          level: (level + 1) as 1 | 2 | 3 | 4 | 5 | 6,
        })
      },
      'Mod--': () => {
        const level = headingLevel(this.editor)
        if (level <= 1) return this.editor.commands.setParagraph()
        return this.editor.commands.toggleHeading({
          level: (level - 1) as 1 | 2 | 3 | 4 | 5 | 6,
        })
      },

      // Marks — Bold/Italic: StarterKit already uses Mod-b / Mod-i
      'Mod-u': () => this.editor.commands.toggleUnderline(),
      'Mod-Shift-`': () => this.editor.commands.toggleCode(),
      'Alt-Shift-5': () => this.editor.commands.toggleStrike(),

      // Clear format
      'Mod-\\': () =>
        this.editor.chain().focus().unsetAllMarks().clearNodes().run(),

      // Blocks
      'Mod-Shift-k': () => this.editor.commands.toggleCodeBlock(),
      'Mod-Shift-q': () => this.editor.commands.toggleBlockquote(),
      'Mod-Shift-]': () => this.editor.commands.toggleBulletList(),
      'Mod-Shift-[': () => this.editor.commands.toggleOrderedList(),
      'Mod-Shift-x': () => this.editor.commands.toggleTaskList(),

      // Typora: Indent = Ctrl+[ / Tab ; Outdent = Ctrl+] / Shift+Tab
      'Mod-[': () => {
        if (this.editor.commands.sinkListItem('listItem')) return true
        if (this.editor.commands.sinkListItem('taskItem')) return true
        return true
      },
      'Mod-]': () => {
        if (this.editor.commands.liftListItem('listItem')) return true
        if (this.editor.commands.liftListItem('taskItem')) return true
        return true
      },
      Tab: () => {
        if (this.editor.commands.sinkListItem('listItem')) return true
        if (this.editor.commands.sinkListItem('taskItem')) return true
        return false
      },
      'Shift-Tab': () => {
        if (this.editor.commands.liftListItem('listItem')) return true
        if (this.editor.commands.liftListItem('taskItem')) return true
        return false
      },

      // Hyperlink — Typora Ctrl+K
      'Mod-k': () => {
        const prev = this.editor.getAttributes('link').href as string | undefined
        const url = window.prompt(
          '超链接 URL（取消后可改用工具栏插入 [[双向链接]]）',
          prev || 'https://',
        )
        if (url === null) return true
        const trimmed = url.trim()
        if (!trimmed) {
          this.editor.chain().focus().extendMarkRange('link').unsetLink().run()
          return true
        }
        this.editor
          .chain()
          .focus()
          .extendMarkRange('link')
          .setLink({ href: trimmed })
          .run()
        return true
      },

      // Horizontal rule helper
      'Mod-Shift-h': () => this.editor.commands.setHorizontalRule(),

      // Source mode — Typora Ctrl+/
      'Mod-/': () => {
        this.options.onToggleSource?.()
        return true
      },
    }
  },
})
