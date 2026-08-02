import type { StickyNote } from './lib/sticky'

export type NoteMeta = {
  kind: 'diary' | 'knowledge'
  name: string
  filename: string
  title: string
  links: string[]
  updatedAt: string
  preview: string
}

export type NoteDetail = {
  kind: 'diary' | 'knowledge'
  name: string
  title: string
  content: string
  stickies?: StickyNote[]
  outgoing: { title: string; target: NoteMeta | null; targetKey: string }[]
  backlinks: { kind: 'diary' | 'knowledge'; name: string; title: string; key: string }[]
}

const BASE = '/api'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data as T
}

export const api = {
  tree: () => json<{ diary: NoteMeta[]; knowledge: NoteMeta[] }>('/tree'),
  getNote: (kind: string, name: string) =>
    json<NoteDetail>(`/note/${kind}/${encodeURIComponent(name)}`),
  saveNote: (
    kind: string,
    name: string,
    content: string,
    title?: string,
    stickies?: StickyNote[],
  ) =>
    json<{ ok: boolean }>(`/note/${kind}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title, stickies }),
    }),
  createNote: (kind: 'diary' | 'knowledge', name?: string, content?: string) =>
    json<{ ok: boolean; name: string; title?: string }>('/note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, name, content }),
    }),
  deleteNote: (kind: string, name: string) =>
    json<{ ok: boolean }>(`/note/${kind}/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  uploadStickyImage: (dataUrl: string, id?: string) =>
    json<{ ok: boolean; url: string; width: number; height: number }>(
      '/sticky-image',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, id }),
      },
    ),
}
