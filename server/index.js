import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const VAULT = path.join(ROOT, 'vault')
const WIKI_RE = /\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g

const app = express()
app.use(cors())
app.use(express.json({ limit: '20mb' }))

async function ensureVault() {
  await fs.mkdir(path.join(VAULT, 'diary'), { recursive: true })
  await fs.mkdir(path.join(VAULT, 'knowledge'), { recursive: true })
  await fs.mkdir(path.join(VAULT, 'assets', 'stickies'), { recursive: true })
}

function extFromMime(mime) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return map[mime] || 'png'
}

/** Rough size from PNG/JPEG/WebP/GIF headers when possible. */
function probeImageSize(buf) {
  try {
    // PNG
    if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
    // GIF
    if (buf.length > 10 && (buf.toString('ascii', 0, 3) === 'GIF')) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    }
    // JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) break
        const marker = buf[i + 1]
        const len = buf.readUInt16BE(i + 2)
        if (marker === 0xc0 || marker === 0xc2) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
        }
        i += 2 + len
      }
    }
    // WebP (simple VP8X / VP8)
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = buf.toString('ascii', 12, 16)
      if (chunk === 'VP8X' && buf.length >= 30) {
        const w = 1 + buf.readUIntLE(24, 3)
        const h = 1 + buf.readUIntLE(27, 3)
        return { width: w, height: h }
      }
      if (chunk === 'VP8 ' && buf.length >= 30) {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
      }
    }
  } catch {
    /* ignore */
  }
  return { width: 400, height: 300 }
}

app.use('/api/assets', express.static(path.join(VAULT, 'assets')))

app.post('/api/sticky-image', async (req, res) => {
  try {
    await ensureVault()
    const dataUrl = String(req.body.dataUrl || '')
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl)
    if (!m) return res.status(400).json({ error: 'invalid image dataUrl' })
    const mime = m[1]
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length > 12 * 1024 * 1024) {
      return res.status(400).json({ error: 'image too large (>12MB)' })
    }
    const id = String(req.body.id || `img_${Date.now().toString(36)}`).replace(
      /[^\w-]/g,
      '',
    )
    const ext = extFromMime(mime)
    const filename = `${id}_${Date.now().toString(36)}.${ext}`
    const dir = path.join(VAULT, 'assets', 'stickies')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, filename), buf)
    const size = probeImageSize(buf)
    res.json({
      ok: true,
      url: `/api/assets/stickies/${filename}`,
      width: size.width,
      height: size.height,
    })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

function safeJoin(kind, name) {
  if (!['diary', 'knowledge'].includes(kind)) throw new Error('invalid kind')
  const base = name.endsWith('.md') ? name : `${name}.md`
  const full = path.resolve(VAULT, kind, base)
  if (!full.startsWith(path.resolve(VAULT, kind))) throw new Error('path escape')
  return { full, base, title: base.replace(/\.md$/i, '') }
}

function asTitle(value, fallback) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (value == null || value === '') return fallback
  return String(value)
}

function dumpNote(title, content, extra = {}) {
  const data = { title: String(title), ...extra }
  if (Array.isArray(data.stickies) && data.stickies.length === 0) {
    delete data.stickies
  }
  return matter.stringify(content.replace(/^\uFEFF/, ''), data)
}

async function listKind(kind) {
  const dir = path.join(VAULT, kind)
  const files = await fs.readdir(dir)
  const items = []
  for (const f of files.filter((x) => x.endsWith('.md'))) {
    const full = path.join(dir, f)
    const raw = await fs.readFile(full, 'utf8')
    const { data, content } = matter(raw)
    const name = f.replace(/\.md$/i, '')
    const title = asTitle(data.title, name)
    const links = [...content.matchAll(WIKI_RE)].map((m) => m[1].trim())
    items.push({
      kind,
      name,
      filename: f,
      title,
      links: [...new Set(links)],
      updatedAt: (await fs.stat(full)).mtime.toISOString(),
      preview: content.replace(/\s+/g, ' ').trim().slice(0, 120),
    })
  }
  items.sort((a, b) => b.name.localeCompare(a.name))
  return items
}

async function buildGraph() {
  const diaries = await listKind('diary')
  const knowledge = await listKind('knowledge')
  const all = [...diaries, ...knowledge]
  const byTitle = new Map()
  for (const n of all) {
    byTitle.set(n.title, n)
    byTitle.set(n.name, n)
  }

  const forward = {}
  const backlinks = {}
  for (const n of all) {
    const key = `${n.kind}/${n.name}`
    forward[key] = []
    for (const link of n.links) {
      const target = byTitle.get(link)
      const targetKey = target ? `${target.kind}/${target.name}` : `missing/${link}`
      forward[key].push({ title: link, target: target || null, targetKey })
      if (!backlinks[targetKey]) backlinks[targetKey] = []
      backlinks[targetKey].push({
        kind: n.kind,
        name: n.name,
        title: n.title,
        key,
      })
    }
  }
  return { notes: all, forward, backlinks }
}

