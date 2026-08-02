import type { OutlineItem } from '../lib/outline'

type Props = {
  items: OutlineItem[]
  activeIndex: number
  onJump: (item: OutlineItem) => void
}

export function KnowledgeTree({ items, activeIndex, onJump }: Props) {
  return (
    <section className="knowledge-tree">
      <h3>知识树</h3>
      <p className="hint">点击标题，页面内快速跳转</p>
      {!items.length && (
        <p className="muted">正文里用 Ctrl+1/2/3 加标题后会出现在这里</p>
      )}
      <ul className="outline-list">
        {items.map((item) => (
          <li key={`${item.index}-${item.pos}-${item.text}`}>
            <button
              type="button"
              className={`outline-item level-${item.level}${activeIndex === item.index ? ' active' : ''}`}
              style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
              title={item.text}
              onClick={() => onJump(item)}
            >
              <span className="outline-level">H{item.level}</span>
              <span className="outline-text">{item.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
