import { useState, useEffect, useMemo } from 'react'
import { getRadioStations, getRadioNowPlaying, saveRadioStations } from '../services/grabberAPI'
import { CardSkeleton } from '../components/ui/Skeleton'
import { showToast } from '../components/ui/StreamToast'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../services/audioEngine'
import { storageGet, storageSet } from '../utils/storage'
import { Star, Radio, Search, Plus, X, Wifi, WifiOff } from 'lucide-react'
import type { RadioStation } from '../types/audio'

const GENRE_COLORS: Record<string, string> = {
  'Jazz': 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400',
  'Electronic': 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-400',
  'Rock': 'from-rose-500/20 to-red-500/10 border-rose-500/30 text-rose-400',
  'Pop': 'from-pink-500/20 to-fuchsia-500/10 border-pink-500/30 text-pink-400',
  'Classical': 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
  'Hip Hop': 'from-yellow-500/20 to-amber-500/10 border-yellow-500/30 text-yellow-400',
  'Ambient': 'from-indigo-500/20 to-purple-500/10 border-indigo-500/30 text-indigo-400',
  'News': 'from-sky-500/20 to-blue-500/10 border-sky-500/30 text-sky-400',
  'Talk': 'from-violet-500/20 to-purple-500/10 border-violet-500/30 text-violet-400',
}

function getGenreColors(genre: string) {
  for (const [key, value] of Object.entries(GENRE_COLORS)) {
    if (genre.toLowerCase().includes(key.toLowerCase())) return value
  }
  return 'from-neon-pink/20 to-neon-cyan/10 border-neon-pink/30 text-neon-pink'
}

let _favCache: string[] | null = null
function getFavorites(): string[] {
  if (_favCache) return _favCache
  _favCache = storageGet('radio-favorites', [])
  return _favCache
}
function setFavorites(ids: string[]) {
  _favCache = ids
  storageSet('radio-favorites', ids)
}

const NP_CACHE_KEY = 'neotokyo-radio-nowplaying'
const NP_CACHE_TTL = 30000
function getCachedNowPlaying(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NP_CACHE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    if (Date.now() - data.ts > NP_CACHE_TTL) return {}
    return data.np || {}
  } catch { return {} }
}
function setCachedNowPlaying(np: Record<string, string>) {
  try { localStorage.setItem(NP_CACHE_KEY, JSON.stringify({ np, ts: Date.now() })) } catch {}
}

function ActiveStationCard({ station, nowPlaying, offline }: { station: RadioStation; nowPlaying: string | null; offline: boolean }) {
  return (
    <div className={`rounded-2xl p-4 mb-4 transition-all border ${
      offline
        ? 'bg-red-500/10 border-red-500/30'
        : 'bg-neon-pink/10 border-neon-pink/30 shadow-glow-pink-sm'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full ${offline ? 'bg-red-500/20' : 'bg-neon-pink/20'} flex items-center justify-center`}>
          {offline ? <WifiOff size={18} className="text-red-400" /> : <Radio size={18} className="text-neon-pink" />}
        </div>
        <div className="flex-1 min-w-0">
          {offline ? (
            <p className="text-[8px] text-red-400/60 tracking-wider uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> OFFLINE
            </p>
          ) : (
            <p className="text-[8px] text-neon-pink/60 tracking-wider uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-pink animate-pulse" /> LIVE
            </p>
          )}
          <p className="text-sm font-bold truncate">{offline ? `${station.name} — Unreachable` : (nowPlaying || station.name)}</p>
        </div>
        <span className="text-[8px] text-text-muted">{station.genre}</span>
      </div>
    </div>
  )
}

