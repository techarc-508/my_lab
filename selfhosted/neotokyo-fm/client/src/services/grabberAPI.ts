import { API_BASE } from '../config'
import type { HealthResponse, ServerSettings, BatchRecord, RadioStation, Download, NowPlaying, YTSearchResult, PlaylistItem, SystemInfo, FileMeta, BackupRecord, AlbumArtResult } from '../types/audio'

const FETCH_TIMEOUT = 8000

let _csrfToken = ''

export function getCsrfToken(): string {
  return _csrfToken
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function loadCsrfToken(): Promise<void> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/csrf-token`, { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      _csrfToken = data.csrf_token
    }
  } catch {}
}

export async function ensureCsrfToken(): Promise<void> {
  if (!_csrfToken) await loadCsrfToken()
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!_csrfToken && options.method && options.method !== 'GET') {
    await ensureCsrfToken()
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_csrfToken && options.method && options.method !== 'GET') {
    headers['X-CSRF-Token'] = _csrfToken
  }
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers as Record<string, string> },
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function getHealth(): Promise<HealthResponse> {
  return req('/api/health')
}

export function getSettings(): Promise<ServerSettings> {
  return req('/api/settings')
}

export function login(username: string, password: string): Promise<{ auth: boolean }> {
  return req('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export function logout(): Promise<{ auth: boolean }> {
  return req('/api/logout', { method: 'POST' })
}

export function checkAuth(): Promise<{ auth: boolean }> {
  return req('/api/check-auth')
}

export function listFiles(limit = 0, offset = 0): Promise<{ files: FileMeta[]; count: number; total: number }> {
  return req(`/api/files?limit=${limit}&offset=${offset}`)
}

export function getMetadata(filename: string): Promise<FileMeta> {
  return req(`/api/metadata/${encodeURIComponent(filename)}`)
}

export function listDownloads(): Promise<Download[]> {
  return req('/api/downloads')
}

export function getDownload(downloadId: string): Promise<Download> {
  return req(`/api/downloads/${downloadId}`)
}

export function startDownload(files: { url: string; filename?: string }[], duplicates = 'replace', format?: string): Promise<{ downloads: Download[]; count: number }> {
  return req('/api/downloads', { method: 'POST', body: JSON.stringify({ files, duplicates, format }) })
}

export function retryFailedDownloads(): Promise<{ retried: number }> {
  return req('/api/downloads/retry-all', { method: 'POST' })
}

export function deleteDownload(downloadId: string): Promise<{ ok: boolean }> {
  return req(`/api/downloads/${downloadId}`, { method: 'DELETE' })
}

export function deleteFiles(files: string[]): Promise<{ deleted: number }> {
  return req('/api/delete', { method: 'POST', body: JSON.stringify({ files }) })
}

export function getRadioStations(): Promise<RadioStation[]> {
  return req('/api/radio-stations')
}

export function saveRadioStations(stations: RadioStation[]): Promise<{ ok: boolean }> {
  return req('/api/radio-stations', { method: 'POST', body: JSON.stringify({ stations }) })
}

export function restoreDefaultStations(): Promise<{ ok: boolean }> {
  return req('/api/radio-stations/defaults')
}

export function testRadioStation(url: string): Promise<{ ok: boolean; message: string }> {
  return req(`/api/radio-metadata?url=${encodeURIComponent(url)}`)
}

export function getRadioNowPlaying(url: string): Promise<NowPlaying> {
  return req(`/api/radio-info?url=${encodeURIComponent(url)}`)
}

export interface RadioBrowserStation {
  name: string
  url: string
  genre: string
  tags: string
  codec: string
  bitrate: number
  country: string
  language: string
}

export function searchRadioBrowser(query: string, genre = '', limit = 20): Promise<{ results: RadioBrowserStation[]; count: number }> {
  return req('/api/radio-stations/search', { method: 'POST', body: JSON.stringify({ query, genre, limit }) })
}

export function getBatchHistory(): Promise<BatchRecord[]> {
  return req('/api/stats/batch-history')
}

export function getAdminStats(): Promise<{ total_files: number; total_size: number; download_dir: string }> {
  return req('/api/stats')
}

export function getSystemInfo(): Promise<SystemInfo> {
  return req('/api/admin/system')
}

export function getLibraryBreakdown(): Promise<{ total_files: number; genres: { name: string; count: number }[]; formats: { ext: string; count: number }[]; with_lyrics: number }> {
  return req('/api/stats/library-breakdown')
}

export function retryMetadata(): Promise<{ scanned: number }> {
  return req('/api/retry-metadata', { method: 'POST' })
}

export function searchYouTube(query: string, page = 1, perPage = 10): Promise<{ results: YTSearchResult[]; count: number; total: number; has_more: boolean }> {
  return req('/api/yt-search', { method: 'POST', body: JSON.stringify({ query, page, per_page: perPage }) })
}

export function expandPlaylist(url: string): Promise<{ files: { url: string; filename: string; title: string }[]; count: number; error?: string }> {
  return req('/api/expand-playlist', { method: 'POST', body: JSON.stringify({ url }) })
}

export function previewDownloads(files: { url: string; filename?: string }[]): Promise<{ files: { url: string; filename: string; title: string; duration?: number; filesize?: number; uploader?: string; thumbnail?: string; extractor?: string; streaming?: boolean }[]; count: number; total_size: number }> {
  return req('/api/preview', { method: 'POST', body: JSON.stringify({ files }) })
}

export function getPlaylists(): Promise<PlaylistItem[]> {
  return req('/api/playlists')
}

export function createPlaylist(name: string): Promise<{ ok: boolean }> {
  return req('/api/playlists', { method: 'POST', body: JSON.stringify({ name }) })
}

export function updatePlaylist(name: string, tracks: PlaylistItem[]): Promise<{ ok: boolean }> {
  return req(`/api/playlists/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ tracks }) })
}

