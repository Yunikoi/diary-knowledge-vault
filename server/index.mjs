import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const VAULT = path.join(ROOT, 'vault')
const DIARY_DIR = path.join(VAULT, 'diary')
const KNOWLEDGE_DIR = path.join(VAULT, 'knowledge')

const app = express()
const PORT = 8787

app.use(cors())
app.use(express.json({ limit: '5mb' }))

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g

async function ensureVault() {
  await fs.mkdir(DIARY_DIR, { recursive: true })
  await fs.mkdir(KNOWLEDGE_DIR, { recursive: true })

  const readme = path.join(VAULT, 'README.md')
  try {
    await fs.access(readme)
  } catch {
    await fs.writeFile(
      readme,
      `# Vault

- \`diary/\` 日记
- \`knowledge/\` 知识文件

用 \`[[文件名]]\` 双向连接，例如：\`[[机器学习]]\`、\`[[2026-08-02]]\`。
`,
      'utf8',
    )
  }

  const sampleKnowledge = path.join(KNOWLEDGE_DIR, '快速开始.md')
  try {
    await fs.access(sampleKnowledge)
  } catch {
    await fs.writeFile(
      sampleKnowledge,
      `# 快速开始

这是一个知识文件。

## 用法

1. 左侧新建日记或知识文件
2. 正文里写 \`[[快速开始]]\` 或 \`[[日期]]\`
3. 右侧「反向链接」会显示谁连到了这里

今天可以在日记里写：今天学了 [[快速开始]]。
`,
      'utf8',
    )
  }

  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const todayName = `${y}-${m}-${d}.md`
  const todayPath = path.join(DIARY_DIR, todayName)
  try {
    await fs.access(todayPath)
  } catch {
    await fs.writeFile(
      todayPath,
      `# ${y}-${m}-${d}

## 今日记录

- 试用双向链接：[[快速开始]]

## 想法


`,
      'utf8',
    )
  }
}

function assertSafeRel(rel) {
  const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (
    normalized.includes('..') ||
    (!normalized.startsWith('diary/') &&
      !normalized.startsWith('knowledge/') &&
      normalized !== 'README.md')
  ) {
    throw new Error('非法路径')
  }
  return normalized
}

function absFromRel(rel) {
  return path.join(VAULT, assertSafeRel(rel))
}

async function listMarkdownFiles(dir, prefix) {
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const ent of entries) {
    if (ent.isFile() && ent.name.endsWith('.md')) {
      files.push({
        name: ent.name.replace(/\.md$/, ''),
        path: `${prefix}/${ent.name}`,
        type: prefix,
      })
    }
  }
  return files.sort((a, b) => b.name.localeCompare(a.name))
}

function extractLinks(content) {
  const links = new Set()
  let m
  const re = new RegExp(WIKI_LINK_RE.source, 'g')
  while ((m = re.exec(content)) !== null) {
    links.add(m[1].trim())
  }
  return [...links]
}

async function buildIndex() {
  const diary = await listMarkdownFiles(DIARY_DIR, 'diary')
  const knowledge = await listMarkdownFiles(KNOWLEDGE_DIR, 'knowledge')
  const all = [...diary, ...knowledge]
  const byName = new Map()
  for (const f of all) {
    byName.set(f.name, f)
  }

  const forward = {}
  const backlinks = {}

  for (const f of all) {
    const content = await fs.readFile(path.join(VAULT, f.path), 'utf8')
    const links = extractLinks(content)
    forward[f.path] = links
    for (const target of links) {
      if (!backlinks[target]) backlinks[target] = []
      backlinks[target].push({
        fromPath: f.path,
        fromName: f.name,
        fromType: f.type,
      })
    }
  }

  return { diary, knowledge, all, byName: Object.fromEntries(byName), forward, backlinks }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/files', async (_req, res) => {
  try {
    const index = await buildIndex()
    res.json({
      diary: index.diary,
      knowledge: index.knowledge,
    })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.get('/api/file', async (req, res) => {
  try {
    const rel = assertSafeRel(String(req.query.path || ''))
    const abs = absFromRel(rel)
    const content = await fs.readFile(abs, 'utf8')
    const name = path.basename(rel, '.md')
    const type = rel.startsWith('diary/') ? 'diary' : rel.startsWith('knowledge/') ? 'knowledge' : 'other'
    res.json({ path: rel, name, type, content })
  } catch (e) {
    res.status(404).json({ error: String(e.message || e) })
  }
})

app.put('/api/file', async (req, res) => {
  try {
    const rel = assertSafeRel(String(req.body.path || ''))
    const content = String(req.body.content ?? '')
    const abs = absFromRel(rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf8')
    res.json({ ok: true, path: rel })
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) })
  }
})

app.post('/api/file', async (req, res) => {
  try {
    const type = req.body.type === 'diary' ? 'diary' : 'knowledge'
    let name = String(req.body.name || '').trim()
    if (!name) {
      return res.status(400).json({ error: '名称不能为空' })
    }
    name = name.replace(/[<>:"/\\|?*]/g, '').replace(/\.md$/i, '')
    if (!name) {
      return res.status(400).json({ error: '名称非法' })
    }

    const rel = `${type}/${name}.md`
    const abs = absFromRel(rel)
    try {
      await fs.access(abs)
      return res.status(409).json({ error: '文件已存在' })
    } catch {
      /* create */
    }

    const title = name
    const seed =
      type === 'diary'
        ? `# ${title}\n\n## 今日记录\n\n- \n\n## 关联知识\n\n\n`
        : `# ${title}\n\n\n`

    await fs.writeFile(abs, seed, 'utf8')
    res.json({ ok: true, path: rel, name, type })
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) })
  }
})

app.delete('/api/file', async (req, res) => {
  try {
    const rel = assertSafeRel(String(req.query.path || req.body?.path || ''))
    const abs = absFromRel(rel)
    await fs.unlink(abs)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) })
  }
})

app.get('/api/backlinks', async (req, res) => {
  try {
    const rel = assertSafeRel(String(req.query.path || ''))
    const name = path.basename(rel, '.md')
    const index = await buildIndex()
    const incoming = index.backlinks[name] || []
    const outgoingNames = index.forward[rel] || []
    const outgoing = outgoingNames.map((n) => {
      const hit = index.byName[n]
      return hit
        ? { name: n, path: hit.path, type: hit.type, exists: true }
        : { name: n, path: null, type: null, exists: false }
    })
    res.json({ name, path: rel, incoming, outgoing })
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) })
  }
})

app.get('/api/resolve', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim()
    const index = await buildIndex()
    const hit = index.byName[name]
    if (!hit) {
      return res.json({ exists: false, name })
    }
    res.json({ exists: true, ...hit })
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) })
  }
})

await ensureVault()

app.listen(PORT, () => {
  console.log(`Vault API http://localhost:${PORT}`)
  console.log(`Vault folder: ${VAULT}`)
})
