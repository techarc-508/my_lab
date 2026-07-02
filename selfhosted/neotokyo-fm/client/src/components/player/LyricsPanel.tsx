import { useState, useEffect, useRef } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'

interface LyricLine { time: number | null; text: string }

interface Props {
  className?: string
}

export default function LyricsPanel({ className = '' }: Props) {
  const track = usePlayerStore(s => s.currentTrack)
  const [lines, setLines] = useState<LyricLine[]>([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLines([])
    setActiveIdx(-1)
    if (!track?.title && !track?.url) return
    const params = new URLSearchParams()
    if (track.title) params.set('title', track.title)
    if (track.artist) params.set('artist', track.artist)
    const urlParts = track.url.split('/api/files/')
    if (urlParts.length > 1) params.set('filename', decodeURIComponent(urlParts[1].split('?')[0]))
    fetch(`/api/lyrics?${params.toString()}`)
      .then(r => r.json())
      .then(d => setLines(d.lines || []))
      .catch(() => setLines([{ time: null, text: 'Lyrics unavailable' }]))
  }, [track?.title, track?.artist, track?.url])

  useEffect(() => {
    if (lines.length === 0 || lines[0]?.time === null || lines[0]?.time === undefined) {
      return
    }
    const interval = setInterval(() => {
      const ct = audioEngine.getCurrentTime()
      let idx = -1
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].time !== null && ct >= lines[i].time!) { idx = i; break }
      }
      setActiveIdx(idx)
    }, 80)
    return () => clearInterval(interval)
  }, [lines])

  useEffect(() => {
    if (activeIdx < 0 || !scrollRef.current) return
    const container = scrollRef.current
    const activeEl = container.children[activeIdx] as HTMLElement | undefined
    if (activeEl) {
      const containerTop = container.getBoundingClientRect().top
      const elTop = activeEl.getBoundingClientRect().top
      const offset = elTop - containerTop
      const targetScroll = container.scrollTop + offset - container.clientHeight * 0.3
      container.scrollTo({ top: targetScroll, behavior: 'smooth' })
    }
  }, [activeIdx])

  const hasTimestamps = lines.length > 0 && lines[0]?.time !== null && lines[0]?.time !== undefined

  if (lines.length === 0) return null

  return (
    <div className={`absolute inset-0 rounded-lg overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(180deg, rgba(11,10,30,0.75) 0%, rgba(11,10,30,0.6) 50%, rgba(11,10,30,0.85) 100%)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-4 py-6 scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {!hasTimestamps ? (
          <div className="flex items-center justify-center h-full">
            <p className="font-body text-xs text-white/40 tracking-wide">{lines[0]?.text || 'No lyrics'}</p>
          </div>
        ) : (
          <div className="space-y-2 pt-4 pb-8">
            {lines.map((l, i) => {
              const isPast = i < activeIdx
              const isActive = i === activeIdx
              const isFuture = i > activeIdx
              return (
                <p
                  key={i}
                  className={`font-body text-center transition-all duration-700 leading-relaxed ${
                    isActive
                      ? 'text-white scale-105'
                      : isPast
                        ? 'text-white/25'
                        : 'text-white/45'
                  }`}
                  style={{
                    fontSize: isActive ? '14px' : '12px',
                    fontWeight: isActive ? 600 : 400,
                    textShadow: isActive ? '0 0 20px rgba(255,0,110,0.4)' : 'none',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                  }}
                >
                  {l.text || '\u00A0'}
                </p>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
