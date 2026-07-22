import { useRef, useState, useCallback, useEffect } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { videoService } from '../../services/videoService'
import { X, Maximize, Minimize, PictureInPicture2, GripVertical, Play, Pause } from 'lucide-react'

export default function VideoOverlay() {
  const videoMode = usePlayerStore(s => s.videoMode)
  const currentVideoId = usePlayerStore(s => s.currentVideoId)
  const videoThumbnail = usePlayerStore(s => s.videoThumbnail)
  const videoTitle = usePlayerStore(s => s.videoTitle)
  const miniPlayer = usePlayerStore(s => s.miniPlayer)
  const clearVideo = usePlayerStore(s => s.clearVideo)
  const setMiniPlayer = usePlayerStore(s => s.setMiniPlayer)

  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [expanded, setExpanded] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragOffset.current = { x: clientX - position.x, y: clientY - position.y }
    setDragging(true)
  }, [position])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      setPosition({
        x: clientX - dragOffset.current.x,
        y: clientY - dragOffset.current.y,
      })
    }
    const handleUp = () => setDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [dragging])

  useEffect(() => {
    if (!videoMode || !currentVideoId || !containerRef.current) {
      videoService.destroyPlayer()
      return
    }
    if (containerRef.current && !containerRef.current.querySelector('iframe')) {
      videoService.createPlayer(currentVideoId, containerRef.current)
    }
  }, [videoMode, currentVideoId])

  useEffect(() => {
    if (!videoMode) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        clearVideo()
      } else if (e.key === 'f' || e.key === 'F') {
        videoService.toggleFullscreen()
      } else if (e.key === 'm' || e.key === 'M') {
        setMiniPlayer(!miniPlayer)
      } else if (e.key === ' ') {
        e.preventDefault()
        if (isPaused) {
          videoService.playVideo()
        } else {
          videoService.pauseVideo()
        }
        setIsPaused(!isPaused)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [videoMode, miniPlayer, clearVideo, setMiniPlayer, isPaused])

  if (!videoMode || !currentVideoId) return null

  if (miniPlayer) {
    return (
      <div
        className="fixed z-50 rounded-xl overflow-hidden shadow-2xl border border-white/10"
        style={{
          bottom: 96,
          right: 16,
          width: 320,
          background: 'rgba(12, 10, 24, 0.95)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-between px-2.5 py-1.5 cursor-move select-none"
          style={{ background: 'rgba(255, 0, 127, 0.08)' }}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div className="flex items-center gap-1.5 text-content-secondary">
            <GripVertical size={12} className="text-neon-pink/60" />
            <span className="text-[10px] font-medium truncate max-w-[180px]">
              {videoTitle || 'Video'}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setMiniPlayer(false)}
              className="p-1 rounded text-content-secondary hover:text-content-primary hover:bg-white/5 transition-colors"
              aria-label="Expand"
            >
              <Maximize size={12} />
            </button>
            <button
              onClick={clearVideo}
              className="p-1 rounded text-content-secondary hover:text-error hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X size={12} />
            </button>
          </div>
        </div>
        {/* Video iframe */}
        <div ref={containerRef} className="w-full aspect-video bg-black" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl mx-4 bg-surface-card border border-border-default rounded-2xl overflow-hidden shadow-2xl">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-surface-sunken border-b border-border-subtle/50">
          <span className="text-xs font-medium text-content-primary truncate max-w-[60%]">
            {videoTitle || 'Music Video'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => videoService.togglePiP()}
              className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-white/5 transition-colors"
              aria-label="Picture in Picture"
            >
              <PictureInPicture2 size={14} />
            </button>
            <button
              onClick={() => videoService.toggleFullscreen()}
              className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-white/5 transition-colors"
              aria-label="Fullscreen"
            >
              <Maximize size={14} />
            </button>
            <button
              onClick={() => setMiniPlayer(true)}
              className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-white/5 transition-colors"
              aria-label="Minimize"
            >
              <Minimize size={14} />
            </button>
            <button
              onClick={clearVideo}
              className="p-1.5 rounded-lg text-content-secondary hover:text-error hover:bg-white/5 transition-colors"
              aria-label="Close video"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        {/* Video area */}
        <div ref={containerRef} className="w-full aspect-video bg-black relative">
          {!currentVideoId && videoThumbnail && (
            <img src={videoThumbnail} className="w-full h-full object-cover opacity-50" alt="" />
          )}
        </div>
      </div>
    </div>
  )
}
