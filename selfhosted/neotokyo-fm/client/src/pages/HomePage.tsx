import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../services/audioEngine'
import { getRadioStations } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Play, Pause, Heart, MoreHorizontal, Radio, Music } from 'lucide-react'
import type { RadioStation, PlaylistItem } from '../types/audio'

const HERO_SLIDES = [
  {
    eyebrow: 'NEOTOKYO FM',
    headline: 'Retrowave Radio',
    sub: 'Stream synthwave, chill, and electronic music 24/7',
    cta: 'Browse Stations',
    link: '/radio',
    gradient: 'from-purple-500/40 via-hot-pink/20 to-transparent',
  },
  {
    eyebrow: 'YOUTUBE DOWNLOADER',
    headline: 'Save Your Favorites',
    sub: 'Download audio from any YouTube link',
    cta: 'Import Music',
    link: '/youtube',
    gradient: 'from-electric-blue/40 via-purple/20 to-transparent',
  },
  {
    eyebrow: 'YOUR LIBRARY',
    headline: 'All Your Music',
    sub: 'Browse downloaded tracks and playlists',
    cta: 'Open Library',
    link: '/library',
    gradient: 'from-hot-pink/40 via-electric-blue/20 to-transparent',
  },
]

function isRadioUrl(url: string): boolean {
  return url.includes('/api/radio-proxy') || url.includes('radio-browser')
}

