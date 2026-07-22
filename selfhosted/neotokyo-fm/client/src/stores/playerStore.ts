import { create } from 'zustand'
import type { PlaylistItem } from '../types/audio'
import { storageGet, storageSet } from '../utils/storage'
import { getPlaylists, createPlaylist, updatePlaylist } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'

function getTheme(): 'dark' | 'light' {
  const stored = storageGet<string>('theme', '')
  if (stored === 'light' || stored === 'dark') return stored as 'dark' | 'light'
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch { return 'dark' }
}

type VisualizerMode = 'spectrum' | 'waveform' | 'circular' | 'particle' | 'none'

export const EQ_PRESETS: Record<string, number[]> = {
  Normal:     [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Deep Bass': [6, 5, 3, 1, 0, -1, -2, -3, -4, -5],
  Vocals:     [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2],
  Treble:     [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6],
  'Full Bass': [5, 4, 3, 2, 1, 0, -1, -2, -3, -4],
  Soft:       [-2, -1, 0, 1, 2, 2, 1, 0, -1, -2],
}

const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

interface PlayerState {
  currentTrack: PlaylistItem | null
  queue: PlaylistItem[]
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  shuffle: boolean
  repeat: 'off' | 'one' | 'all'
  isFullscreen: boolean
  sleepEnd: number | null
  crossfade: number
  theme: 'dark' | 'light'
  visualizerMode: VisualizerMode
  showQueue: boolean
  showEqualizer: boolean
  showLyrics: boolean
  showNowPlayingOverlay: boolean
  recentlyPlayed: PlaylistItem[]
  eqBands: number[]
  activeEqPreset: string
  isRadio: boolean
  likedSongs: string[]
  scanlines: boolean
  username: string
  role: string
  prefetchEnabled: boolean
  offlineTracks: string[]
  loudnessEnabled: boolean
  loudnessMode: 'track' | 'album'
  currentLoudnessGain: number
  videoMode: boolean
  currentVideoId: string | null
  videoThumbnail: string | null
  videoTitle: string | null
  miniPlayer: boolean

  setTrack: (track: PlaylistItem | null) => void
  toggleNowPlayingOverlay: () => void
  toggleScanlines: () => void
  setPlaying: (v: boolean) => void
  setCurrentTime: (t: number) => void
  setDuration: (d: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  toggleFullscreen: () => void
  setSleepEnd: (t: number | null) => void
  setCrossfade: (d: number) => void
  toggleTheme: () => void
  setVisualizerMode: (m: VisualizerMode) => void
  toggleShowQueue: () => void
  toggleShowEqualizer: () => void
  toggleShowLyrics: () => void
  playNext: () => void
  playPrev: () => void
  addToQueue: (track: PlaylistItem) => void
  removeFromQueue: (idx: number) => void
  reorderQueue: (fromIdx: number, toIdx: number) => void
  clearQueue: () => void
  setQueue: (q: PlaylistItem[]) => void
  pushRecentlyPlayed: (track: PlaylistItem) => void
  toggleLike: (track: PlaylistItem) => Promise<void>
  setEqBand: (index: number, value: number) => void
  setEqPreset: (name: string) => void
  setUser: (username: string, role: string) => void
  cacheOffline: (url: string, name: string) => Promise<void>
  removeOffline: (url: string) => void
  setLoudnessEnabled: (v: boolean) => void
  setLoudnessMode: (m: 'track' | 'album') => void
  setCurrentLoudnessGain: (v: number) => void
  setVideoMode: (enabled: boolean) => void
  setCurrentVideo: (videoId: string, thumbnail: string, title: string) => void
  clearVideo: () => void
  setMiniPlayer: (enabled: boolean) => void
}

const MAX_RECENT = 50

function isRadioUrl(url: string | undefined): boolean {
  return !!url && (url.includes('/api/radio-proxy') || url.includes('radio-browser'))
}

const RECENT_KEY = 'recentlyPlayed'
const LAST_KEY = 'lastTrack'

function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem('neotokyo-' + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch { return fallback }
}

function savePersisted(key: string, val: unknown) {
  try { localStorage.setItem('neotokyo-' + key, JSON.stringify(val)) } catch {}
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: loadPersisted<PlaylistItem | null>(LAST_KEY, null),
  queue: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: loadPersisted<number>('volume', 0.7),
  isMuted: false,
  shuffle: false,
  repeat: 'off',
  isFullscreen: false,
  sleepEnd: null,
  crossfade: 0,
  theme: getTheme(),
  visualizerMode: 'spectrum',
  showQueue: false,
  showEqualizer: false,
  showLyrics: false,
  showNowPlayingOverlay: false,
  recentlyPlayed: loadPersisted<PlaylistItem[]>(RECENT_KEY, []),
  eqBands: [...EQ_PRESETS.Normal],
  activeEqPreset: 'Normal',
  isRadio: false,
  likedSongs: loadPersisted<string[]>('likedSongs', []),
  scanlines: true,
  username: '',
  role: '',
  prefetchEnabled: true,
  offlineTracks: loadPersisted<string[]>('offlineTracks', []),
  loudnessEnabled: loadPersisted<boolean>('loudnessEnabled', false),
  loudnessMode: loadPersisted<'track' | 'album'>('loudnessMode', 'track'),
  currentLoudnessGain: 0,
  videoMode: loadPersisted<boolean>('videoMode', false),
  currentVideoId: null,
  videoThumbnail: null,
  videoTitle: null,
  miniPlayer: loadPersisted<boolean>('miniPlayer', false),

  setTrack: (track) => {
    if (track) {
      get().pushRecentlyPlayed(track)
      savePersisted(LAST_KEY, track)
    }
    set({ currentTrack: track, isRadio: isRadioUrl(track?.url), duration: 0, currentTime: 0 })
  },
  setPlaying: (v) => set({ isPlaying: v }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setVolume: (v) => { set({ volume: v }); savePersisted('volume', v) },
  toggleMute: () => set(s => ({ isMuted: !s.isMuted })),
  toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),
  cycleRepeat: () => set(s => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
  toggleFullscreen: () => set(s => ({ isFullscreen: !s.isFullscreen })),
  setSleepEnd: (t) => set({ sleepEnd: t }),
  setCrossfade: (d) => set({ crossfade: d }),
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    storageSet('theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    return { theme: next }
  }),
  setVisualizerMode: (m) => set({ visualizerMode: m }),
  toggleShowQueue: () => set(s => ({ showQueue: !s.showQueue })),
  toggleShowEqualizer: () => set(s => ({ showEqualizer: !s.showEqualizer })),
  toggleShowLyrics: () => set(s => ({ showLyrics: !s.showLyrics })),
  toggleNowPlayingOverlay: () => set(s => ({ showNowPlayingOverlay: !s.showNowPlayingOverlay })),
  toggleScanlines: () => set(s => ({ scanlines: !s.scanlines })),

  setEqBand: (index, value) => set(s => {
    const bands = [...s.eqBands]
    bands[index] = value
    return { eqBands: bands, activeEqPreset: 'Custom' }
  }),
  setEqPreset: (name) => {
    const preset = EQ_PRESETS[name]
    if (preset) set({ eqBands: [...preset], activeEqPreset: name })
  },

  playNext: () => {
    const { queue, shuffle, currentTrack, repeat } = get()
    if (repeat === 'one' && currentTrack) return
    if (queue.length === 0) { set({ isPlaying: false }); return }
    let next: PlaylistItem | null = null
    if (shuffle) {
      const remaining = queue.filter(t => t.url !== currentTrack?.url)
      if (remaining.length === 0) {
        next = queue[0]
      } else {
        next = remaining[Math.floor(Math.random() * remaining.length)]
      }
    } else {
      const idx = currentTrack ? queue.findIndex(t => t.url === currentTrack.url) : -1
      if (idx < queue.length - 1) {
        next = queue[idx + 1]
      } else {
        // Loop back to first track when reaching end
        next = queue[0]
      }
    }
    if (next) {
      set({ currentTrack: next })
    } else {
      set({ isPlaying: false })
    }
  },

  playPrev: () => {
    const { queue, shuffle, currentTrack } = get()
    if (!currentTrack || queue.length === 0) return
    if (shuffle && queue.length > 1) {
      const remaining = queue.filter(t => t.url !== currentTrack.url)
      if (remaining.length > 0) {
        const prev = remaining[Math.floor(Math.random() * remaining.length)]
        set({ currentTrack: prev })
        return
      }
    }
    const idx = queue.findIndex(t => t.url === currentTrack.url)
    const prev = idx > 0 ? queue[idx - 1] : queue[queue.length - 1]
    set({ currentTrack: prev })
  },

  addToQueue: (track) => set(s => ({ queue: [...s.queue, track] })),
  removeFromQueue: (idx) => set(s => ({ queue: s.queue.filter((_, i) => i !== idx) })),
  reorderQueue: (fromIdx, toIdx) => set(s => {
    const q = [...s.queue]
    const [moved] = q.splice(fromIdx, 1)
    q.splice(toIdx, 0, moved)
    return { queue: q }
  }),
  clearQueue: () => set({ queue: [] }),
  setQueue: (q) => set({ queue: q }),

  pushRecentlyPlayed: (track) => set(s => {
    const filtered = s.recentlyPlayed.filter(t => t.url !== track.url)
    const updated = [track, ...filtered].slice(0, MAX_RECENT)
    savePersisted(RECENT_KEY, updated)
    return { recentlyPlayed: updated }
  }),

  setUser: (username, role) => set({ username, role }),

  cacheOffline: async (url, name) => {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const cache = await caches.open('neotokyo-offline')
      await cache.put(url, new Response(blob))
      set(s => {
        const next = s.offlineTracks.includes(url) ? s.offlineTracks : [...s.offlineTracks, url]
        savePersisted('offlineTracks', next)
        return { offlineTracks: next }
      })
    } catch {}
  },

  removeOffline: (url) => set(s => {
    caches.open('neotokyo-offline').then(c => c.delete(url)).catch(() => {})
    const next = s.offlineTracks.filter(u => u !== url)
    savePersisted('offlineTracks', next)
    return { offlineTracks: next }
  }),

  setLoudnessEnabled: (v) => { set({ loudnessEnabled: v }); savePersisted('loudnessEnabled', v) },
  setLoudnessMode: (m) => { set({ loudnessMode: m }); savePersisted('loudnessMode', m) },
  setCurrentLoudnessGain: (v) => set({ currentLoudnessGain: v }),

  setVideoMode: (enabled) => {
    set({ videoMode: enabled })
    savePersisted('videoMode', enabled)
    if (!enabled) {
      set({ currentVideoId: null, videoThumbnail: null, videoTitle: null })
    }
  },
  setCurrentVideo: (videoId, thumbnail, title) => set({ currentVideoId: videoId, videoThumbnail: thumbnail, videoTitle: title }),
  clearVideo: () => set({ currentVideoId: null, videoThumbnail: null, videoTitle: null }),
  setMiniPlayer: (enabled) => { set({ miniPlayer: enabled }); savePersisted('miniPlayer', enabled) },

  toggleLike: async (track) => {
    const { likedSongs } = get()
    const isLiked = likedSongs.includes(track.url)
    const next = isLiked ? likedSongs.filter(u => u !== track.url) : [track.url, ...likedSongs]
    set({ likedSongs: next })
    savePersisted('likedSongs', next)
    showToast(isLiked ? 'Removed from Liked Songs' : 'Added to Liked Songs', 'success')
    try {
      const playlists: any[] = await getPlaylists() as any
      let pl = playlists.find((p: any) => p.name === 'Liked Songs')
      if (!pl) {
        await createPlaylist('Liked Songs')
        const refreshed: any[] = await getPlaylists() as any
        pl = refreshed.find((p: any) => p.name === 'Liked Songs')
        if (!pl) return
      }
      let tracks = pl.tracks || []
      if (!isLiked) {
        if (!tracks.some((t: any) => t.url === track.url)) {
          tracks = [{ title: track.title, artist: track.artist || '', url: track.url }, ...tracks]
        }
      } else {
        tracks = tracks.filter((t: any) => t.url !== track.url)
      }
      await updatePlaylist('Liked Songs', tracks)
    } catch (e) {
      showToast('Failed to sync with server', 'error')
    }
  },
}))
