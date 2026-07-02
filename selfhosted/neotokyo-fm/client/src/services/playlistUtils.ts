import type { Playlist, PlaylistItem } from '../types/audio'

const HISTORY_KEY = 'neotokyo-history'
const PLAYLISTS_KEY = 'neotokyo-playlists'

function getJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function setJSON(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export function loadPlaylists(): Playlist[] {
  return getJSON<Playlist[]>(PLAYLISTS_KEY, [])
}

export function savePlaylists(playlists: Playlist[]) {
  setJSON(PLAYLISTS_KEY, playlists)
}

export function addTrackToPlaylist(playlistName: string, track: PlaylistItem) {
  const playlists = loadPlaylists()
  const pl = playlists.find(p => p.name === playlistName)
  if (pl) {
    pl.tracks = [...pl.tracks.filter(t => t.url !== track.url), track]
    savePlaylists(playlists)
  }
}

export function removeTrackFromPlaylist(playlistName: string, trackUrl: string) {
  const playlists = loadPlaylists()
  const pl = playlists.find(p => p.name === playlistName)
  if (pl) {
    pl.tracks = pl.tracks.filter(t => t.url !== trackUrl)
    savePlaylists(playlists)
  }
}

export function loadHistory(): PlaylistItem[] {
  return getJSON<PlaylistItem[]>(HISTORY_KEY, [])
}

export function addToHistory(track: PlaylistItem) {
  const history = loadHistory().filter(h => h.url !== track.url)
  history.unshift(track)
  setJSON(HISTORY_KEY, history.slice(0, 50))
}
