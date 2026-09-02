export type ShortcutEntry = {
  keys: string
  desc: string
}

export type ShortcutSection = {
  title: string
  items: ShortcutEntry[]
}

/** 应用内全部快捷键一览（与 typoraShortcuts / App / Sticky 行为对齐） */
export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: '便利贴与导航',
    items: [
      { keys: 'Ctrl+点击', desc: '选中文字后查看 / 添加便利贴' },
      { keys: 'Esc', desc: '关闭便利贴弹层' },
      { keys: 'Ctrl+V', desc: '便利贴打开时粘贴截图 / 图片' },
      { keys: '点击 [[链接]]', desc: '跳转到对应知识 / 日记' },
    ],
  },
  {
    title: '标题与段落',
    items: [
      { keys: 'Ctrl+1…6', desc: '一级至六级标题' },
      { keys: 'Ctrl+0', desc: '正文段落' },
      { keys: 'Ctrl+=', desc: '提升标题级别' },
      { keys: 'Ctrl+-', desc: '降低标题级别' },
    ],
  },
  {
    title: '文字样式',
    items: [
      { keys: 'Ctrl+B', desc: '加粗' },
      { keys: 'Ctrl+I', desc: '斜体' },
      { keys: 'Ctrl+U', desc: '下划线' },
      { keys: 'Ctrl+Shift+`', desc: '行内代码' },
      { keys: 'Alt+Shift+5', desc: '删除线' },
      { keys: 'Ctrl+\\', desc: '清除格式' },
    ],
  },
  {
    title: '块级结构',
    items: [
      { keys: 'Ctrl+Shift+]', desc: '无序列表' },
      { keys: 'Ctrl+Shift+[', desc: '有序列表' },
      { keys: 'Ctrl+Shift+X', desc: '任务列表' },
      { keys: 'Ctrl+Shift+Q', desc: '引用块' },
      { keys: 'Ctrl+Shift+K', desc: '代码块' },
      { keys: 'Ctrl+Shift+H', desc: '分隔线' },
      { keys: 'Tab / Ctrl+[', desc: '列表缩进' },
      { keys: 'Shift+Tab / Ctrl+]', desc: '列表反缩进' },
    ],
  },
  {
    title: '链接与视图',
    items: [
      { keys: 'Ctrl+K', desc: '插入 / 编辑超链接' },
      { keys: 'Ctrl+/', desc: '切换源码 / 所见即所得' },
      { keys: 'Ctrl+Z', desc: '撤销' },
      { keys: 'Ctrl+Shift+Z', desc: '重做' },
      { keys: 'Alt+=', desc: '增大正文字号' },
      { keys: 'Alt+-', desc: '减小正文字号' },
      { keys: 'Alt+0', desc: '恢复默认字号' },
    ],
  },
]
