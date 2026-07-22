import { API_BASE } from '../config'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma'])

function getAuthToken(): string {
  try { return localStorage.getItem('neotokyo-auth-token') || '' } catch { return '' }
}

function isAudioFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return AUDIO_EXTENSIONS.has(ext)
}

export async function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const formData = new FormData()
    formData.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/api/upload`)
    const token = getAuthToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
    xhr.onerror = () => resolve(false)
    xhr.send(formData)
  })
}

export async function walkDirectory(dirHandle: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = []
  const queue: FileSystemDirectoryHandle[] = [dirHandle]
  while (queue.length > 0) {
    const current = queue.shift()!
    for await (const entry of (current as any).values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile()
        if (isAudioFile(file.name)) files.push(file)
      } else if (entry.kind === 'directory') {
        queue.push(entry)
      }
    }
  }
  return files
}

export async function uploadFiles(
  files: File[],
  onProgress: (current: number, total: number) => void,
): Promise<number> {
  let uploaded = 0
  for (let i = 0; i < files.length; i++) {
    const ok = await uploadFile(files[i], () => {})
    if (ok) uploaded++
    onProgress(i + 1, files.length)
  }
  return uploaded
}
