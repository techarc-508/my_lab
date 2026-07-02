import { useState, useEffect, useMemo } from 'react'
import { getRadioStations, getRadioNowPlaying, saveRadioStations } from '../services/grabberAPI'
import { CardSkeleton } from '../components/ui/Skeleton'
import { showToast } from '../components/ui/StreamToast'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../services/audioEngine'
import { storageGet, storageSet } from '../utils/storage'
import { Star, Radio, Search, Plus } from 'lucide-react'
import type { RadioStation } from '../types/audio'

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

function ActiveStationCard({ station, nowPlaying }: { station: RadioStation; nowPlaying: string | null }) {
  return (
    <div className="bg-gradient-to-br from-pink-500/10 to-cyan-500/10 border border-pink-500/30 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center">
          <Radio size={18} className="text-pink-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[8px] text-pink-400/60 tracking-wider uppercase flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
            LIVE
          </p>
          <p className="text-sm font-bold truncate">{nowPlaying || station.name}</p>
        </div>
        <span className="text-[8px] text-[#5c3f45]">{station.genre}</span>
      </div>
    </div>
  )
}

export default function RadioPage() {
  const [stations, setStations] = useState<RadioStation[]>([])
  const [nowPlaying, setNowPlaying] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [activeGenre, setActiveGenre] = useState('All')
  const [favorites, setFavs] = useState<string[]>(getFavorites)
  const [localSearch, setLocalSearch] = useState('')

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
        }).catch(() => {})
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [stations])

  const playStation = (s: RadioStation) => {
    const track = { title: s.name, url: `/api/radio-proxy?url=${encodeURIComponent(s.url)}` }
    setTrack(track)
    audioEngine.playTrack(track).catch(() => showToast('Station unreachable — try another', 'error'))
  }

  const toggleFav = (id: string) => {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      setFavorites(next)
      return next
    })
  }

  const genres = ['All', ...Array.from(new Set(stations.map(s => s.genre)))]

  const filtered = useMemo(() => {
    const genreFiltered = activeGenre === 'All' ? stations : stations.filter(s => s.genre === activeGenre)
    const searchFiltered = localSearch.trim() ? genreFiltered.filter(s =>
      s.name.toLowerCase().includes(localSearch.toLowerCase()) ||
      s.genre.toLowerCase().includes(localSearch.toLowerCase())
    ) : genreFiltered
    const fav = searchFiltered.filter(s => favorites.includes(s.id))
    const rest = searchFiltered.filter(s => !favorites.includes(s.id))
    return [...fav, ...rest]
  }, [stations, activeGenre, localSearch, favorites])

  if (loading) return <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}</div>

  return (
    <div className="p-6">
      <h2 className="text-sm font-bold text-pink-400 mb-4">Radio</h2>

      {activeStation && <ActiveStationCard station={activeStation} nowPlaying={nowPlaying[activeStation.url] || null} />}

      {/* Local search + genre filter */}
      <div className="mb-6 bg-[#1d1e31]/50 border border-[#2a2a4a]/50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search size={14} className="text-pink-400" />
          <span className="text-[10px] text-white/40 tracking-wider uppercase">Search Stations</span>
        </div>
        <input type="text" value={localSearch} onChange={e => setLocalSearch(e.target.value)}
          placeholder="Search by name or genre..."
          className="w-full bg-[#0a0a2e] border border-[#2a2a4a]/50 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-pink-500/40" />
        <div className="flex flex-wrap gap-1.5 mt-3">
          {genres.map(g => (
            <button key={g} onClick={() => setActiveGenre(g)}
              className={`px-2.5 py-1 rounded-full text-[9px] tracking-wider border transition-all ${
                activeGenre === g ? 'bg-pink-500/20 border-pink-400/40 text-pink-300' : 'bg-white/5 border-white/10 text-white/40'
              }`}>
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Stations grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(s => {
          const np = nowPlaying[s.url]
          const isFav = favorites.includes(s.id)
          return (
            <div key={s.id} className="relative group">
              <button onClick={() => playStation(s)}
                className="w-full bg-[#1d1e31]/50 border border-[#2a2a4a]/50 rounded-lg p-4 text-left hover:border-pink-500/30 transition-all">
                <p className="text-xs font-medium truncate">{s.name}</p>
                <p className="text-[10px] text-[#5c3f45] mt-1">{s.genre}</p>
                {np && <p className="text-[10px] text-cyan-400/60 mt-1 truncate">{np}</p>}
              </button>
              <button onClick={() => toggleFav(s.id)}
                className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}>
                <Star size={12} className={isFav ? 'text-yellow-400 fill-yellow-400' : 'text-[#5c3f45]'} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
