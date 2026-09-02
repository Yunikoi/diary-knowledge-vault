import { useEffect, useState } from 'react'
import { SHORTCUT_SECTIONS } from '../lib/shortcutCatalog'

const STORAGE_KEY = 'dkv-shortcut-booklet-open'

export function ShortcutBooklet() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className={`shortcut-booklet ${open ? 'is-open' : ''}`}>
      {open ? (
        <div className="shortcut-booklet-panel" role="dialog" aria-label="快捷键小册子">
          <header className="shortcut-booklet-head">
            <div>
              <strong>快捷键小册子</strong>
              <p>Typora 风格 · Windows / Linux（Mac 用 ⌘）</p>
            </div>
            <button
              type="button"
              className="shortcut-booklet-close"
              aria-label="收起"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>
          <div className="shortcut-booklet-body">
            {SHORTCUT_SECTIONS.map((section) => (
              <section key={section.title}>
                <h4>{section.title}</h4>
                <ul>
                  {section.items.map((item) => (
                    <li key={item.keys + item.desc}>
                      <kbd>{item.keys}</kbd>
                      <span>{item.desc}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className="shortcut-booklet-fab"
        title="查看快捷键"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '收起' : '快捷键'}
      </button>
    </div>
  )
}
