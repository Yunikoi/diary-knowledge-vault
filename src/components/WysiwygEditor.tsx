import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useEffect, useImperativeHandle, forwardRef, useRef } from 'react'
import { marked } from 'marked'
import TurndownService from 'turndown'
import {
  WikiLink,
  convertWikiTextToNodes,
  htmlSpansToWikiMarkdown,
  wikiMarkdownToHtmlSpans,
} from '../lib/wikiLink'
import { TyporaShortcuts } from '../lib/typoraShortcuts'
import {
  activeOutlineIndex,
  extractOutlineFromEditor,
  jumpToEditorHeading,
  type OutlineItem,
} from '../lib/outline'
import { StickyHighlight } from '../lib/stickyHighlight'
import { normalizeQuote, type StickyNote } from '../lib/sticky'

marked.setOptions({ gfm: true, breaks: true })

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

turndown.addRule('wikiLink', {
  filter: (node) =>
    node.nodeName === 'SPAN' && (node as HTMLElement).getAttribute('data-wiki') != null,
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const title = el.getAttribute('data-wiki') || ''
    const alias = el.getAttribute('data-alias')
    if (alias && alias !== title) return `[[${title}|${alias}]]`
    return `[[${title}]]`
  },
})

turndown.addRule('taskListItem', {
  filter: (node) =>
    node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-checked') != null,
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute('data-checked') === 'true'
    return `- [${checked ? 'x' : ' '}] ${content.trim()}\n`
  },
})

/** Turndown escapes [ ] as \[ \]; restore wiki links. */
function unescapeWikiBrackets(md: string) {
  return md
    .replace(/\\\[\\\[/g, '[[')
    .replace(/\\\]\\\]/g, ']]')
}

function mdToHtml(md: string) {
  const normalized = unescapeWikiBrackets(md || '')
  const withWiki = wikiMarkdownToHtmlSpans(normalized)
  return marked.parse(withWiki, { async: false }) as string
}

function htmlToMd(html: string) {
  const restored = htmlSpansToWikiMarkdown(html)
  const md = turndown.turndown(restored).replace(/\n{3,}/g, '\n\n')
  return unescapeWikiBrackets(md)
}

export type WysiwygEditorHandle = {
  insertWikiLink: (title: string) => void
  focus: () => void
  getMarkdown: () => string
  getOutline: () => OutlineItem[]
  jumpToHeading: (pos: number) => void
  getActiveOutlineIndex: () => number
}

export type StickyClickPayload = {
  quote: string
  stickyId?: string
  x: number
  y: number
}

type Props = {
  noteKey: string
  content: string
  stickies?: StickyNote[]
  onChange: (markdown: string) => void
  onWikiClick: (title: string) => void
  onToggleSource?: () => void
  onOutlineChange?: (items: OutlineItem[], activeIndex: number) => void
  onStickyCtrlClick?: (payload: StickyClickPayload) => void
}