app.get('/api/tree', async (_req, res) => {
  try {
    await ensureVault()
    const [diary, knowledge] = await Promise.all([listKind('diary'), listKind('knowledge')])
    res.json({ diary, knowledge })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.get('/api/graph', async (_req, res) => {
  try {
    await ensureVault()
    res.json(await buildGraph())
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.get('/api/note/:kind/:name', async (req, res) => {
  try {
    const { full, title } = safeJoin(req.params.kind, req.params.name)
    const raw = await fs.readFile(full, 'utf8')
    const { data, content } = matter(raw)
    const graph = await buildGraph()
    const key = `${req.params.kind}/${title}`
    const displayTitle = asTitle(data.title, title)
    const stickies = Array.isArray(data.stickies) ? data.stickies : []
    res.json({
      kind: req.params.kind,
      name: title,
      title: displayTitle,
      frontmatter: { ...data, title: displayTitle },
      stickies,
      content,
      raw,
      outgoing: graph.forward[key] || [],
      backlinks: graph.backlinks[key] || [],
    })
  } catch (e) {
    res.status(404).json({ error: String(e.message || e) })
  }
})

app.put('/api/note/:kind/:name', async (req, res) => {
  try {
    const { full, title } = safeJoin(req.params.kind, req.params.name)
    const content = String(req.body.content ?? '')
    const fmTitle = asTitle(req.body.title, title)
    const stickies = Array.isArray(req.body.stickies) ? req.body.stickies : undefined
    // Preserve existing stickies if client didn't send them
    let extra = {}
    if (stickies) {
      extra = { stickies }
    } else {
      try {
        const raw = await fs.readFile(full, 'utf8')
        const prev = matter(raw).data || {}
        if (Array.isArray(prev.stickies)) extra = { stickies: prev.stickies }
      } catch {
        /* new-ish file */
      }
    }
    await fs.writeFile(full, dumpNote(fmTitle, content, extra), 'utf8')
    res.json({ ok: true, name: title })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

function sanitizeName(raw) {
  return String(raw || '')
    .trim()
    .replace(/\.md$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
}

/** Rewrite [[old]] / [[old|alias]] → [[new]] / [[new|alias]] in note body. */
function rewriteWikiLinks(content, fromTitle, toTitle) {
  if (!fromTitle || fromTitle === toTitle) return content
  const esc = fromTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\[\\[${esc}(\\|[^\\]]*)?\\]\\]`, 'g')
  return content.replace(re, (_m, alias) => `[[${toTitle}${alias || ''}]]`)
}

// Register before /api/note and /api/note/:kind/:name
app.post('/api/note/rename', async (req, res) => {
  try {
    const kind = req.body.kind
    const from = sanitizeName(req.body.from || req.body.name)
    const to = sanitizeName(req.body.to || req.body.newName)
    if (!['diary', 'knowledge'].includes(kind)) {
      return res.status(400).json({ error: 'invalid kind' })
    }
    if (!from || !to) return res.status(400).json({ error: 'from/to required' })
    if (from === to) return res.json({ ok: true, kind, name: to, title: to })

    const src = safeJoin(kind, from)
    const dest = safeJoin(kind, to)
    try {
      await fs.access(src.full)
    } catch {
      return res.status(404).json({ error: 'source not found' })
    }
    try {
      await fs.access(dest.full)
      return res.status(409).json({ error: 'already exists', name: to })
    } catch {
      /* free */
    }

    const raw = await fs.readFile(src.full, 'utf8')
    const parsed = matter(raw)
    const oldTitle = asTitle(parsed.data.title, from)
    const extra = { ...parsed.data }
    delete extra.title
    const body = rewriteWikiLinks(parsed.content, oldTitle, to)
    await fs.writeFile(dest.full, dumpNote(to, body, extra), 'utf8')
    await fs.unlink(src.full)

    for (const k of ['diary', 'knowledge']) {
      const dir = path.join(VAULT, k)
      const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'))
      for (const f of files) {
        if (k === kind && f === dest.base) continue
        const full = path.join(dir, f)
        const text = await fs.readFile(full, 'utf8')
        const p = matter(text)
        let next = rewriteWikiLinks(p.content, oldTitle, to)
        if (oldTitle !== from) next = rewriteWikiLinks(next, from, to)
        if (next === p.content) continue
        const fm = { ...p.data }
        const t = asTitle(fm.title, f.replace(/\.md$/i, ''))
        delete fm.title
        await fs.writeFile(full, dumpNote(t, next, fm), 'utf8')
      }
    }

    res.json({ ok: true, kind, name: to, title: to, from })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.post('/api/note', async (req, res) => {
  try {
    const kind = req.body.kind
    let name = String(req.body.name || '').trim().replace(/\.md$/i, '')
    name = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim()
    if (kind === 'diary' && !name) {
      name = new Date().toISOString().slice(0, 10)
    }
    if (!name) return res.status(400).json({ error: 'name required' })
    const { full, title } = safeJoin(kind, name)
    try {
      await fs.access(full)
      return res.status(409).json({ error: `already exists: ${title}`, name: title })
    } catch {
      /* create */
    }

    let body = req.body.content
    if (typeof body === 'string' && body.length) {
      const parsed = matter(body)
      const fmTitle = asTitle(parsed.data.title, title)
      const content = parsed.content.trim()
        ? parsed.content
        : `# ${fmTitle}\n\n`
      await fs.writeFile(full, dumpNote(fmTitle, content), 'utf8')
      return res.json({ ok: true, kind, name: title, title: fmTitle })
    }

    const starter =
      kind === 'diary'
        ? `# ${title}\n\n## 今日记录\n\n- \n\n## 关联知识\n\n\n`
        : `# ${title}\n\n## 定义\n\n\n## 要点\n\n- \n\n## 相关日记\n\n\n`
    await fs.writeFile(full, dumpNote(title, starter), 'utf8')
    res.json({ ok: true, kind, name: title, title })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.delete('/api/note/:kind/:name', async (req, res) => {
  try {
    const { full } = safeJoin(req.params.kind, req.params.name)
    await fs.unlink(full)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

const PORT = Number(process.env.PORT || 18788)
await ensureVault()
const server = app.listen(PORT, () => {
  console.log(`Vault API http://localhost:${PORT}`)
})
server.on('error', (err) => {
  console.error('Server error:', err)
  process.exit(1)
})
