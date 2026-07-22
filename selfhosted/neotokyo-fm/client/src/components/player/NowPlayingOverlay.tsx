import { useRef, useCallback, useState } from 'react'
import { hapticLight, hapticMedium } from '../../utils/haptic'
import { usePlayerStore } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'
import { useAlbumColor } from '../../hooks/useAlbumColor'
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, FileText, Volume2, Volume1, VolumeX, Disc3, Heart, SlidersHorizontal, ListMusic, GripVertical, Trash2, X, ChevronDown } from 'lucide-react'
import SleepTimer from './SleepTimer'
import { useTouchGestures } from '../../hooks/useTouchGestures'

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function NowPlayingOverlay() {
  const track = usePlayerStore(s => s.currentTrack)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const shuffle = usePlayerStore(s => s.shuffle)
  const repeat = usePlayerStore(s => s.repeat)
  const currentTime = usePlayerStore(s => s.currentTime)
  const duration = usePlayerStore(s => s.duration)
  const volume = usePlayerStore(s => s.volume)
  const isMuted = usePlayerStore(s => s.isMuted)
  const isRadio = usePlayerStore(s => s.isRadio)
  const queue = usePlayerStore(s => s.queue)
  const showQueue = usePlayerStore(s => s.showQueue)
  const showOverlay = usePlayerStore(s => s.showNowPlayingOverlay)
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle)
  const cycleRepeat = usePlayerStore(s => s.cycleRepeat)
  const setVolume = usePlayerStore(s => s.setVolume)
  const toggleMute = usePlayerStore(s => s.toggleMute)
  const showLyrics = usePlayerStore(s => s.showLyrics)
  const toggleShowLyrics = usePlayerStore(s => s.toggleShowLyrics)
  const showEqualizer = usePlayerStore(s => s.showEqualizer)
  const toggleShowEqualizer = usePlayerStore(s => s.toggleShowEqualizer)
  const toggleShowQueue = usePlayerStore(s => s.toggleShowQueue)
  const toggleNowPlayingOverlay = usePlayerStore(s => s.toggleNowPlayingOverlay)
  const setTrack = usePlayerStore(s => s.setTrack)
  const likedSongs = usePlayerStore(s => s.likedSongs)
  const toggleLike = usePlayerStore(s => s.toggleLike)
  const crossfade = usePlayerStore(s => s.crossfade)
  const setCrossfade = usePlayerStore(s => s.setCrossfade)
  const loudnessEnabled = usePlayerStore(s => s.loudnessEnabled)
  const loudnessMode = usePlayerStore(s => s.loudnessMode)
  const currentLoudnessGain = usePlayerStore(s => s.currentLoudnessGain)
  const setLoudnessEnabled = usePlayerStore(s => s.setLoudnessEnabled)
  const setLoudnessMode = usePlayerStore(s => s.setLoudnessMode)
  const removeFromQueue = usePlayerStore(s => s.removeFromQueue)
  const reorderQueue = usePlayerStore(s => s.reorderQueue)

  const barRef = useRef<HTMLDivElement>(null)
  const { vibrant, muted, dark, loading } = useAlbumColor(track?.albumArt)
  const touchGestures = useTouchGestures({
    onSwipeDown: () => toggleNowPlayingOverlay(),
    onSwipeLeft: () => { if (!isRadio) { audioEngine.nextTrack(); hapticLight() } },
    onSwipeRight: () => { if (!isRadio) { audioEngine.prevTrack(); hapticLight() } },
    onLongPress: () => toggleShowQueue(),
    onTap: () => {},
  })
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const dragItem = useRef<number | null>(null)

  const pct = !isRadio && duration > 0 ? (currentTime / duration) * 100 : 0

  const seek = useCallback((clientX: number) => {
    if (isRadio) return
    const bar = barRef.current
    if (!bar || duration <= 0) return
    const rect = bar.getBoundingClientRect()
    const p = Math.max(0, Math.min(clientX - rect.left, rect.width)) / rect.width
    audioEngine.seek(p * duration)
  }, [duration, isRadio])

  const playFromQueue = (idx: number) => {
    const item = queue[idx]
    if (!item) return
    setTrack(item)
    audioEngine.playTrack(item)
  }

  const handleDragStart = (idx: number) => {
    dragItem.current = idx
    setDragIdx(idx)
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragIdx(idx)
  }

  const handleDrop = (targetIdx: number) => {
    const from = dragItem.current
    if (from === null || from === targetIdx) { setDragIdx(null); dragItem.current = null; return }
    reorderQueue(from, targetIdx)
    setDragIdx(null)
    dragItem.current = null
  }

  const handleDragEnd = () => {
    setDragIdx(null)
    dragItem.current = null
  }

  if (!showOverlay || !track) return null

  const overlayGradient = loading ? {} : {
    background: `linear-gradient(180deg, ${dark} 0%, rgba(15, 14, 26, 0.98) 40%, rgba(15, 14, 26, 0.98) 100%)`,
  }

  return (
    <div className="fixed inset-0 z-[60] backdrop-blur-xl animate-slide-up flex flex-col w-full h-full" style={overlayGradient} {...touchGestures}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0">
        <button
          onClick={toggleNowPlayingOverlay}
          className="flex items-center gap-2 text-content-secondary hover:text-content-primary transition-colors"
          aria-label="Close overlay"
        >
          <ChevronDown size={20} />
          <span className="text-sm font-medium">Now Playing</span>
        </button>
        <div className="flex items-center gap-2">
          <SleepTimer />
          <button
            onClick={toggleNowPlayingOverlay}
            className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-white/5 transition-all"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {showQueue && queue.length > 0 ? (
          /* Queue List View */
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-content-primary mb-2">Queue ({queue.length})</h3>
            {queue.map((item, i) => (
              <div
                key={`${item.url}-${i}`}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 text-xs p-2 rounded-lg group cursor-pointer transition-colors ${
                  dragIdx === i ? 'border border-neon-pink/30 bg-neon-pink/5' : 'hover:bg-white/5'
                } ${item.url === track?.url ? 'bg-neon-pink/10' : ''}`}
              >
                <span className="cursor-grab active:cursor-grabbing text-content-tertiary shrink-0">
                  <GripVertical size={12} />
                </span>
                <div className="w-8 h-8 rounded-lg bg-surface-sunken shrink-0 flex items-center justify-center overflow-hidden">
                  {item.albumArt ? (
                    <img src={item.albumArt} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <Disc3 size={10} className="text-content-tertiary/40" />
                  )}
                </div>
                <button onClick={() => playFromQueue(i)} className="flex-1 text-left truncate min-w-0">
                  <span className="text-content-primary truncate block">{item.title}</span>
                  {item.artist && <span className="text-[10px] text-content-tertiary truncate block">{item.artist}</span>}
                </button>
                <button onClick={() => removeFromQueue(i)} className="text-content-tertiary/0 group-hover:text-content-tertiary hover:text-error transition-colors shrink-0">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        ) : showQueue ? (
          <div className="flex-1 flex items-center justify-center h-full">
            <p className="text-sm text-content-tertiary">Queue is empty</p>
          </div>
        ) : (
          /* Now Playing — Full bleed */
          <div className="w-full max-w-lg mx-auto flex flex-col items-center gap-8 pt-4">
            {/* Album Art — larger, centered */}
            <div className="w-full max-w-[380px] aspect-square rounded-2xl overflow-hidden bg-surface-sunken shadow-panel">
              {track.albumArt ? (
                <img src={track.albumArt} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Disc3 size={72} className="text-content-tertiary/30" />
                </div>
              )}
            </div>

            {/* Track Info */}
            <div className="text-center w-full">
              <h2 className="text-xl font-bold text-content-primary truncate">{track.title}</h2>
              {track.artist && (
                <p className="text-sm text-content-secondary truncate mt-1">{track.artist}</p>
              )}
            </div>

            {/* Like button */}
            <button
              onClick={() => { toggleLike(track); hapticMedium() }}
              className={`flex items-center gap-2 px-5 py-2 rounded-full transition-all border ${
                likedSongs.includes(track.url)
                  ? 'border-red-500/30 text-red-400 bg-red-500/10'
                  : 'border-border-default text-content-secondary hover:text-content-primary hover:border-content-secondary'
              }`}
            >
              <Heart size={14} className={likedSongs.includes(track.url) ? 'fill-red-500' : ''} />
              <span className="text-xs font-medium">{likedSongs.includes(track.url) ? 'Liked' : 'Like'}</span>
            </button>

            {/* Progress */}
            <div className="w-full space-y-1">
              {isRadio ? (
                <div className="flex items-center gap-2 justify-center py-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse-dot" />
                  <span className="text-xs text-red-400/80 font-mono uppercase tracking-wider font-semibold">LIVE</span>
                  <span className="text-xs text-content-tertiary font-mono">{formatTime(currentTime)}</span>
                </div>
              ) : (
                <>
                  <div
                    ref={barRef}
                    className="h-2 cursor-pointer flex items-center gap-[2px] px-0.5"
                    onClick={(e) => seek(e.clientX)}
                    onMouseMove={(e) => { if (e.buttons === 1) seek(e.clientX) }}
                    onTouchStart={(e) => seek(e.touches[0].clientX)}
                    onTouchMove={(e) => seek(e.touches[0].clientX)}
                  >
                    {Array.from({ length: 48 }).map((_, i) => {
                      const fill = i / 48 < pct / 100
                      const baseHeight = 4 + Math.sin(i * 0.45) * 8 + 12
                      const height = fill ? Math.max(baseHeight, baseHeight * 1.2) : baseHeight
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-sm transition-all duration-100"
                          style={{
                            height: `${height}px`,
                            background: fill ? '#ff007f' : 'rgba(255,255,255,0.1)',
                            boxShadow: fill ? '0 0 8px #ff007f, 0 0 16px #ff007f' : 'none',
                          }}
                        />
                      )
                    })}
                  </div>
                  <div className="flex justify-between px-0.5">
                    <span className="text-xs font-mono text-content-primary">{formatTime(currentTime)}</span>
                    <span className="text-xs font-mono text-content-secondary">{formatTime(duration)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-6">
              <button onClick={() => { toggleShuffle(); hapticLight() }} className={`transition-all duration-200 ${shuffle ? 'text-neon-pink scale-110' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}>
                <Shuffle size={18} />
              </button>
              <button
                onClick={() => { if (!isRadio) { audioEngine.prevTrack(); hapticLight() } }}
                className={`transition-all duration-200 ${isRadio ? 'text-content-tertiary/30 cursor-not-allowed' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}
              >
                <SkipBack size={22} />
              </button>
              <button
                onClick={() => { audioEngine.togglePlay(); hapticMedium() }}
                className="relative w-16 h-16 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-150 shadow-btn"
              >
                {isPlaying ? <Pause size={24} className="text-surface-raised ml-0.5" /> : <Play size={24} className="text-surface-raised ml-0.5" />}
                <div className="absolute inset-0 rounded-full border-2 border-white/20 opacity-0 hover:opacity-100 transition-opacity" />
              </button>
              <button
                onClick={() => { if (!isRadio) { audioEngine.nextTrack(); hapticLight() } }}
                className={`transition-all duration-200 ${isRadio ? 'text-content-tertiary/30 cursor-not-allowed' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}
              >
                <SkipForward size={22} />
              </button>
              <button onClick={() => { cycleRepeat(); hapticLight() }} className={`transition-all duration-200 relative ${repeat !== 'off' ? 'text-neon-pink scale-110' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}>
                <Repeat size={18} />
                {repeat === 'one' && (
                  <span className="absolute -top-2 -right-2 text-[7px] font-bold text-white bg-neon-pink rounded-full w-3.5 h-3.5 flex items-center justify-center">1</span>
                )}
              </button>
            </div>

            {/* Secondary controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={toggleShowLyrics}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  showLyrics ? 'border-neon-pink/30 text-neon-pink bg-neon-pink/10' : 'border-border-default text-content-secondary hover:text-content-primary hover:border-content-secondary'
                }`}
              >
                <FileText size={13} />
                Lyrics
              </button>
              <button
                onClick={toggleShowEqualizer}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  showEqualizer ? 'border-neon-pink/30 text-neon-pink bg-neon-pink/10' : 'border-border-default text-content-secondary hover:text-content-primary hover:border-content-secondary'
                }`}
              >
                <SlidersHorizontal size={13} />
                EQ
              </button>
              <button
                onClick={toggleShowQueue}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  showQueue ? 'border-neon-pink/30 text-neon-pink bg-neon-pink/10' : 'border-border-default text-content-secondary hover:text-content-primary hover:border-content-secondary'
                }`}
              >
                <ListMusic size={13} />
                Queue
              </button>
            </div>

            {/* Crossfade slider */}
            {!isRadio && (
              <div className="flex items-center gap-2 w-full max-w-[200px]">
                <span className="text-[10px] text-content-tertiary shrink-0">Crossfade</span>
                <input type="range" min="0" max="12" step="1"
                  value={crossfade}
                  onChange={(e) => setCrossfade(Number(e.target.value))}
                  className="w-full appearance-none cursor-pointer h-1 bg-white/10 rounded-full accent-neon-pink transition-all"
                  aria-label="Crossfade duration" />
                <span className="text-[10px] font-mono text-content-secondary w-6 text-right tabular-nums">{crossfade}s</span>
              </div>
            )}

            {/* Loudness Normalization */}
            {!isRadio && (
              <div className="flex items-center gap-2 w-full max-w-[200px]">
                <button
                  onClick={() => setLoudnessEnabled(!loudnessEnabled)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-all border shrink-0 ${
                    loudnessEnabled
                      ? 'border-neon-pink/30 text-neon-pink bg-neon-pink/10'
                      : 'border-border-default text-content-secondary hover:text-content-primary hover:border-content-secondary'
                  }`}
                  aria-label="Toggle loudness normalization"
                >
                  <Volume2 size={11} />
                  {loudnessEnabled ? 'Loud' : 'Loud Off'}
                </button>
                {loudnessEnabled && (
                  <select
                    value={loudnessMode}
                    onChange={(e) => setLoudnessMode(e.target.value as 'track' | 'album')}
                    className="bg-transparent border border-border-default rounded-lg px-1.5 py-0.5 text-[10px] text-content-secondary outline-none focus:border-neon-pink/50"
                  >
                    <option value="track">Track</option>
                    <option value="album">Album</option>
                  </select>
                )}
                {loudnessEnabled && currentLoudnessGain !== 0 && (
                  <span className="text-[10px] font-mono text-content-tertiary tabular-nums shrink-0">
                    {currentLoudnessGain > 0 ? '+' : ''}{currentLoudnessGain.toFixed(1)} dB
                  </span>
                )}
              </div>
            )}

            {/* Volume */}
            <div className="flex items-center gap-2 w-full max-w-[200px]">
              <button onClick={() => { toggleMute(); hapticLight() }} className="text-content-secondary hover:text-content-primary transition-all shrink-0" aria-label={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted ? <VolumeX size={16} /> : volume > 0.5 ? <Volume2 size={16} /> : <Volume1 size={16} />}
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
                className="w-full appearance-none cursor-pointer h-1.5 bg-white/10 rounded-full accent-neon-pink transition-all"
                aria-label="Volume"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