export default function HomePage() {
  const [stations, setStations] = useState<RadioStation[]>([])
  const [heroIdx, setHeroIdx] = useState(0)
  const currentTrack = usePlayerStore(s => s.currentTrack)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const recentlyPlayed = usePlayerStore(s => s.recentlyPlayed)
  const likedSongs = usePlayerStore(s => s.likedSongs)
  const setTrack = usePlayerStore(s => s.setTrack)
  const setQueue = usePlayerStore(s => s.setQueue)
  const toggleLike = usePlayerStore(s => s.toggleLike)

  const recentSongs = recentlyPlayed.filter(t => !isRadioUrl(t.url))
  const recentRadio = recentlyPlayed.filter(t => isRadioUrl(t.url))

  const playTrack = useCallback((track: PlaylistItem) => {
    setTrack(track)
    setQueue(recentlyPlayed.filter(t => t.url !== track.url))
    audioEngine.playTrack(track).catch(() => showToast('Failed to play track', 'error'))
  }, [recentlyPlayed, setTrack, setQueue])

  const playRadio = useCallback((st: RadioStation) => {
    const track = { title: st.name, url: `/api/radio-proxy?url=${encodeURIComponent(st.url)}` }
    setTrack(track)
    audioEngine.playTrack(track).catch(() => showToast('Station unreachable — try another', 'error'))
  }, [setTrack])

  useEffect(() => {
    getRadioStations().then(setStations).catch(() => {})
    const timer = setInterval(() => {
      setHeroIdx(i => (i + 1) % HERO_SLIDES.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const hero = HERO_SLIDES[heroIdx]

  return (
    <div className="h-full overflow-y-auto bg-surface-base">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-content-primary" style={{ fontSize: '28px' }}>Home</h1>
          <div className="flex items-center gap-4">
            <Link to="/youtube" className="text-sm text-accent-link font-medium hover:underline">Search</Link>
          </div>
        </div>

        {/* Hero Banner */}
        <Link
          to={hero.link}
          className="block relative w-full h-[220px] rounded-lg overflow-hidden bg-gradient-to-r from-surface-overlay to-surface-sunken group animate-fade-in"
        >
          <div className={`absolute inset-0 bg-gradient-to-r ${hero.gradient}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
            <p className="text-xs uppercase text-white/80 tracking-wider mb-1 font-medium">{hero.eyebrow}</p>
            <h2 className="text-hero font-bold text-white leading-tight max-w-xl" style={{ fontSize: '52px', lineHeight: 1.1 }}>
              {hero.headline}
            </h2>
            <p className="text-sm text-white/70 mt-1 max-w-md">{hero.sub}</p>
            <span className="inline-block mt-3 px-4 py-2 rounded-md bg-white/18 text-white text-sm font-semibold hover:bg-white/25 transition-colors">
              {hero.cta}
            </span>
          </div>
          {/* Dots indicator */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
            {HERO_SLIDES.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${i === heroIdx ? 'bg-white scale-110' : 'bg-white/40'}`}
              />
            ))}
          </div>
        </Link>

        {/* Recent Songs */}
        {recentSongs.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-content-primary">Recent Songs</h2>
              <Link to="/library" className="text-sm text-accent-link font-medium hover:underline">See all →</Link>
            </div>
            <div className="space-y-0.5">
              {recentSongs.slice(0, 8).map((track, i) => (
                <div
                  key={`${track.url}-${i}`}
                  className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-surface-overlay transition-colors group cursor-pointer"
                  onClick={() => {
                    if (currentTrack?.url === track.url) {
                      audioEngine.togglePlay()
                    } else {
                      playTrack(track)
                    }
                  }}
                >
                  <span className="w-10 text-sm text-rank font-medium text-right shrink-0">{String(i + 1).padStart(2, '0')}</span>
                  <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-surface-overlay">
                    {track.albumArt ? (
                      <img src={track.albumArt} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music size={14} className="text-content-tertiary" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-content-primary truncate">{track.title}</p>
                    {track.artist && <p className="text-xs text-content-secondary truncate">{track.artist}</p>}
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (currentTrack?.url === track.url) {
                        audioEngine.togglePlay()
                      } else {
                        playTrack(track)
                      }
                    }}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all shrink-0 text-content-primary"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying && currentTrack?.url === track.url ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); toggleLike(track) }}
                    className="p-1 transition-colors shrink-0"
                    aria-label={likedSongs.includes(track.url) ? 'Unlike' : 'Like'}
                  >
                    <Heart size={14} className={likedSongs.includes(track.url) ? 'text-red-500 fill-red-500' : 'text-content-tertiary hover:text-content-primary'} />
                  </button>
                  <button className="p-1 text-content-tertiary hover:text-content-primary transition-colors shrink-0" aria-label="More">
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Most Played Radio */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-content-primary">
              {recentRadio.length > 0 ? 'Recent Radio' : 'Trending Stations'}
            </h2>
            <Link to="/radio" className="text-sm text-accent-link font-medium hover:underline">Browse all →</Link>
          </div>
          <div className="space-y-0.5">
            {stations.slice(0, 8).map((st, i) => (
              <div
                key={st.id}
                className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-surface-overlay transition-colors group cursor-pointer"
                onClick={() => playRadio(st)}
              >
                <span className="w-10 text-sm text-rank font-medium text-right shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-surface-overlay flex items-center justify-center">
                  <Radio size={16} className="text-hot-pink/50" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-content-primary truncate">{st.name}</p>
                  <p className="text-xs text-content-secondary truncate">{st.genre}</p>
                </div>
                <span className="text-xs text-content-tertiary font-mono shrink-0">
                  {st.genre}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); playRadio(st) }}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all shrink-0"
                  aria-label="Play"
                >
                  <Play size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Genre Quick Links */}
        <section className="pb-8">
          <h2 className="text-xl font-bold text-content-primary mb-4">Browse by Genre</h2>
          <div className="flex flex-wrap gap-2">
            {['Synthwave', 'Electronic', 'Pop', 'Chill', 'Jazz', 'Bollywood', 'Japanese', 'Hip Hop', '80s', 'Bengali', 'Rock', 'World'].map(g => (
              <Link
                key={g}
                to={`/radio?genre=${g}`}
                className="px-4 py-2 rounded-full bg-surface-overlay border border-border-default text-content-secondary text-sm font-medium hover:border-brand/30 hover:text-brand transition-all"
              >
                {g}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
