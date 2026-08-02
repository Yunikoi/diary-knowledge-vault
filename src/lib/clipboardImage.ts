function looksLikeImage(file: File) {
  if (file.type.startsWith('image/')) return true
  // Explorer 复制文件时 type 经常是空的
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)) return true
  return false
}

/** 从剪贴板事件里尽量抠出图片文件（截图 / 复制图片 / 复制图片文件） */
export function extractClipboardImage(
  clipboardData: DataTransfer | null | undefined,
): File | null {
  if (!clipboardData) return null

  const items = clipboardData.items
  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) return file
      }
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file && looksLikeImage(file)) return file
      }
    }
  }

  const files = clipboardData.files
  if (files?.length) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (looksLikeImage(file)) return file
    }
  }

  return null
}

export function isImageFile(file: File) {
  return looksLikeImage(file)
}
