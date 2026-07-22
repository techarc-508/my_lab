import { useRef, useCallback } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'
import { Play, Pause, SkipBack, SkipForward, Heart, Volume2, Volume1, VolumeX, Disc3, ListMusic, SlidersHorizontal, FileText, Film } from 'lucide-react'
import { hapticLight, hapticMedium } from '../../utils/haptic'

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function BottomPlayerBar() {
  const track = usePlayerStore(s => s.currentTrack)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const currentTime = usePlayerStore(s => s.currentTime)
  const duration = usePlayerStore(s => s.duration)
  const volume = usePlayerStore(s => s.volume)
  const isMuted = usePlayerStore(s => s.isMuted)
  const isRadio = usePlayerStore(s => s.isRadio)
  const likedSongs = usePlayerStore(s => s.likedSongs)
  const toggleLike = usePlayerStore(s => s.toggleLike)
  const setVolume = usePlayerStore(s => s.setVolume)
  const toggleMute = usePlayerStore(s => s.toggleMute)
  const toggleNowPlayingOverlay = usePlayerStore(s => s.toggleNowPlayingOverlay)
  const toggleShowQueue = usePlayerStore(s => s.toggleShowQueue)
  const toggleShowEqualizer = usePlayerStore(s => s.toggleShowEqualizer)
  const toggleShowLyrics = usePlayerStore(s => s.toggleShowLyrics)
  const showQueue = usePlayerStore(s => s.showQueue)
  const showEqualizer = usePlayerStore(s => s.showEqualizer)
  const showLyrics = usePlayerStore(s => s.showLyrics)
  const videoMode = usePlayerStore(s => s.videoMode)
  const setVideoMode = usePlayerStore(s => s.setVideoMode)
  const currentVideoId = usePlayerStore(s => s.currentVideoId)

  const barRef = useRef<HTMLDivElement>(null)

  const pct = !isRadio && duration > 0 ? (currentTime / duration) * 100 : 0

  const seek = useCallback((clientX: number) => {
    if (isRadio) return
    const bar = barRef.current
    if (!bar || duration <= 0) return
    const rect = bar.getBoundingClientRect()
    const p = Math.max(0, Math.min(clientX - rect.left, rect.width)) / rect.width
    audioEngine.seek(p * duration)
  }, [duration, isRadio])

  if (!track) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-lg border-t border-white/5 bg-surface-base/92">
      {/* Neon gradient seek bar at top */}
      <div
        ref={barRef}
        className="h-1.5 bg-white/5 cursor-pointer group relative"
        onClick={(e) => seek(e.clientX)}
        onMouseMove={(e) => { if (e.buttons === 1) seek(e.clientX) }}
      >
        {/* Background track */}
        <div className="absolute inset-0 bg-white/5" />
        {/* Filled progress */}
        <div
          className="h-full relative transition-all duration-100"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #ff007f, #7a00ff, #00f3ff)',
          }}
        >
          {/* Neon glow on the edge */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity shadow-glow-pink-sm" />
        </div>
      </div>

      {/* Main bar */}
      <div className="flex items-center gap-3 px-4 py-2 h-[72px]">
        {/* Album art + track info */}
        <button onClick={toggleNowPlayingOverlay} className="flex items-center gap-3 min-w-0 flex-1 text-left">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-sunken shrink-0 flex items-center justify-center border border-white/5">
            {track.albumArt ? (
              <img src={track.albumArt} className="w-full h-full object-cover" alt="" />
            ) : (
              <Disc3 size={16} className="text-content-tertiary/40" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-content-primary truncate">{track.title}</p>
            {track.artist && (
              <p className="text-xs text-content-tertiary truncate">{track.artist}</p>
            )}
          </div>
        </button>

        {/* Time info (desktop) */}
        {!isRadio && (
          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-content-tertiary shrink-0">
            <span>{formatTime(currentTime)}</span>
            <span className="text-content-tertiary/40">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { if (!isRadio) { audioEngine.prevTrack(); hapticLight() } }}
            className={`hidden md:flex p-1.5 rounded-lg transition-all ${
              isRadio ? 'text-content-tertiary/30 cursor-not-allowed' : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
            }`}
            aria-label="Previous track"
          >
            <SkipBack size={18} />
          </button>

          <button
            onClick={() => { audioEngine.togglePlay(); hapticMedium() }}
            className="w-9 h-9 rounded-full bg-neon-pink flex items-center justify-center hover:bg-neon-pink/90 hover:scale-105 active:scale-95 transition-all shrink-0 shadow-glow-pink-sm"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={16} className="text-white ml-0.5" />
            ) : (
              <Play size={16} className="text-white ml-0.5" />
            )}
          </button>

          <button
            onClick={() => { if (!isRadio) { audioEngine.nextTrack(); hapticLight() } }}
            className={`hidden md:flex p-1.5 rounded-lg transition-all ${
              isRadio ? 'text-content-tertiary/30 cursor-not-allowed' : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
            }`}
            aria-label="Next track"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* Action icons */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          {track && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); toggleLike(track); hapticMedium() }}
                className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-white/5 transition-all active:scale-125"
                aria-label={likedSongs.includes(track.url) ? 'Unlike' : 'Like'}
              >
                <Heart size={15} className={`transition-all duration-200 ${likedSongs.includes(track.url) ? 'text-red-500 fill-red-500' : ''} ${likedSongs.includes(track.url) ? 'animate-heart-bounce' : ''}`} />
              </button>
              <button
                onClick={toggleShowLyrics}
                className={`p-2 rounded-lg transition-all ${showLyrics ? 'text-neon-pink bg-neon-pink/10' : 'text-content-secondary hover:text-content-primary hover:bg-white/5'}`}
                aria-label="Toggle lyrics"
              >
                <FileText size={15} />
              </button>
              <button
                onClick={toggleShowEqualizer}
                className={`p-2 rounded-lg transition-all ${showEqualizer ? 'text-neon-cyan bg-neon-cyan/10' : 'text-content-secondary hover:text-content-primary hover:bg-white/5'}`}
                aria-label="Toggle equalizer"
              >
                <SlidersHorizontal size={15} />
              </button>
              <button
                onClick={toggleShowQueue}
                className={`p-2 rounded-lg transition-all ${showQueue ? 'text-neon-pink bg-neon-pink/10' : 'text-content-secondary hover:text-content-primary hover:bg-white/5'}`}
                aria-label="Toggle queue"
              >
                <ListMusic size={15} />
              </button>
              {currentVideoId && (
                <button
                  onClick={() => setVideoMode(!videoMode)}
                  className={`p-2 rounded-lg transition-all ${videoMode ? 'text-neon-pink bg-neon-pink/10' : 'text-content-secondary hover:text-content-primary hover:bg-white/5'}`}
                  aria-label="Toggle video"
                >
                  <Film size={15} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Volume (desktop) */}
        <div className="hidden lg:flex items-center gap-1.5 shrink-0 w-[120px]">
          <button onClick={() => { toggleMute(); hapticLight() }} className="text-content-secondary hover:text-content-primary transition-all shrink-0" aria-label={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted ? <VolumeX size={14} /> : volume > 0.5 ? <Volume2 size={14} /> : <Volume1 size={14} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (isMuted) toggleMute()
              setVolume(v)
              audioEngine.setVolume(v)
            }}
            className="w-full appearance-none cursor-pointer h-1 bg-white/10 rounded-full accent-neon-pink transition-all"
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  )
}
