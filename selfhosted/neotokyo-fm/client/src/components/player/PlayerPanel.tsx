import { useRef, useCallback, useState } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, FileText, Volume2, Volume1, VolumeX, Disc3, Heart, SlidersHorizontal, ListMusic, GripVertical, Trash2, Film } from 'lucide-react'
import SleepTimer from './SleepTimer'

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function PlayerPanel() {
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
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle)
  const cycleRepeat = usePlayerStore(s => s.cycleRepeat)
  const setVolume = usePlayerStore(s => s.setVolume)
  const toggleMute = usePlayerStore(s => s.toggleMute)
  const showLyrics = usePlayerStore(s => s.showLyrics)
  const toggleShowLyrics = usePlayerStore(s => s.toggleShowLyrics)
  const showEqualizer = usePlayerStore(s => s.showEqualizer)
  const toggleShowEqualizer = usePlayerStore(s => s.toggleShowEqualizer)
  const toggleShowQueue = usePlayerStore(s => s.toggleShowQueue)
  const setTrack = usePlayerStore(s => s.setTrack)
  const likedSongs = usePlayerStore(s => s.likedSongs)
  const toggleLike = usePlayerStore(s => s.toggleLike)
  const removeFromQueue = usePlayerStore(s => s.removeFromQueue)
  const reorderQueue = usePlayerStore(s => s.reorderQueue)
  const videoMode = usePlayerStore(s => s.videoMode)
  const setVideoMode = usePlayerStore(s => s.setVideoMode)
  const barRef = useRef<HTMLDivElement>(null)
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

  return (
    <div className="w-[320px] shrink-0 bg-surface-raised flex flex-col h-full border-r border-border-default/50">
      {/* Now Playing */}
      <div className="flex-1 px-4 pb-4 pt-5 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-content-primary">
            {showQueue ? 'Queue' : 'Now Playing'}
          </h2>
          <SleepTimer />
        </div>

        <div className="flex-1 bg-surface-overlay p-4 gap-4 rounded-xl flex flex-col min-h-0 overflow-hidden">
          {showQueue && queue.length > 0 ? (
            /* Queue List View */
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5">
              {queue.map((item, i) => (
                <div
                  key={`${item.url}-${i}`}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 text-xs p-1.5 rounded-md group cursor-pointer transition-colors ${
                    dragIdx === i ? 'border border-brand/30 bg-brand/5' : 'hover:bg-white/5'
                  } ${item.url === track?.url ? 'bg-brand/10' : ''}`}
                >
                  <span className="cursor-grab active:cursor-grabbing text-content-tertiary shrink-0">
                    <GripVertical size={12} />
                  </span>
                  <div className="w-7 h-7 rounded bg-surface-sunken shrink-0 flex items-center justify-center overflow-hidden">
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
            /* Empty Queue */
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-content-tertiary">Queue is empty</p>
            </div>
          ) : (
            /* Now Playing View */
            <>
              {/* Album Art */}
              <div className="w-full aspect-square rounded-lg overflow-hidden bg-surface-sunken shrink-0 relative group">
                {track?.albumArt ? (
                  <img src={track.albumArt} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Disc3 size={48} className="text-content-tertiary/30" />
                  </div>
                )}
                {track && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleLike(track) }}
                    className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                    aria-label={likedSongs.includes(track.url) ? 'Unlike' : 'Like'}
                  >
                    <Heart size={15} className={likedSongs.includes(track.url) ? 'text-red-500 fill-red-500' : 'text-white'} />
                  </button>
                )}
              </div>

              {/* Track Info */}
              <div className="text-center min-h-0">
                <h3 className="text-xl font-bold text-content-primary truncate" style={{ fontSize: '20px' }}>
                  {track?.title || 'No track selected'}
                </h3>
                {track?.artist && (
                  <p className="text-sm text-content-secondary truncate mt-0.5">
                    {track.artist}
                  </p>
                )}
              </div>

              {/* Waveform / Progress */}
              <div className="space-y-1">
                {isRadio ? (
                  <div className="flex items-center gap-2 justify-center py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse-dot" />
                    <span className="text-[10px] text-red-400/80 font-mono uppercase tracking-wider font-semibold">LIVE</span>
                    <span className="text-[10px] text-content-tertiary font-mono">{formatTime(currentTime)}</span>
                  </div>
                ) : (
                  <>
                    <div
                      ref={barRef}
                      className="h-8 cursor-pointer flex items-center gap-[2px] px-1"
                      onClick={(e) => seek(e.clientX)}
                      onMouseMove={(e) => { if (e.buttons === 1) seek(e.clientX) }}
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
                              background: fill ? 'var(--color-brand)' : 'var(--color-waveform-empty)',
                              boxShadow: fill ? '0 0 8px var(--color-brand), 0 0 16px var(--color-brand)' : 'none',
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
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-5">
                  <button onClick={toggleShuffle} className={`transition-all duration-200 ${shuffle ? 'text-brand scale-110' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}>
                    <Shuffle size={16} />
                  </button>
                  <button
                    onClick={() => !isRadio && audioEngine.prevTrack()}
                    className={`transition-all duration-200 ${isRadio ? 'text-content-tertiary/30 cursor-not-allowed' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}
                  >
                    <SkipBack size={20} />
                  </button>
                  <button
                    onClick={() => audioEngine.togglePlay()}
                    className="relative w-14 h-14 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-150 shadow-btn"
                  >
                    {isPlaying ? <Pause size={22} className="text-surface-raised ml-0.5" /> : <Play size={22} className="text-surface-raised ml-0.5" />}
                    <div className="absolute inset-0 rounded-full border-2 border-white/20 opacity-0 hover:opacity-100 transition-opacity" />
                  </button>
                  <button
                    onClick={() => !isRadio && audioEngine.nextTrack()}
                    className={`transition-all duration-200 ${isRadio ? 'text-content-tertiary/30 cursor-not-allowed' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}
                  >
                    <SkipForward size={20} />
                  </button>
                  <button onClick={cycleRepeat} className={`transition-all duration-200 relative ${repeat !== 'off' ? 'text-brand scale-110' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}>
                    <Repeat size={16} />
                    {repeat === 'one' && (
                      <span className="absolute -top-2 -right-2 text-[7px] font-bold text-white bg-brand rounded-full w-3.5 h-3.5 flex items-center justify-center">1</span>
                    )}
                  </button>
                  {track && (
                    <button onClick={toggleShowLyrics} className={`transition-all duration-200 ${showLyrics ? 'text-brand scale-110' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}>
                      <FileText size={16} />
                    </button>
                  )}
                  {track && (
                    <button onClick={toggleShowEqualizer} className={`transition-all duration-200 ${showEqualizer ? 'text-brand scale-110' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}>
                      <SlidersHorizontal size={16} />
                    </button>
                  )}
                  {!isRadio && (
                    <button
                      onClick={() => setVideoMode(!videoMode)}
                      className={`transition-all duration-200 ${videoMode ? 'text-brand scale-110' : 'text-content-secondary hover:text-content-primary hover:scale-110'}`}
                    >
                      <Film size={16} />
                    </button>
                  )}
                </div>

                {/* Queue toggle + Volume row */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleShowQueue}
                    className={`transition-all duration-200 shrink-0 ${showQueue ? 'text-brand' : 'text-content-secondary hover:text-content-primary'}`}
                    aria-label="Toggle queue"
                  >
                    <ListMusic size={16} />
                  </button>
                  <button onClick={toggleMute} className="text-content-secondary hover:text-content-primary transition-all duration-200 shrink-0" aria-label={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted ? <VolumeX size={14} /> : volume > 0.5 ? <Volume2 size={14} /> : <Volume1 size={14} />}
                  </button>
                  <div className="flex-1 flex items-center">
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
                      className="w-full appearance-none cursor-pointer h-1.5 bg-white/10 rounded-full accent-brand transition-all"
                      aria-label="Volume"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
