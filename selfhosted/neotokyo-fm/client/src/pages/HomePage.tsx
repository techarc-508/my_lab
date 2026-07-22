import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../services/audioEngine'
import { getRadioStations } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Play, Pause, Heart, MoreHorizontal, Radio, Music, Disc } from 'lucide-react'
import TriviaSection from '../components/ui/TriviaSection'
import type { RadioStation, PlaylistItem } from '../types/audio'

function isRadioUrl(url: string): boolean {
  return url.includes('/api/radio-proxy') || url.includes('radio-browser')
}

const FM_CHANNELS = [
  { id: 'fm-1', name: '84.1 CityPop Breeze', frequency: '84.1 MHz', description: 'Iconic 80s City Pop and retro summer beach tunes', genre: 'City Pop / Vocal Pop' },
  { id: 'fm-2', name: '88.5 Tokyo Night Ride', frequency: '88.5 MHz', description: 'Midnight tunes for high-speed cruising under neon', genre: 'Jazz Fusion / Synthwave' },
  { id: 'fm-3', name: '91.2 Vaporwave Horizon', frequency: '91.2 MHz', description: 'Dreamy, chopped and screwed nostalgia', genre: 'Vaporwave / Ambient' },
  { id: 'fm-4', name: '95.7 Future Funk Kabuki', frequency: '95.7 MHz', description: 'Up-tempo French house edits of legendary 80s anime tracks', genre: 'Future Funk / French House' },
  { id: 'fm-5', name: '101.3 Shibuya Groove', frequency: '101.3 MHz', description: 'Funk, soul, and boogie for the dance floor', genre: 'Funk / Soul / Boogie' },
  { id: 'fm-6', name: '107.5 Roppongi FM', frequency: '107.5 MHz', description: 'Smooth jazz and late-night lounge', genre: 'Smooth Jazz / Lounge' },
  { id: 'fm-7', name: '82.0 Harajuku Beats', frequency: '82.0 MHz', description: 'Electronic beats and J-pop remixes', genre: 'Electronic / J-Pop' },
]

