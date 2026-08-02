import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fileToDataUrl,
  fitImageSize,
  type StickyNote,
  type StickyPayload,
} from '../lib/sticky'
import { extractClipboardImage, isImageFile } from '../lib/clipboardImage'
import { api } from '../api'

type Props = {
  open: boolean
  x: number
  y: number
  quote: string
  sticky: StickyNote | null
  onClose: () => void
  onSave: (payload: StickyPayload) => void
  onDelete?: () => void
}

type Pos = { left: number; top: number }

function clampPos(left: number, top: number, width: number, height: number): Pos {
  const maxLeft = Math.max(8, window.innerWidth - width - 8)
  const maxTop = Math.max(8, window.innerHeight - Math.min(height, 120) - 8)
  return {
    left: Math.min(Math.max(8, left), maxLeft),
    top: Math.min(Math.max(8, top), maxTop),
  }
}

export function StickyPopover({
  open,
  x,
  y,
  quote,
  sticky,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pos, setPos] = useState<Pos>({ left: 0, top: 0 })
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const stickyIdRef = useRef(sticky?.id)
  const dragRef = useRef<{
    startX: number
    startY: number
    originLeft: number
    originTop: number
  } | null>(null)

  stickyIdRef.current = sticky?.id

  const maxW = Math.min(480, typeof window !== 'undefined' ? window.innerWidth - 48 : 480)
  const maxH = Math.min(520, typeof window !== 'undefined' ? window.innerHeight - 220 : 520)
  const imgBox = natural ? fitImageSize(natural.w, natural.h, maxW, maxH) : null

  const popWidth = useMemo(() => {
    if (imgBox) return Math.max(260, imgBox.w + 28)
    return 300
  }, [imgBox])

  const applyImageFile = async (file: File | null) => {
    if (!file) return
    if (!isImageFile(file)) {
      setError('剪贴板里没有图片，请先复制图片或截图')
      return
    }
    setBusy(true)
    setError('')
    try {
      const dataUrl = await fileToDataUrl(file)
      if (!dataUrl.startsWith('data:image/')) {
        // Explorer 复制时 type 为空，按扩展名补 mime
        const ext = (file.name.split('.').pop() || 'png').toLowerCase()
        const mime =
          ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'webp'
              ? 'image/webp'
              : ext === 'gif'
                ? 'image/gif'
                : 'image/png'
        const raw = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
        const uploaded = await api.uploadStickyImage(
          `data:${mime};base64,${raw}`,
          stickyIdRef.current,
        )
        setImage(uploaded.url)
        setNatural({ w: uploaded.width, h: uploaded.height })
      } else {
        const uploaded = await api.uploadStickyImage(dataUrl, stickyIdRef.current)
        setImage(uploaded.url)
        setNatural({ w: uploaded.width, h: uploaded.height })
      }
    } catch (err) {
      setError(String((err as Error).message || err))
    } finally {
      setBusy(false)
    }
  }

  const applyImageRef = useRef(applyImageFile)
  applyImageRef.current = applyImageFile

  // 只在「打开 / 换一条便利贴」时重置，避免上传后 popWidth 变化把图片清掉
  const sessionKey = `${open ? '1' : '0'}:${quote}:${sticky?.id || 'new'}`
  const sessionRef = useRef('')

  useEffect(() => {
    if (!open) {
      sessionRef.current = ''
      return
    }
    if (sessionRef.current === sessionKey) return
    sessionRef.current = sessionKey

    setText(sticky?.note || '')
    setImage(sticky?.image || null)
    if (sticky?.image && sticky.imageWidth && sticky.imageHeight) {
      setNatural({ w: sticky.imageWidth, h: sticky.imageHeight })
    } else {
      setNatural(null)
    }
    setError('')
    setBusy(false)
    setDragging(false)
    dragRef.current = null
    setPos(clampPos(x, y, 300, 280))
    requestAnimationFrame(() => textRef.current?.focus())
  }, [open, sessionKey, sticky, x, y, quote])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // 全局粘贴：截图 / 复制图片时不依赖焦点在 textarea
    const onPaste = (e: ClipboardEvent) => {
      const file = extractClipboardImage(e.clipboardData)
      if (!file) return
      e.preventDefault()
      e.stopPropagation()
      void applyImageRef.current(file)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste, true)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const height = cardRef.current?.offsetHeight || 280
      setPos(
        clampPos(
          d.originLeft + (e.clientX - d.startX),
          d.originTop + (e.clientY - d.startY),
          popWidth,
          height,
        ),
      )
    }

    const onUp = () => {
      dragRef.current = null
      setDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging, popWidth])

  if (!open) return null

  const startDrag = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (
      target.closest('textarea, input, button, a, label, .sticky-image-actions')
    ) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originLeft: pos.left,
      originTop: pos.top,
    }
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) void applyImageFile(file)
  }

  return (
    <div
      className={`sticky-layer${dragging ? ' is-dragging' : ''}`}
      role="presentation"
      onMouseDown={() => {
        if (!dragging) onClose()
      }}
    >
      <div
        ref={cardRef}
        className={`sticky-popover${image ? ' has-image' : ''}${dragging ? ' dragging' : ''}`}
        style={{
          left: pos.left,
          top: pos.top,
          width: popWidth,
        }}
        role="dialog"
        aria-label="便利贴"
        onMouseDown={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDrop={onDrop}
      >
        <header
          className="sticky-drag-handle"
          onPointerDown={startDrag}
          title="拖动便利贴"
        >
          <span className="drag-dots" aria-hidden>
            ⠿
          </span>
          <strong>便利贴</strong>
          <button
            type="button"
            className="sticky-close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p
          className="sticky-quote sticky-drag-handle"
          title={`${quote}（可拖动）`}
          onPointerDown={startDrag}
        >
          “{quote}”
        </p>

        {image ? (
          <div
            className="sticky-image-wrap sticky-drag-handle"
            style={
              imgBox
                ? { width: imgBox.w, height: imgBox.h }
                : { minHeight: 120 }
            }
            onPointerDown={startDrag}
            title="拖动便利贴"
          >
            <img
              src={image}
              alt="便利贴图片"
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget
                if (!natural) {
                  setNatural({ w: el.naturalWidth, h: el.naturalHeight })
                }
              }}
            />
          </div>
        ) : (
          <div
            className="sticky-dropzone"
            onClick={() => fileRef.current?.click()}
          >
            可 Ctrl+V 粘贴截图/图片，或拖拽到这里
          </div>
        )}

        <textarea
          ref={textRef}
          value={text}
          placeholder={
            image
              ? '可选：给图片加一句说明…'
              : '写文字说明（图片请用 Ctrl+V 或点上方区域）'
          }
          rows={image ? 2 : 4}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const file = extractClipboardImage(e.clipboardData)
            if (!file) return // 普通文字粘贴放行
            e.preventDefault()
            void applyImageFile(file)
          }}
        />

        <div className="sticky-image-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {image ? '更换图片' : '选择图片'}
          </button>
          {image && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setImage(null)
                setNatural(null)
              }}
            >
              移除图片
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void applyImageFile(e.target.files?.[0] || null)}
          />
        </div>

        {error && <div className="sticky-error">{error}</div>}
        {busy && <div className="sticky-hint">正在处理图片…</div>}

        <footer>
          {sticky && onDelete && (
            <button type="button" className="danger" onClick={onDelete}>
              删除
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || (!text.trim() && !image)}
            onClick={() =>
              onSave({
                note: text.trim(),
                image,
                imageWidth: natural?.w ?? sticky?.imageWidth ?? null,
                imageHeight: natural?.h ?? sticky?.imageHeight ?? null,
              })
            }
          >
            {busy ? '处理中…' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  )
}
