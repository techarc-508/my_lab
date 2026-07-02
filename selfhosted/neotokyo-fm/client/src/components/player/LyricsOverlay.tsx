import { useState, useEffect, useRef, useCallback } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { Disc3, X, FileText, Info, CheckCircle, AlertCircle } from 'lucide-react'
import { ensureCsrfToken, getCsrfToken } from '../../services/grabberAPI'
import styles from './lyricsOverlay.module.css'

interface LyricLine { time: number | null; text: string }

function deriveCoverUrl(trackUrl: string | undefined): string | undefined {
  if (!trackUrl) return undefined
  // Match various audio URL patterns to extract filename
  for (const pat of [/\/api\/audio\/(.+)/, /\/api\/files\/(.+?)(?:\?|$)/]) {
    const m = trackUrl.match(pat)
    if (m) return `/api/cover/${m[1]}`
  }
  return undefined
}

function deriveFilename(trackUrl: string | undefined): string | undefined {
  if (!trackUrl) return undefined
  let m = trackUrl.match(/\/api\/audio\/(.+)/)
  if (m) return decodeURIComponent(m[1])
  m = trackUrl.match(/\/api\/files\/(.+?)(?:\?|$)/)
  if (m) return decodeURIComponent(m[1])
  return undefined
}

export default function LyricsOverlay() {
  const track = usePlayerStore(s => s.currentTrack)
  const showLyrics = usePlayerStore(s => s.showLyrics)
  const toggleShowLyrics = usePlayerStore(s => s.toggleShowLyrics)
  const currentTime = usePlayerStore(s => s.currentTime)

  const [lines, setLines] = useState<LyricLine[]>([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [lyricsLoaded, setLyricsLoaded] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const [userLyrics, setUserLyrics] = useState('')
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [showGuide, setShowGuide] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevTrackUrl = useRef<string | undefined>(undefined)
  const submitRef = useRef<HTMLTextAreaElement>(null)

  const filename = track?.url ? deriveFilename(track.url) : undefined
  const albumArt = track?.albumArt || (track?.url ? deriveCoverUrl(track.url) : undefined) || (filename ? `/api/cover/${encodeURIComponent(filename)}` : undefined)

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!track?.title && !track?.url) { setLines([]); setLyricsLoaded(false); return }
    if (track.url === prevTrackUrl.current && lyricsLoaded) return
    prevTrackUrl.current = track.url
    setLines([])
    setActiveIdx(-1)
    setLyricsLoaded(false)
    setShowSubmit(false)
    setSubmitStatus('idle')
    setUserLyrics('')
    const params = new URLSearchParams()
    if (track.title) params.set('title', track.title)
    if (track.artist) params.set('artist', track.artist)
    const fn = deriveFilename(track.url)
    if (fn) params.set('filename', fn)
    fetch(`/api/lyrics?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        const l = d.lines || []
        if (l.length > 0) {
          setLines(l)
        } else {
          setLines([{ time: null, text: 'No lyrics available' }])
        }
        setLyricsLoaded(true)
      })
      .catch(() => {
        setLines([{ time: null, text: 'Lyrics unavailable' }])
        setLyricsLoaded(true)
      })
  }, [track?.title, track?.artist, track?.url])

  // Animate entrance/exit
  useEffect(() => {
    if (showLyrics && track) {
      setVisible(true)
      requestAnimationFrame(() => setAnimating(true))
    } else {
      setAnimating(false)
      const t = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(t)
    }
  }, [showLyrics, track])

  // Track active line from audio time
  useEffect(() => {
    if (lines.length === 0 || lines[0]?.time === null || lines[0]?.time === undefined) return
    let idx = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].time !== null && currentTime >= lines[i].time!) { idx = i; break }
    }
    setActiveIdx(idx)
  }, [currentTime, lines])

  // Auto-scroll to active line
  useEffect(() => {
    if (activeIdx < 0 || !scrollRef.current) return
    const container = scrollRef.current
    const activeEl = container.children[activeIdx] as HTMLElement | undefined
    if (activeEl) {
      const containerRect = container.getBoundingClientRect()
      const elRect = activeEl.getBoundingClientRect()
      const offset = elRect.top - containerRect.top
      const targetScroll = container.scrollTop + offset - container.clientHeight / 3
      container.scrollTo({ top: targetScroll, behavior: 'smooth' })
    }
  }, [activeIdx])

  // ESC key to close
  useEffect(() => {
    if (!showLyrics) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showGuide) { setShowGuide(false); return }
        if (showSubmit) { setShowSubmit(false); return }
        toggleShowLyrics()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showLyrics, toggleShowLyrics, showGuide, showSubmit])

  const handleOverlayClick = useCallback(() => {
    toggleShowLyrics()
  }, [toggleShowLyrics])

  const handleSubmitLyrics = async () => {
    if (!userLyrics.trim()) return
    if (!filename) { setSubmitStatus('error'); return }
    setSubmitStatus('saving')
    try {
      await ensureCsrfToken()
      const csrf = getCsrfToken()
      const resp = await fetch('/api/lyrics/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ filename, lyrics: userLyrics }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Submit failed')
      }
      setSubmitStatus('done')
      // Reload lyrics
      const params = new URLSearchParams()
      if (track?.title) params.set('title', track.title)
      if (track?.artist) params.set('artist', track.artist)
      if (filename) params.set('filename', filename)
      const r = await fetch(`/api/lyrics?${params.toString()}`)
      const d = await r.json()
      const l = d.lines || []
      if (l.length > 0) {
        setLines(l)
        setShowSubmit(false)
      }
    } catch {
      setSubmitStatus('error')
    }
  }

  const handleOverlayClose = useCallback(() => {
    toggleShowLyrics()
  }, [toggleShowLyrics])

  const hasTimestamps = lines.length > 0 && lines[0]?.time !== null && lines[0]?.time !== undefined
  const showEmpty = lyricsLoaded && (lines.length === 0 || lines[0]?.text === 'No lyrics available' || lines[0]?.text === 'Lyrics unavailable')

  if (!visible || !track) return null

  return (
    <div
      className={`${styles.overlay} ${animating ? styles.open : styles.close}`}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Lyrics overlay"
    >
      {/* Blurred background — gradient always, album art overlays when available */}
      <div
        className={styles.background}
        style={albumArt ? {
          backgroundImage: `url(${albumArt}), linear-gradient(135deg, #1B1A30, #211F38)`,
        } : undefined}
      />

      {/* Content */}
      <div className={styles.container} onClick={e => e.stopPropagation()}>
        {/* Album Art Section */}
        <div className={styles.albumSection}>
          <div className={styles.albumArtWrap}>
            {albumArt ? (
              <img
                src={albumArt}
                alt={track.title}
                className={styles.albumArt}
              />
            ) : (
              <div className={styles.albumArt}>
                <Disc3 size={64} className="text-white/20" />
              </div>
            )}
          </div>
          <div className={styles.trackInfoArea}>
            <h2 className={styles.songTitle} title={track.title}>
              {track.title}
            </h2>
            {track.artist && <p className={styles.artistName} title={track.artist}>{track.artist}</p>}
          </div>
        </div>

        {/* Lyrics Section */}
        <div className={styles.lyricsSection} ref={scrollRef}>
          {showEmpty ? (
            <div className={styles.emptyStateWrap}>
              <div className={styles.emptyState}>
                <FileText size={32} className="text-white/20 mb-3" />
                <p>No lyrics available for this track</p>
              </div>

              {!showSubmit ? (
                <button
                  className={styles.addLyricsBtn}
                  onClick={() => { setShowSubmit(true); setTimeout(() => submitRef.current?.focus(), 100) }}
                >
                  + Add lyrics
                </button>
              ) : (
                <div className={styles.submitForm}>
                  <div className={styles.submitHeader}>
                    <span className={styles.submitTitle}>Submit lyrics for this track</span>
                    <button
                      className={styles.guideToggle}
                      onClick={() => setShowGuide(!showGuide)}
                      title="How to format lyrics"
                    >
                      <Info size={14} />
                    </button>
                  </div>

                  {showGuide && (
                    <div className={styles.guideBox}>
                      <p className={styles.guideTitle}>How to add lyrics:</p>
                      <ul className={styles.guideList}>
                        <li>Paste lyrics with timestamps in <strong>LRC format</strong>: <code>[mm:ss.xx]Lyric text</code></li>
                        <li>Or paste plain text without timestamps</li>
                        <li>Find lyrics on sites like <strong>Genius</strong>, <strong>LRCLIB</strong>, or <strong>Musixmatch</strong></li>
                        <li>Timestamps must match the song audio for synced display</li>
                        <li>Example: <code>[00:12.50]This is the first line</code></li>
                      </ul>
                    </div>
                  )}

                  <textarea
                    ref={submitRef}
                    className={styles.lyricsTextarea}
                    placeholder={`Paste lyrics here...\n\nLRC format:\n[00:12.50]First line\n[00:16.80]Second line\n\nOr plain text:\nFirst line\nSecond line`}
                    value={userLyrics}
                    onChange={e => setUserLyrics(e.target.value)}
                    rows={8}
                  />

                  <div className={styles.submitActions}>
                    <button
                      className={styles.cancelBtn}
                      onClick={() => { setShowSubmit(false); setSubmitStatus('idle'); setUserLyrics('') }}
                    >
                      Cancel
                    </button>
                    <button
                      className={styles.saveBtn}
                      onClick={handleSubmitLyrics}
                      disabled={!userLyrics.trim() || submitStatus === 'saving'}
                    >
                      {submitStatus === 'saving' ? 'Saving...' : 'Save lyrics'}
                    </button>
                  </div>

                  {submitStatus === 'done' && (
                    <div className={styles.submitFeedback}>
                      <CheckCircle size={14} /> Lyrics saved and loaded!
                    </div>
                  )}
                  {submitStatus === 'error' && (
                    <div className={`${styles.submitFeedback} ${styles.submitError}`}>
                      <AlertCircle size={14} /> Failed to save. Try again.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : !hasTimestamps ? (
            <div className={styles.staticLyrics}>
              {lines.map((line, i) => (
                <div key={i} className={styles.lyricLineWrap}>
                  <p className={styles.lyricLine}>{line.text || '\u00A0'}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.syncedLyrics}>
              {lines.map((line, i) => {
                const isActive = i === activeIdx
                const isPast = i < activeIdx
                return (
                  <div
                    key={i}
                    className={`${styles.lyricLineWrap} ${isActive ? styles.active : ''} ${isPast ? styles.past : ''} ${!isActive && !isPast ? styles.future : ''}`}
                  >
                    <p className={styles.lyricLine}>
                      {line.text || '\u00A0'}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Close button */}
      <button
        className={styles.closeButton}
        onClick={e => { e.stopPropagation(); handleOverlayClose() }}
        aria-label="Close lyrics"
      >
        <X size={20} />
      </button>
    </div>
  )
}
