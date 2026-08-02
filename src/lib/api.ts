export type NoteType = 'diary' | 'knowledge'

export type FileItem = {
  name: string
  path: string
  type: NoteType
}

export type NoteFile = {
  path: string
  name: string
  type: NoteType | 'other'
  content: string
}

export type BacklinkInfo = {
  name: string
  path: string
  incoming: { fromPath: string; fromName: string; fromType: string }[]
  outgoing: {
    name: string
    path: string | null
    type: string | null
    exists: boolean
  }[]
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || res.statusText)
  }
  return data as T
}

export function listFiles() {
  return request<{ diary: FileItem[]; knowledge: FileItem[] }>('/api/files')
}

export function getFile(path: string) {
  return request<NoteFile>(`/api/file?path=${encodeURIComponent(path)}`)
}

export function saveFile(path: string, content: string) {
  return request<{ ok: boolean }>('/api/file', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  })
}

export function createFile(type: NoteType, name: string) {
  return request<{ ok: boolean; path: string; name: string; type: NoteType }>(
    '/api/file',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name }),
    },
  )
}

export function deleteFile(path: string) {
  return request<{ ok: boolean }>(
    `/api/file?path=${encodeURIComponent(path)}`,
    { method: 'DELETE' },
  )
}

export function getBacklinks(path: string) {
  return request<BacklinkInfo>(
    `/api/backlinks?path=${encodeURIComponent(path)}`,
  )
}

export function resolveWiki(name: string) {
  return request<{ exists: boolean; name: string; path?: string; type?: string }>(
    `/api/resolve?name=${encodeURIComponent(name)}`,
  )
}