export default function HomePage() {
  const [stations, setStations] = useState<RadioStation[]>([])
  const currentTrack = usePlayerStore(s => s.currentTrack)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const recentlyPlayed = usePlayerStore(s => s.recentlyPlayed)
  const likedSongs = usePlayerStore(s => s.likedSongs)
  const setTrack = usePlayerStore(s => s.setTrack)
  const setQueue = usePlayerStore(s => s.setQueue)
  const toggleLike = usePlayerStore(s => s.toggleLike)
  const [activeStation, setActiveStation] = useState<string | null>(null)

  const recentSongs = recentlyPlayed.filter(t => !isRadioUrl(t.url))

  const playTrack = useCallback((track: PlaylistItem) => {
    setTrack(track)
    setQueue(recentlyPlayed.filter(t => t.url !== track.url))
    audioEngine.playTrack(track).catch(() => showToast('Failed to play track', 'error'))
  }, [recentlyPlayed, setTrack, setQueue])

  const playRadio = useCallback((st: RadioStation) => {
    const track = { title: st.name, url: `/api/radio-proxy?url=${encodeURIComponent(st.url)}` }
    setTrack(track)
    setActiveStation(st.id)
    audioEngine.playTrack(track).catch(() => showToast('Station unreachable', 'error'))
  }, [setTrack])

  useEffect(() => {
    getRadioStations().then(setStations).catch(() => {})
  }, [])

  return (
    <div className="h-full overflow-y-auto bg-surface-base">
      <div className="max-w-5xl mx-auto p-4 md:p-8 pb-32 flex flex-col gap-8 text-left">
        {/* ===== CURATED HERO BANNER ===== */}
        <div className="w-full rounded-3xl p-6 md:p-8 relative overflow-hidden brushed-metal border border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 shadow-brushed-metal">
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-neon" />

          <div className="flex-1 flex flex-col items-start gap-3 relative z-10">
            <span className="px-3 py-1 rounded-full bg-neon-pink/20 border border-neon-pink/40 font-mono text-[9px] text-neon-pink font-bold uppercase tracking-widest">
              Spotlight Mixtape of the Month
            </span>
            <h2 className="font-sans text-2xl md:text-4xl font-black tracking-tight text-white leading-tight">
              NeoTokyo FM<br />
              <span className="text-gradient-neon">
                Retrowave Radio
              </span>
            </h2>
            <p className="text-gray-400 text-xs max-w-md leading-relaxed mt-1">
              Stream synthwave, city pop, and electronic music 24/7. Your gateway to the neon-lit streets of Tokyo.
            </p>
            <Link
              to="/radio"
              className="mt-2.5 flex items-center gap-2 px-5 py-2.5 rounded-full bg-neon-pink hover:bg-neon-pink/90 text-white font-sans text-xs font-bold shadow-glow-pink-sm transition-all transform hover:scale-105"
            >
              <Play size={16} className="fill-current" />
              <span>BROWSE STATIONS</span>
            </Link>
          </div>

          <div className="w-44 h-44 shrink-0 relative z-10 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-tr from-neon-pink/20 to-neon-cyan/20 rounded-2xl blur-xl animate-pulse"></div>
            {currentTrack?.albumArt ? (
              <img
                src={currentTrack.albumArt}
                alt="Now playing"
                className="w-36 h-36 object-cover rounded-2xl border-2 border-white/10 shadow-2xl rotate-3 transform hover:rotate-0 transition-all duration-300"
              />
            ) : (
              <div className="w-36 h-36 rounded-2xl border-2 border-white/10 shadow-2xl bg-gradient-to-br from-neon-pink/30 to-neon-cyan/30 flex items-center justify-center">
                <Radio size={48} className="text-white/40" />
              </div>
            )}
          </div>
        </div>

        {/* ===== POPULAR CASSETTE ROW ===== */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Disc size={18} className="text-neon-cyan animate-spin-slow" />
              <h3 className="font-sans text-lg font-bold text-content-primary">Recent Tracks</h3>
            </div>
            <Link to="/library" className="text-xs font-semibold text-neon-pink hover:underline uppercase tracking-wider font-mono">
              View All
            </Link>
          </div>

          {recentSongs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {recentSongs.slice(0, 3).map((track, idx) => (
                <div
                  key={`${track.url}-${idx}`}
                  onClick={() => playTrack(track)}
                  className="rounded-2xl p-4 flex flex-col gap-3 cursor-pointer group bg-black/35 border border-white/5 hover:border-neon-pink/30 hover:bg-black/50 transition-all shadow-xl"
                >
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800">
                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt={track.title}
                        className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-neutral-900">
                        <Music size={24} className="text-gray-600" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 flex items-end justify-between">
                      <div className="flex flex-col text-left">
                        <span className="font-mono text-[8px] text-neon-cyan font-semibold">TAPE 0{idx + 1}</span>
                        <span className="text-xs font-bold text-white truncate max-w-[120px]">{track.title}</span>
                      </div>
                      <div className="w-6 h-6 rounded-full bg-neon-pink flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-glow-pink-sm">
                        <Play size={12} className="text-white fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col text-left min-w-0">
                      <span className="text-xs font-bold text-gray-200 group-hover:text-neon-pink transition-colors truncate">{track.title}</span>
                      <span className="text-[10px] text-gray-500 truncate">{track.artist || 'Unknown'}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleLike(track) }}
                      className="p-1 transition-colors shrink-0"
                    >
                      <Heart size={12} className={likedSongs.includes(track.url) ? 'text-red-500 fill-red-500' : 'text-gray-600'} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl p-8 bg-black/20 border border-white/5 flex flex-col items-center gap-3">
              <Radio size={32} className="text-neon-pink/30" />
              <p className="text-sm text-gray-500 text-center">No tracks yet. Start listening to build your recent tracks!</p>
              <Link to="/radio" className="px-4 py-2 rounded-full bg-neon-pink/20 border border-neon-pink/30 text-neon-pink text-xs font-bold hover:bg-neon-pink/30 transition-all">
                Browse Radio
              </Link>
            </div>
          )}
        </div>

        {/* ===== LIVE FM CHANNELS + TRIVIA ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* FM Channels */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-sans text-base font-bold text-content-primary">Live Tokyo Channels</h3>
              <span className="font-mono text-[8px] text-gray-500 uppercase tracking-widest font-bold">Signal: lock</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {FM_CHANNELS.map((ch) => {
                const isTuned = activeStation === ch.id
                return (
                  <div
                    key={ch.id}
                    onClick={() => {
                      setActiveStation(ch.id)
                      const matchingStation = stations.find(s => s.name.includes(ch.frequency.replace(' MHz', '')))
                      if (matchingStation) {
                        playRadio(matchingStation)
                      } else {
                        showToast(`Tuning to ${ch.name}...`, 'info')
                      }
                    }}
                    className={`rounded-2xl p-4 flex flex-col gap-2 cursor-pointer transition-all border text-left ${
                      isTuned
                        ? 'bg-neon-pink/10 border-neon-pink/40 shadow-glow-pink-sm'
                        : 'bg-black/25 border-white/5 hover:border-white/10 hover:bg-black/35'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-[10px] text-neon-cyan font-bold">{ch.frequency}</span>
                      <Radio size={14} className={isTuned ? 'text-neon-pink animate-pulse' : 'text-gray-500'} />
                    </div>
                    <div className="flex flex-col mt-1">
                      <span className="text-xs font-bold text-gray-200">{ch.name}</span>
                      <span className="text-[10px] text-gray-500 italic mt-0.5">{ch.description}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Trivia */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <h3 className="font-sans text-base font-bold text-content-primary">City Pop Trivia Corner</h3>
            <div className="h-full">
              <TriviaSection />
            </div>
          </div>
        </div>

        {/* ===== GENRE QUICK LINKS ===== */}
        <section className="pb-8">
          <h2 className="text-lg font-bold text-content-primary mb-4">Browse by Genre</h2>
          <div className="flex flex-wrap gap-2">
            {['Synthwave', 'City Pop', 'Electronic', 'Vaporwave', 'Future Funk', 'Jazz Fusion', 'Chill', 'Bollywood', 'Japanese', '80s', 'Bengali', 'Rock'].map(g => (
              <Link
                key={g}
                to={`/radio?genre=${g}`}
                className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-gray-400 text-sm font-medium hover:border-neon-pink/30 hover:text-neon-pink transition-all"
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