export function deletePlaylist(name: string): Promise<{ ok: boolean }> {
  return req(`/api/playlists/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export function getBackups(): Promise<BackupRecord[]> {
  return req('/api/backups')
}

export function createBackup(): Promise<{ ok: boolean; version?: number }> {
  return req('/api/backups', { method: 'POST', body: JSON.stringify({}) })
}

export function deleteBackup(backupId: string): Promise<any> {
  return req(`/api/backups/${backupId}`, { method: 'DELETE' })
}

export function changePassword(currentPassword: string, password: string, username?: string): Promise<{ ok: boolean }> {
  return req('/api/settings', { method: 'PUT', body: JSON.stringify({ username, password, current_password: currentPassword }) })
}

export function clearPlayStats(): Promise<{ ok: boolean }> {
  return req('/api/stats/clear-plays', { method: 'POST' })
}

export function resetLrclib(): Promise<{ ok: boolean }> {
  return req('/api/admin/reset-lrclib', { method: 'POST' })
}

export function getLogs(lines = 200): Promise<string> {
  return fetchWithTimeout(`${API_BASE}/api/logs?lines=${lines}`, { credentials: 'include' }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.text()
  })
}

export function browseDirectory(path = ''): Promise<{ path: string; dirs: string[] }> {
  return req('/api/browse', { method: 'POST', body: JSON.stringify({ path }) })
}

export function getWebhooks(): Promise<any[]> {
  return req('/api/admin/webhooks')
}

export function saveWebhooks(webhooks: any[]): Promise<any[]> {
  return req('/api/admin/webhooks', { method: 'POST', body: JSON.stringify({ webhooks }) })
}

export function testWebhook(url: string): Promise<{ ok: boolean; status: number }> {
  return req('/api/admin/webhooks/test', { method: 'POST', body: JSON.stringify({ url }) })
}

export function updateFileMetadata(name: string, updates: Record<string, string>): Promise<{ ok: boolean }> {
  return req(`/api/files/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(updates) })
}

export function batchUpdateMetadata(files: { name: string; title?: string; artist?: string; album?: string; genre?: string }[]): Promise<{ updated: number }> {
  return req('/api/files/batch-update', { method: 'POST', body: JSON.stringify({ files }) })
}

export function uploadCover(name: string, file: File, timeout = 30000): Promise<{ ok: boolean }> {
  const form = new FormData()
  form.append('file', file)
  const headers: Record<string, string> = {}
  if (_csrfToken) headers['X-CSRF-Token'] = _csrfToken
  return fetchWithTimeout(`${API_BASE}/api/files/cover/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: form,
  }, timeout).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
}

export function deleteCover(name: string): Promise<{ ok: boolean }> {
  return req(`/api/files/cover/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export function logPlay(title: string, artist?: string, album?: string): Promise<{ ok: boolean }> {
  return req('/api/play/log', { method: 'POST', body: JSON.stringify({ title, artist, album }) })
}

export function getTopPlays(limit = 20): Promise<{ title: string; artist: string; count: number }[]> {
  return req(`/api/stats/plays?limit=${limit}`)
}

export function getTopArtists(limit = 20): Promise<{ artist: string; count: number }[]> {
  return req(`/api/stats/artists?limit=${limit}`)
}

export function getRecentPlays(limit = 30): Promise<{ title: string; artist: string; played_at: string; ip: string }[]> {
  return req(`/api/stats/recent-plays?limit=${limit}`)
}

export function getRecentVisits(limit = 30): Promise<{ ip: string; username: string; path: string; visited_at: string }[]> {
  return req(`/api/stats/visits?limit=${limit}`)
}

export function uploadLocalFile(file: File, timeout = 120000): Promise<{ ok: boolean; filename: string; size: number }> {
  const form = new FormData()
  form.append('file', file)
  const headers: Record<string, string> = {}
  if (_csrfToken) headers['X-CSRF-Token'] = _csrfToken
  return fetchWithTimeout(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: form,
  }, timeout).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
}

export function scanMetadata(): Promise<{ scanned: number }> {
  return req('/api/scan-metadata', { method: 'POST', body: JSON.stringify({}) })
}

export function searchAlbumArt(title: string, artist?: string): Promise<{ results: AlbumArtResult[]; count: number }> {
  return req('/api/search-album-art', { method: 'POST', body: JSON.stringify({ title, artist }) })
}

export function applyAlbumArt(filename: string, artworkUrl: string): Promise<{ ok: boolean }> {
  return req('/api/apply-album-art', { method: 'POST', body: JSON.stringify({ filename, artwork_url: artworkUrl }) })
}

export function findCover(filename: string, title?: string, artist?: string): Promise<{ cover_url: string; source: string; title: string; artist: string }> {
  return req('/api/find-cover', { method: 'POST', body: JSON.stringify({ filename, title, artist }) })
}

export function updateFileTags(filename: string, updates: Record<string, string>): Promise<{ ok: boolean }> {
  return req(`/api/update-tags/${encodeURIComponent(filename)}`, { method: 'POST', body: JSON.stringify(updates) })
}

export function fetchLyrics(filename?: string, target: 'all' | 'force' = 'all'): Promise<{ fetched: number; skipped: number; errors: number; files: { filename: string; status: string }[] }> {
  return req('/api/fetch-lyrics', { method: 'POST', body: JSON.stringify({ filename, target }) })
}