export const WysiwygEditor = forwardRef<WysiwygEditorHandle, Props>(
  function WysiwygEditor(
    {
      noteKey,
      content,
      stickies = [],
      onChange,
      onWikiClick,
      onToggleSource,
      onOutlineChange,
      onStickyCtrlClick,
    },
    ref,
  ) {
    const suppress = useRef(false)
    const onChangeRef = useRef(onChange)
    const onWikiClickRef = useRef(onWikiClick)
    const onToggleSourceRef = useRef(onToggleSource)
    const onOutlineChangeRef = useRef(onOutlineChange)
    const onStickyCtrlClickRef = useRef(onStickyCtrlClick)
    const stickiesRef = useRef(stickies)
    onChangeRef.current = onChange
    onWikiClickRef.current = onWikiClick
    onToggleSourceRef.current = onToggleSource
    onOutlineChangeRef.current = onOutlineChange
    onStickyCtrlClickRef.current = onStickyCtrlClick
    stickiesRef.current = stickies

    const pushOutline = (ed: Editor) => {
      const items = extractOutlineFromEditor(ed)
      const active = activeOutlineIndex(ed, items)
      onOutlineChangeRef.current?.(items, active)
    }

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({
          placeholder:
            '选中文字后 Ctrl+点击 查看/添加便利贴 · Ctrl+1 标题 · [[双向链接]]',
        }),
        WikiLink,
        StickyHighlight,
        TyporaShortcuts.configure({
          onToggleSource: () => onToggleSourceRef.current?.(),
          onInsertWikiLink: () => {
            const title = window.prompt('双向链接标题', '')
            if (!title?.trim()) return
          },
        }),
      ],
      content: '',
      editorProps: {
        attributes: {
          class: 'typora-doc',
        },
        handleClick: (view, _pos, event) => {
          const t = event.target as HTMLElement | null
          const wiki = t?.closest?.('[data-wiki]') as HTMLElement | null
          if (wiki && !event.ctrlKey && !event.metaKey) {
            event.preventDefault()
            onWikiClickRef.current(wiki.getAttribute('data-wiki') || '')
            return true
          }

          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            const { from, to, empty } = view.state.selection
            let quote = ''
            let stickyId: string | undefined

            if (!empty) {
              quote = normalizeQuote(view.state.doc.textBetween(from, to, ' '))
            }

            const markEl = t?.closest?.('.sticky-mark') as HTMLElement | null
            if (!quote && markEl) {
              stickyId = markEl.getAttribute('data-sticky-id') || undefined
              const hit = stickiesRef.current.find((s) => s.id === stickyId)
              quote = hit?.quote || normalizeQuote(markEl.textContent || '')
            }

            if (!quote) {
              onStickyCtrlClickRef.current?.({
                quote: '',
                x: event.clientX,
                y: event.clientY,
              })
              return true
            }

            onStickyCtrlClickRef.current?.({
              quote,
              stickyId,
              x: event.clientX,
              y: event.clientY,
            })
            return true
          }
          return false
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (!suppress.current) {
          onChangeRef.current(htmlToMd(ed.getHTML()))
        }
        pushOutline(ed)
      },
      onSelectionUpdate: ({ editor: ed }) => {
        pushOutline(ed)
      },
      onCreate: ({ editor: ed }) => {
        pushOutline(ed)
      },
    })

    useEffect(() => {
      if (!editor) return
      suppress.current = true
      editor.commands.setContent(mdToHtml(content), { emitUpdate: false } as never)
      convertWikiTextToNodes(editor)
      editor.commands.setStickyHighlights(stickiesRef.current)
      pushOutline(editor)
      suppress.current = false
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, noteKey])

    useEffect(() => {
      if (!editor) return
      editor.commands.setStickyHighlights(stickies)
    }, [editor, stickies])

    useImperativeHandle(
      ref,
      () => ({
        insertWikiLink: (title: string) => {
          if (!editor) return
          editor.chain().focus().insertWikiLink({ title }).run()
        },
        focus: () => editor?.commands.focus(),
        getMarkdown: () => (editor ? htmlToMd(editor.getHTML()) : ''),
        getOutline: () => (editor ? extractOutlineFromEditor(editor) : []),
        jumpToHeading: (pos: number) => {
          if (!editor) return
          jumpToEditorHeading(editor, pos)
        },
        getActiveOutlineIndex: () =>
          editor ? activeOutlineIndex(editor, extractOutlineFromEditor(editor)) : -1,
      }),
      [editor],
    )

    if (!editor) return <div className="typora-shell loading">编辑器加载中…</div>

    return (
      <div className="typora-shell">
        <BubbleBar
          editor={editor}
          onWiki={() => {
            const title = window.prompt('链接到哪个知识/日记标题？', '')
            if (!title) return
            editor.chain().focus().insertWikiLink({ title: title.trim() }).run()
          }}
        />
        <EditorContent editor={editor} className="typora-editor" />
      </div>
    )
  },
)

function BubbleBar({ editor, onWiki }: { editor: Editor; onWiki: () => void }) {
  return (
    <div className="format-bar">
      <button
        type="button"
        title="Ctrl+1"
        className={editor.isActive('heading', { level: 1 }) ? 'on' : ''}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </button>
      <button
        type="button"
        title="Ctrl+2"
        className={editor.isActive('heading', { level: 2 }) ? 'on' : ''}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </button>
      <button
        type="button"
        title="Ctrl+B"
        className={editor.isActive('bold') ? 'on' : ''}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        B
      </button>
      <button
        type="button"
        title="Ctrl+I"
        className={editor.isActive('italic') ? 'on' : ''}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        I
      </button>
      <button
        type="button"
        title="Ctrl+U"
        className={editor.isActive('underline') ? 'on' : ''}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        U
      </button>
      <button
        type="button"
        title="Ctrl+Shift+]"
        className={editor.isActive('bulletList') ? 'on' : ''}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • 列表
      </button>
      <button
        type="button"
        title="Ctrl+Shift+["
        className={editor.isActive('orderedList') ? 'on' : ''}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. 列表
      </button>
      <button
        type="button"
        title="Ctrl+Shift+X"
        className={editor.isActive('taskList') ? 'on' : ''}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        ☑
      </button>
      <button
        type="button"
        title="Ctrl+Shift+K"
        className={editor.isActive('codeBlock') ? 'on' : ''}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        代码块
      </button>
      <button type="button" title="Ctrl+K" onClick={() => {
        const prev = editor.getAttributes('link').href as string | undefined
        const url = window.prompt('超链接 URL', prev || 'https://')
        if (url === null) return
        if (!url.trim()) {
          editor.chain().focus().extendMarkRange('link').unsetLink().run()
          return
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
      }}>
        链接
      </button>
      <button type="button" title="插入 [[双向链接]]" onClick={onWiki}>
        [[链接]]
      </button>
    </div>
  )
}