export default function RadioPage() {
  const [stations, setStations] = useState<RadioStation[]>([])
  const [nowPlaying, setNowPlaying] = useState<Record<string, string>>(getCachedNowPlaying)
  const [loading, setLoading] = useState(true)
  const [activeGenre, setActiveGenre] = useState('All')
  const [favorites, setFavs] = useState<string[]>(getFavorites)
  const [localSearch, setLocalSearch] = useState('')
  const [offlineStations, setOfflineStations] = useState<Set<string>>(new Set())
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [customGenre, setCustomGenre] = useState('')

  const setTrack = usePlayerStore(s => s.setTrack)
  const currentTrack = usePlayerStore(s => s.currentTrack)
  const activeStation = currentTrack?.url?.startsWith('/api/radio-proxy')
    ? stations.find(s => `/api/radio-proxy?url=${encodeURIComponent(s.url)}` === currentTrack.url)
    : null

  useEffect(() => {
    getRadioStations().then(s => { setStations(s); setLoading(false) }).catch(() => { showToast('Failed to load stations', 'error'); setLoading(false) })
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      for (const s of stations) {
        getRadioNowPlaying(s.url).then(np => {
          setNowPlaying(prev => ({ ...prev, [s.url]: np.title || np.artist || '' }))
          setOfflineStations(prev => { const next = new Set(prev); next.delete(s.url); return next })
        }).catch(() => {
          setOfflineStations(prev => { const next = new Set(prev); next.add(s.url); return next })
        })
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [stations])

  useEffect(() => { setCachedNowPlaying(nowPlaying) }, [nowPlaying])

  const playStation = async (s: RadioStation) => {
    const track = { title: s.name, url: `/api/radio-proxy?url=${encodeURIComponent(s.url)}` }
    setTrack(track)
    try {
      await audioEngine.playTrack(track)
      setOfflineStations(prev => { const next = new Set(prev); next.delete(s.url); return next })
    } catch {
      showToast('Station unreachable — try another', 'error')
      setOfflineStations(prev => { const next = new Set(prev); next.add(s.url); return next })
    }
  }

  const toggleFav = (id: string) => {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      setFavorites(next)
      return next
    })
  }

  const addCustomStation = () => {
    if (!customName.trim() || !customUrl.trim()) { showToast('Name and URL are required', 'error'); return }
    const newStation: RadioStation = { id: 'custom-' + Date.now(), name: customName.trim(), url: customUrl.trim(), genre: customGenre.trim() || 'Custom' }
    setStations(prev => [...prev, newStation])
    saveRadioStations([...stations, newStation]).catch(() => showToast('Failed to save station', 'error'))
    setCustomName(''); setCustomUrl(''); setCustomGenre(''); setShowCustomForm(false)
    showToast('Station added!', 'success')
  }

  const genres = ['All', ...Array.from(new Set(stations.map(s => s.genre)))]

  const filtered = useMemo(() => {
    const genreFiltered = activeGenre === 'All' ? stations : stations.filter(s => s.genre === activeGenre)
    const searchFiltered = localSearch.trim() ? genreFiltered.filter(s =>
      s.name.toLowerCase().includes(localSearch.toLowerCase()) || s.genre.toLowerCase().includes(localSearch.toLowerCase())
    ) : genreFiltered
    const fav = searchFiltered.filter(s => favorites.includes(s.id))
    const rest = searchFiltered.filter(s => !favorites.includes(s.id))
    return [...fav, ...rest]
  }, [stations, activeGenre, localSearch, favorites])

  if (loading) return <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}</div>

  return (
    <div className="p-4 md:p-8 pb-32 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Radio size={20} className="text-neon-pink" />
          <h2 className="text-lg font-bold text-content-primary">Radio</h2>
          {activeStation && (
            <span className="text-[10px] font-mono text-neon-cyan bg-neon-cyan/10 px-2 py-0.5 rounded-full border border-neon-cyan/20">
              LIVE
            </span>
          )}
        </div>
        <button onClick={() => setShowCustomForm(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] border border-neon-pink/30 text-neon-pink hover:bg-neon-pink/10 transition-all">
          <Plus size={12} /> Add Station
        </button>
      </div>

      {/* Active Station Card */}
      {activeStation && <ActiveStationCard station={activeStation} nowPlaying={nowPlaying[activeStation.url] || null} offline={offlineStations.has(activeStation.url)} />}

      {/* Custom Station Form */}
      {showCustomForm && (
        <div className="mb-6 bg-surface-card/50 border border-border-subtle/50 rounded-2xl p-4 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-gray-400 tracking-wider uppercase">Add Custom Station</span>
            <button onClick={() => setShowCustomForm(false)}><X size={14} className="text-gray-400 hover:text-white" /></button>
          </div>
          <div className="space-y-2">
            <input type="text" value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Station name"
              className="w-full bg-surface-deep border border-border-subtle/50 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-neon-pink/40" />
            <input type="text" value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="Stream URL"
              className="w-full bg-surface-deep border border-border-subtle/50 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-neon-pink/40" />
            <input type="text" value={customGenre} onChange={e => setCustomGenre(e.target.value)} placeholder="Genre (optional)"
              className="w-full bg-surface-deep border border-border-subtle/50 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-neon-pink/40" />
            <button onClick={addCustomStation}
              className="w-full py-2 rounded-lg bg-neon-pink/20 border border-neon-pink/30 text-neon-pink text-xs font-medium hover:bg-neon-pink/30 transition-all">
              Add Station
            </button>
          </div>
        </div>
      )}

      {/* Search + Genre Filter */}
      <div className="mb-6 bg-surface-card/50 border border-border-subtle/50 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search size={14} className="text-neon-pink" />
          <span className="text-[10px] text-gray-400 tracking-wider uppercase">Search Stations</span>
        </div>
        <input type="text" value={localSearch} onChange={e => setLocalSearch(e.target.value)} placeholder="Search by name or genre..."
          className="w-full bg-surface-deep border border-border-subtle/50 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-neon-pink/40" />
        <div className="flex flex-wrap gap-1.5 mt-3">
          {genres.map(g => (
            <button key={g} onClick={() => setActiveGenre(g)}
              className={`px-2.5 py-1 rounded-full text-[9px] tracking-wider border transition-all ${
                activeGenre === g ? 'bg-neon-pink/20 border-neon-pink/40 text-neon-pink' : 'bg-white/5 border-white/10 text-gray-400'
              }`}>
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Stations Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(s => {
          const np = nowPlaying[s.url]
          const isFav = favorites.includes(s.id)
          const isOffline = offlineStations.has(s.url)
          const genreColors = getGenreColors(s.genre)
          return (
            <div key={s.id} className="relative group">
              <button onClick={() => playStation(s)}
                className={`w-full bg-surface-card/50 border rounded-2xl p-4 text-left transition-all card-hover ${
                  isOffline ? 'border-red-500/20 hover:border-red-500/40 opacity-60' : 'border-white/5 hover:border-neon-pink/30'
                }`}>
                <div className="flex items-center gap-1.5 mb-2">
                  {isOffline ? <WifiOff size={10} className="text-red-400/60" /> : <Wifi size={10} className="text-emerald-400/60" />}
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${genreColors.split(' ').slice(2).join(' ')}`}>
                    {s.genre}
                  </span>
                </div>
                <p className="text-xs font-medium truncate">{s.name}</p>
                {np && !isOffline && <p className="text-[10px] text-neon-cyan/60 mt-1 truncate">{np}</p>}
                {isOffline && <p className="text-[10px] text-red-400/60 mt-1">Station offline</p>}
              </button>
              <button onClick={() => toggleFav(s.id)}
                className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}>
                <Star size={12} className={isFav ? 'text-neon-yellow fill-neon-yellow' : 'text-text-muted'} />
              </button>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Radio size={32} className="mx-auto text-white/10 mb-2" />
          <p className="text-xs text-white/30">No stations found</p>
        </div>
      )}
    </div>
  )
}
