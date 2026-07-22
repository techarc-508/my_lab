import { API_BASE } from '../config'
import type { HealthResponse, ServerSettings, BatchRecord, RadioStation, Download, NowPlaying, YTSearchResult, PlaylistItem, SystemInfo, FileMeta, BackupRecord, AlbumArtResult, AuthResponse, UserRecord, UserProfile, Session, Podcast, PodcastEpisode, PodcastCategory, PodcastProgress } from '../types/audio'

const FETCH_TIMEOUT = 8000

function _getToken(): string {
  try { return localStorage.getItem('neotokyo-auth-token') || '' } catch { return '' }
}

function _setToken(token: string) {
  try { localStorage.setItem('neotokyo-auth-token', token) } catch {}
}

function _clearToken() {
  try { localStorage.removeItem('neotokyo-auth-token') } catch {}
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

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = _getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers as Record<string, string> },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 401) {
      _clearToken()
    }
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function getAuthToken(): string {
  return _getToken()
}

export function getCsrfToken(): string {
  try { return localStorage.getItem('csrfToken') || '' } catch { return '' }
}

export function isLoggedIn(): boolean {
  return !!_getToken()
}

export function getHealth(): Promise<HealthResponse> {
  return req('/api/health')
}

export function getSettings(): Promise<ServerSettings> {
  return req('/api/settings')
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')
  if (data.token) _setToken(data.token)
  return data
}

