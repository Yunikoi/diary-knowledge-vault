import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type NoteDetail, type NoteMeta } from './api'
import {
  WysiwygEditor,
  type WysiwygEditorHandle,
} from './components/WysiwygEditor'
import { AddKnowledgeModal } from './components/AddKnowledgeModal'
import { KnowledgeTree } from './components/KnowledgeTree'
import { StickyPopover } from './components/StickyPopover'
import {
  extractOutlineFromMarkdown,
  type OutlineItem,
} from './lib/outline'
import {
  findStickyForQuote,
  parseStickies,
  removeSticky,
  upsertSticky,
  type StickyNote,
} from './lib/sticky'
import './App.css'

type Sel = { kind: 'diary' | 'knowledge'; name: string }

const HINT_WIKI = '[[标题]]'

export default function App() {
  const [diary, setDiary] = useState<NoteMeta[]>([])
  const [knowledge, setKnowledge] = useState<NoteMeta[]>([])
  const [sel, setSel] = useState<Sel | null>(null)
  const [note, setNote] = useState<NoteDetail | null>(null)
  const [content, setContent] = useState('')
  const [showSource, setShowSource] = useState(false)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const [status, setStatus] = useState('就绪')
  const [query, setQuery] = useState('')
  const [dirty, setDirty] = useState(false)
  const [addKnowledgeOpen, setAddKnowledgeOpen] = useState(false)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [activeOutline, setActiveOutline] = useState(-1)
  const [stickies, setStickies] = useState<StickyNote[]>([])
  const [stickyUi, setStickyUi] = useState<{
    open: boolean
    x: number
    y: number
    quote: string
  } | null>(null)
  const saveTimer = useRef<number | null>(null)
  const stickiesRef = useRef<StickyNote[]>([])
  const editorRef = useRef<WysiwygEditorHandle>(null)
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  stickiesRef.current = stickies

  const refreshTree = useCallback(async () => {
    const t = await api.tree()
    setDiary(t.diary)
    setKnowledge(t.knowledge)
  }, [])

  const openNote = useCallback(async (kind: 'diary' | 'knowledge', name: string) => {
    const n = await api.getNote(kind, name)
    setSel({ kind, name })
    setNote(n)
    setContent(n.content)
    setDirty(false)
    setShowSource(false)
    setOutline(extractOutlineFromMarkdown(n.content))
    setActiveOutline(-1)
    setStickies(parseStickies(n.stickies))
    setStickyUi(null)
    setStatus(`已打开 ${kind}/${name}`)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const t = await api.tree()
        setDiary(t.diary)
        setKnowledge(t.knowledge)
        if (t.diary[0]) await openNote('diary', t.diary[0].name)
        else if (t.knowledge[0]) await openNote('knowledge', t.knowledge[0].name)
      } catch (e) {
        setStatus(String((e as Error).message || e))
      }
    })()
  }, [openNote])

  const scheduleSave = (next: string) => {
    setContent(next)
    setDirty(true)
    if (showSource) {
      const items = extractOutlineFromMarkdown(next)
      setOutline(items)
      setActiveOutline(items.length ? 0 : -1)
    }
    if (!sel) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      try {
        await api.saveNote(
          sel.kind,
          sel.name,
          next,
          note?.title,
          stickiesRef.current,
        )
        setDirty(false)
        setStatus('已自动保存')
        const fresh = await api.getNote(sel.kind, sel.name)
        setNote(fresh)
        await refreshTree()
      } catch (e) {
        setStatus(`保存失败: ${(e as Error).message}`)
      }
    }, 500)
  }

  const persistStickies = async (next: StickyNote[]) => {
    setStickies(next)
    stickiesRef.current = next
    if (!sel) return
    try {
      await api.saveNote(sel.kind, sel.name, content, note?.title, next)
      setStatus('便利贴已保存')
      const fresh = await api.getNote(sel.kind, sel.name)
      setNote(fresh)
    } catch (e) {
      setStatus(`便利贴保存失败: ${(e as Error).message}`)
    }
  }

  const openStickyForQuote = (quote: string, x: number, y: number) => {
    const q = quote.trim()
    if (!q) {
      setStatus('请先选中一段文字，再 Ctrl+点击 查看便利贴')
      return
    }
    setStickyUi({ open: true, quote: q, x, y })
  }

  const jumpOutline = (item: OutlineItem) => {
    if (showSource) {
      const ta = sourceRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(item.pos, item.pos + item.text.length + item.level + 1)
      const before = content.slice(0, item.pos)
      const line = before.split('\n').length
      const lineHeight = 22
      ta.scrollTop = Math.max(0, (line - 3) * lineHeight)
      setActiveOutline(item.index)
      return
    }
    editorRef.current?.jumpToHeading(item.pos)
    setActiveOutline(item.index)
  }

  const jumpWiki = async (title: string) => {
    if (!title) return
    const hit =
      knowledge.find((k) => k.title === title || k.name === title) ||
      diary.find((d) => d.title === title || d.name === title)
    if (hit) {
      await openNote(hit.kind, hit.name)
      return
    }
    const create = window.confirm(`未找到「${title}」，要创建知识卡片吗？`)
    if (!create) return
    const r = await api.createNote('knowledge', title)
    await refreshTree()
    await openNote('knowledge', r.name)
  }

  const createDiary = async () => {
    const r = await api.createNote('diary')
    await refreshTree()
    await openNote('diary', r.name)
  }

  const createKnowledge = async (payload: { name: string; content?: string }) => {
    const r = await api.createNote('knowledge', payload.name, payload.content)
    await refreshTree()
    await openNote('knowledge', r.name)
    setStatus(`已创建知识文件 ${r.name}.md`)
  }

  const deleteKnowledge = async (name: string, title?: string) => {
    const label = title || name
    if (
      !window.confirm(
        `确定删除知识文件「${label}」？\n将删除 vault/knowledge/${name}.md，不可恢复。`,
      )
    ) {
      return
    }
    try {
      await api.deleteNote('knowledge', name)
      const wasOpen = sel?.kind === 'knowledge' && sel.name === name
      const t = await api.tree()
      setDiary(t.diary)
      setKnowledge(t.knowledge)
      if (wasOpen) {
        setStickyUi(null)
        setStickies([])
        if (t.knowledge[0]) await openNote('knowledge', t.knowledge[0].name)
        else if (t.diary[0]) await openNote('diary', t.diary[0].name)
        else {
          setSel(null)
          setNote(null)
          setContent('')
          setOutline([])
        }
      }
      setStatus(`已删除知识文件 ${name}.md`)
    } catch (e) {
      setStatus(`删除失败: ${(e as Error).message}`)
    }
  }

  const renameNote = async (
    kind: 'diary' | 'knowledge',
    from: string,
    currentTitle?: string,
  ) => {
    const isOpen = sel?.kind === kind && sel.name === from
    const h1 = isOpen ? content.match(/^#\s+(.+)$/m)?.[1]?.trim() : undefined
    let suggested = currentTitle || from
    if (kind === 'diary' && h1 && h1 !== from && !from.includes(h1)) {
      // keep date prefix if present
      const datePrefix = from.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
      suggested = datePrefix ? `${datePrefix}-${h1}` : h1
    }
    const next = window.prompt(
      `重命名${kind === 'diary' ? '日记' : '知识'}文件（不含 .md）\n当前：${from}`,
      suggested,
    )
    if (next == null) return
    const to = next.trim().replace(/\.md$/i, '')
    if (!to) {
      window.alert('文件名不能为空')
      return
    }
    if (to === from) {
      window.alert('文件名未变化')
      return
    }
    try {
      if (dirty && isOpen) {
        await api.saveNote(kind, from, content, note?.title, stickiesRef.current)
        setDirty(false)
      }
      const r = await api.renameNote(kind, from, to)
      const t = await api.tree()
      setDiary(t.diary)
      setKnowledge(t.knowledge)
      await openNote(kind, r.name)
      setStatus(`已重命名为 ${r.name}.md`)
      window.alert(`重命名成功：\n${from}.md\n→ ${r.name}.md`)
    } catch (e) {
      const msg = (e as Error).message || String(e)
      setStatus(`重命名失败: ${msg}`)
      window.alert(`重命名失败：${msg}\n请刷新页面后重试。`)
      try {
        const t = await api.tree()
        setDiary(t.diary)
        setKnowledge(t.knowledge)
      } catch {
        /* ignore */
      }
    }
  }

  const insertLink = (title: string) => {
    editorRef.current?.insertWikiLink(title)
  }

  const filter = (list: NoteMeta[]) => {
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.name.toLowerCase().includes(q) ||
        n.preview.toLowerCase().includes(q),
    )
  }

  const noteKey = sel ? `${sel.kind}:${sel.name}:${editorEpoch}` : ''

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <div className="logo">DK</div>
          <div>
            <h1>Diary ↔ Knowledge</h1>
            <p>Typora 式所见即所得 · 双向链接</p>
          </div>
        </header>

        <input
          className="search"
          placeholder="搜索日记 / 知识…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <section className="section">
          <div className="section-head">
            <h2>日记</h2>
            <button type="button" onClick={() => void createDiary()} title="今日日记">
              +
            </button>
          </div>
          <ul className="diary-list">
            {filter(diary).map((n) => (
              <li key={n.name} className="diary-row">
                <button
                  type="button"
                  className={sel?.kind === 'diary' && sel.name === n.name ? 'active' : ''}
                  onClick={() => void openNote('diary', n.name)}
                >
                  <span>{n.title}</span>
                  <small>{n.links.length} 链出</small>
                </button>
                <button
                  type="button"
                  className="rename-note"
                  title={`重命名 ${n.title}.md`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void renameNote('diary', n.name, n.title)
                  }}
                >
                  改
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>知识</h2>
            <button
              type="button"
              onClick={() => setAddKnowledgeOpen(true)}
              title="添加知识文件"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="add-knowledge-btn"
            onClick={() => setAddKnowledgeOpen(true)}
          >
            + 添加知识文件 (.md)
          </button>
          <ul className="knowledge-list">
            {filter(knowledge).map((n) => (
              <li key={n.name} className="knowledge-row">
                <button
                  type="button"
                  className={
                    sel?.kind === 'knowledge' && sel.name === n.name ? 'active' : ''
                  }
                  onClick={() => void openNote('knowledge', n.name)}
                >
                  <span>{n.title}</span>
                  <small>{n.links.length} 链出</small>
                </button>
                <button
                  type="button"
                  className="delete-knowledge"
                  title={`删除 ${n.title}.md`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void deleteKnowledge(n.name, n.title)
                  }}
                >
                  删
                </button>
                <button
                  type="button"
                  className="rename-note"
                  title={`重命名 ${n.title}.md`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void renameNote('knowledge', n.name, n.title)
                  }}
                >
                  改
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <AddKnowledgeModal
        open={addKnowledgeOpen}
        onClose={() => setAddKnowledgeOpen(false)}
        onCreate={createKnowledge}
      />

      <main className="main">
        <div className="toolbar">
          <div className="titl">
            <span className={`pill ${sel?.kind || ''}`}>
              {sel?.kind === 'diary' ? '日记' : '知识'}
            </span>
            <strong>{note?.title || '未选择'}</strong>
            {dirty && <em className="dirty">未保存</em>}
          </div>
          <div className="modes">
            <button
              type="button"
              className={!showSource ? 'on' : ''}
              onClick={() => {
                setShowSource(false)
                setEditorEpoch((n) => n + 1)
              }}
            >
              写作
            </button>
            <button
              type="button"
              className={showSource ? 'on' : ''}
              onClick={() => setShowSource(true)}
            >
              源码
            </button>
            {sel?.kind === 'diary' && (
              <button
                type="button"
                className="toolbar-rename"
                title="重命名当前日记"
                onClick={() => void renameNote('diary', sel.name, note?.title)}
              >
                重命名
              </button>
            )}
            {sel?.kind === 'knowledge' && (
              <>
                <button
                  type="button"
                  className="toolbar-rename"
                  title="重命名当前知识文件"
                  onClick={() => void renameNote('knowledge', sel.name, note?.title)}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="toolbar-delete"
                  title="删除当前知识文件"
                  onClick={() => void deleteKnowledge(sel.name, note?.title)}
                >
                  删除文件
                </button>
              </>
            )}
          </div>
        </div>

        <div className="editor-area mode-edit">
          {showSource ? (
            <textarea
              ref={sourceRef}
              className="editor source-fallback"
              value={content}
              spellCheck={false}
              onChange={(e) => scheduleSave(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                  e.preventDefault()
                  setShowSource(false)
                  setEditorEpoch((n) => n + 1)
                }
              }}
              onClick={(e) => {
                if (!(e.ctrlKey || e.metaKey)) return
                const ta = sourceRef.current
                if (!ta) return
                const quote = content.slice(ta.selectionStart, ta.selectionEnd)
                openStickyForQuote(quote, e.clientX, e.clientY)
              }}
            />
          ) : (
            noteKey && (
              <WysiwygEditor
                ref={editorRef}
                noteKey={noteKey}
                content={content}
                stickies={stickies}
                onChange={scheduleSave}
                onWikiClick={(title) => void jumpWiki(title)}
                onToggleSource={() => setShowSource(true)}
                onOutlineChange={(items, active) => {
                  setOutline(items)
                  setActiveOutline(active)
                }}
                onStickyCtrlClick={({ quote, x, y }) => {
                  openStickyForQuote(quote, x, y)
                }}
              />
            )
          )}
        </div>

        <footer className="status">
          {status} · 选中文字后 <code>Ctrl+点击</code> 查看便利贴 ·{' '}
          <code>Ctrl+1..6</code> 标题 · <code>{HINT_WIKI}</code> 双向链接
        </footer>
      </main>

      <StickyPopover
        open={Boolean(stickyUi?.open)}
        x={stickyUi?.x || 0}
        y={stickyUi?.y || 0}
        quote={stickyUi?.quote || ''}
        sticky={
          stickyUi ? findStickyForQuote(stickies, stickyUi.quote) : null
        }
        onClose={() => setStickyUi(null)}
        onSave={(payload) => {
          if (!stickyUi?.quote) return
          const next = upsertSticky(stickies, stickyUi.quote, payload)
          void persistStickies(next)
          setStickyUi(null)
        }}
        onDelete={() => {
          if (!stickyUi?.quote) return
          const hit = findStickyForQuote(stickies, stickyUi.quote)
          if (!hit) return
          void persistStickies(removeSticky(stickies, hit.id))
          setStickyUi(null)
        }}
      />

      <aside className="right">
        <KnowledgeTree
          items={outline}
          activeIndex={activeOutline}
          onJump={jumpOutline}
        />

        <section>
          <h3>链出 →</h3>
          {!note?.outgoing?.length && <p className="muted">正文里还没有链接</p>}
          <ul className="link-list">
            {note?.outgoing.map((o) => (
              <li key={o.targetKey + o.title}>
                {o.target ? (
                  <button
                    type="button"
                    onClick={() => void openNote(o.target!.kind, o.target!.name)}
                  >
                    [[{o.title}]] <small>{o.target.kind}</small>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="missing"
                    onClick={() =>
                      void api.createNote('knowledge', o.title).then(async (r) => {
                        await refreshTree()
                        await openNote('knowledge', r.name)
                      })
                    }
                  >
                    [[{o.title}]] <small>缺失，点击创建</small>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>← 反向链接</h3>
          <p className="hint">谁提到了当前笔记（日记 ↔ 知识）</p>
          {!note?.backlinks?.length && <p className="muted">暂无引用</p>}
          <ul className="link-list">
            {note?.backlinks.map((b) => (
              <li key={b.key}>
                <button type="button" onClick={() => void openNote(b.kind, b.name)}>
                  {b.title} <small>{b.kind === 'diary' ? '日记' : '知识'}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>快速插入链接</h3>
          <div className="chips">
            {knowledge.map((k) => (
              <button
                key={k.name}
                type="button"
                className="chip"
                onClick={() => insertLink(k.title)}
              >
                {k.title}
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  )
}
