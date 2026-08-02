import { useEffect, useRef, useState } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (payload: { name: string; content?: string }) => Promise<void>
}

export function AddKnowledgeModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [fileLabel, setFileLabel] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setContent('')
    setFileLabel('')
    setError('')
    setBusy(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  if (!open) return null

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const title = name.trim().replace(/\.md$/i, '')
    if (!title) {
      setError('请填写知识文件名')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onCreate({
        name: title,
        content: content.trim() ? content : undefined,
      })
      onClose()
    } catch (err) {
      setError(String((err as Error).message || err))
      setBusy(false)
    }
  }

  const onPickFile = async (file: File | null) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.md')) {
      setError('只能导入 .md 文件')
      return
    }
    const text = await file.text()
    setContent(text)
    setFileLabel(file.name)
    if (!name.trim()) {
      setName(file.name.replace(/\.md$/i, ''))
    }
    setError('')
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-knowledge-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="add-knowledge-title">添加知识文件</h2>
          <p>创建 Markdown 知识卡片，可用 [[标题]] 与日记双向链接</p>
        </header>

        <form className="modal-body" onSubmit={(e) => void submit(e)}>
          <label className="field">
            <span>文件名（保存为 vault/knowledge/xxx.md）</span>
            <input
              ref={inputRef}
              value={name}
              placeholder="例如：机器学习、SWE-Agent"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="field">
            <span>导入已有 Markdown（可选）</span>
            <div className="import-row">
              <button
                type="button"
                className="secondary"
                onClick={() => fileRef.current?.click()}
              >
                选择 .md 文件
              </button>
              <span className="file-label">{fileLabel || '未选择文件'}</span>
              <input
                ref={fileRef}
                type="file"
                accept=".md,text/markdown"
                hidden
                onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <label className="field">
            <span>初始内容（可选，留空则用默认模板）</span>
            <textarea
              value={content}
              placeholder={'# 标题\n\n## 定义\n\n...'}
              rows={8}
              spellCheck={false}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>

          {error && <div className="modal-error">{error}</div>}

          <footer className="modal-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? '创建中…' : '创建知识文件'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