export async function logout(): Promise<{ auth: boolean }> {
  const token = _getToken()
  if (token) {
    await fetch(`${API_BASE}/api/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    }).catch(() => {})
    _clearToken()
  }
  return { auth: false }
}

export async function checkAuth(): Promise<AuthResponse> {
  const token = _getToken()
  if (!token) return { auth: false }
  try {
    return await req('/api/check-auth')
  } catch {
    _clearToken()
    return { auth: false }
  }
}

export function listUsers(): Promise<UserRecord[]> {
  return req('/api/users')
}

export function createUserAPI(username: string, password: string, role: string = 'user'): Promise<UserRecord> {
  return req('/api/users', { method: 'POST', body: JSON.stringify({ username, password, role }) })
}

// --- Profile API ---

export function getProfile(): Promise<UserProfile> {
  return req('/api/profile')
}

export function updateProfile(data: { display_name?: string; email?: string }): Promise<{ ok: boolean }> {
  return req('/api/profile', { method: 'PUT', body: JSON.stringify(data) })
}

export function uploadAvatar(file: File, timeout = 30000): Promise<{ ok: boolean; avatar_path: string }> {
  const form = new FormData()
  form.append('file', file)
  return fetchWithTimeout(`${API_BASE}/api/profile/avatar`, {
    method: 'POST',
    headers: _authHeaders(),
    body: form,
  }, timeout).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
}

export function deleteAvatar(): Promise<{ ok: boolean }> {
  return req('/api/profile/avatar', { method: 'DELETE' })
}

export function getSessions(): Promise<Session[]> {
  return req('/api/profile/sessions')
}

export function revokeSession(sessionId: number): Promise<{ ok: boolean }> {
  return req(`/api/profile/sessions/${sessionId}`, { method: 'DELETE' })
}

export function deleteAccount(): Promise<{ ok: boolean }> {
  return req('/api/profile/account', { method: 'DELETE' })
}

// --- Admin user management ---

export function updateUser(userId: number, data: { username?: string; role?: string; email?: string; display_name?: string; is_active?: boolean }): Promise<{ ok: boolean }> {
  return req(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteUser(userId: number): Promise<{ ok: boolean }> {
  return req(`/api/users/${userId}`, { method: 'DELETE' })
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

function _authHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const t = _getToken()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

export function uploadCover(name: string, file: File, timeout = 30000): Promise<{ ok: boolean }> {
  const form = new FormData()
  form.append('file', file)
  return fetchWithTimeout(`${API_BASE}/api/files/cover/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: _authHeaders(),
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
  return fetchWithTimeout(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers: _authHeaders(),
    body: form,
  }, timeout).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
}

export function scanMetadata(): Promise<{ scanned: number; running?: boolean }> {
  return req('/api/scan-metadata', { method: 'POST', body: JSON.stringify({}) })
}

export function getScannerStatus(): Promise<any> {
  return req('/api/scanner-status')
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

export function searchFiles(query: string): Promise<{ results: any[]; count: number }> {
  return req(`/api/search?q=${encodeURIComponent(query)}`)
}

export function resolveVideoId(trackName: string): Promise<{ videoId: string; thumbnail: string; title: string; duration: number } | null> {
  return fetch(`${API_BASE}/api/yt-video/${encodeURIComponent(trackName)}`, {
    headers: { 'Authorization': `Bearer ${_getToken()}` },
  }).then(r => {
    if (!r.ok) return null
    return r.json()
  }).catch(() => null)
}

export function checkForUpdate(): Promise<{ current: string; latest: string; update_available: boolean; release_notes: string }> {
  return req('/api/update/check')
}

export function applyUpdate(): Promise<{ status: string }> {
  return req('/api/update/apply', { method: 'POST' })
}

export function getUpdateStatus(): Promise<{ status: string; message: string }> {
  return req('/api/update/status')
}

export function getLibraryTree(): Promise<{ tree: any[]; count: number }> {
  return req('/api/library/tree')
}

export function getAnalyticsOverview(): Promise<{ top_tracks: any[]; top_artists: any[]; plays_24h: number; total_plays: number }> {
  return req('/api/analytics/overview')
}

export function getIngestionLog(limit = 20): Promise<any[]> {
  return req(`/api/admin/ingestion-log?limit=${limit}`)
}

// --- Podcast API ---

export function listPodcasts(): Promise<Podcast[]> {
  return req('/api/podcasts')
}

export function subscribePodcast(feedUrl: string): Promise<Podcast> {
  return req('/api/podcasts', { method: 'POST', body: JSON.stringify({ feed_url: feedUrl }) })
}

export function getPodcast(id: number): Promise<Podcast> {
  return req(`/api/podcasts/${id}`)
}

export function unsubscribePodcast(id: number): Promise<{ ok: boolean }> {
  return req(`/api/podcasts/${id}`, { method: 'DELETE' })
}

export function syncPodcast(id: number): Promise<{ ok: boolean }> {
  return req(`/api/podcasts/${id}/sync`, { method: 'POST' })
}

export function syncAllPodcasts(): Promise<{ syncing: number }> {
  return req('/api/podcasts/sync-all', { method: 'POST' })
}

export function toggleAutoDownload(id: number, enabled: boolean): Promise<{ ok: boolean; auto_download: boolean }> {
  return req(`/api/podcasts/${id}/auto-download`, { method: 'PUT', body: JSON.stringify({ enabled }) })
}

export function listPodcastEpisodes(id: number, limit = 100, offset = 0): Promise<{ episodes: PodcastEpisode[]; count: number; total: number }> {
  return req(`/api/podcasts/${id}/episodes?limit=${limit}&offset=${offset}`)
}

export function markEpisodePlayed(episodeId: number): Promise<{ ok: boolean }> {
  return req(`/api/podcasts/episodes/${episodeId}/play`, { method: 'POST' })
}

export function downloadPodcastEpisode(episodeId: number): Promise<{ ok: boolean; queued?: boolean; filename?: string }> {
  return req(`/api/podcasts/episodes/${episodeId}/download`, { method: 'POST' })
}

export function searchPodcasts(query: string): Promise<{ results: Podcast[]; count: number }> {
  return req(`/api/podcasts/search?q=${encodeURIComponent(query)}`)
}

export function exportPodcastsOpml(): Promise<Blob> {
  return fetchWithTimeout(`${API_BASE}/api/podcasts/opml`, {
    headers: { 'Authorization': `Bearer ${_getToken()}` },
  }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob() })
}

export function importPodcastsOpml(xmlContent: string): Promise<{ added: number; total: number }> {
  return fetchWithTimeout(`${API_BASE}/api/podcasts/opml`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${_getToken()}`, 'Content-Type': 'text/xml' },
    body: xmlContent,
  }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
}

export function subscribePodcastFromYoutube(youtubeUrl: string, title?: string): Promise<Podcast> {
  return req('/api/podcasts/from-youtube', { method: 'POST', body: JSON.stringify({ youtube_url: youtubeUrl, title }) })
}

export function adminListPodcasts(): Promise<Podcast[]> {
  return req('/api/admin/podcasts')
}

export function adminDeletePodcast(id: number): Promise<{ ok: boolean }> {
  return req(`/api/admin/podcasts/${id}`, { method: 'DELETE' })
}

export function adminSyncAllPodcasts(): Promise<{ syncing: number }> {
  return req('/api/admin/podcasts/sync-all', { method: 'POST' })
}

export function adminSeedPodcasts(): Promise<{ ok: boolean; count: number }> {
  return req('/api/admin/podcasts/seed', { method: 'POST' })
}

export function getPodcastCategories(): Promise<PodcastCategory[]> {
  return req('/api/podcasts/categories')
}

export function getEpisodeProgress(episodeId: number): Promise<PodcastProgress | null> {
  return req(`/api/podcasts/episodes/${episodeId}/progress`)
}

export function setEpisodeProgress(episodeId: number, position: number, duration: number): Promise<{ ok: boolean }> {
  return req(`/api/podcasts/episodes/${episodeId}/progress`, { method: 'PUT', body: JSON.stringify({ position, duration }) })
}
