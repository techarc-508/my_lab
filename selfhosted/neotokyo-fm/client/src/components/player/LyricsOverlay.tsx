import { useState, useEffect, useRef, useCallback } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'
import { X, Sparkles, Maximize2, Info, CheckCircle, AlertCircle, Upload, Disc3 } from 'lucide-react'
import styles from './lyricsOverlay.module.css'

interface LyricLine { time: number | null; text: string; translation?: string }

const CACHE_TTL = 24 * 60 * 60 * 1000

function getCacheKey(title: string, artist: string): string {
  return `neotokyo-lyrics-${title}-${artist}`
}

function loadFromCache(title: string, artist: string): { lines: LyricLine[] } | null {
  try {
    const raw = localStorage.getItem(getCacheKey(title, artist))
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (Date.now() - entry.ts > CACHE_TTL) { localStorage.removeItem(getCacheKey(title, artist)); return null }
    return entry.data
  } catch { return null }
}

function saveToCache(title: string, artist: string, data: { lines: LyricLine[] }) {
  try {
    localStorage.setItem(getCacheKey(title, artist), JSON.stringify({ ts: Date.now(), data }))
  } catch { /* quota exceeded */ }
}

function deriveCoverUrl(trackUrl: string | undefined): string | undefined {
  if (!trackUrl) return undefined
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

function parseLRC(text: string): LyricLine[] {
  const lines: LyricLine[] = []
  const lrcRe = /^\[(\d+):(\d+)[\.:](\d+)\](.*)$/
  for (const line of text.split('\n')) {
    const m = line.match(lrcRe)
    if (m) {
      const min = parseInt(m[1]), sec = parseInt(m[2]), ms = parseInt(m[3])
      const time = min * 60 + sec + ms / 100
      lines.push({ time, text: m[4].trim() })
    } else if (line.trim()) {
      lines.push({ time: null, text: line.trim() })
    }
  }
  return lines.length > 0 ? lines : [{ time: null, text }]
}

type LyricsMode = 'both' | 'japanese' | 'english'

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
  const [syncOffset, setSyncOffset] = useState(0)
  const [lyricsMode, setLyricsMode] = useState<LyricsMode>('both')
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeLineRef = useRef<HTMLDivElement | null>(null)
  const prevTrackUrl = useRef<string | undefined>(undefined)
  const submitRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filename = track?.url ? deriveFilename(track.url) : undefined
  const albumArt = track?.albumArt || (track?.url ? deriveCoverUrl(track.url) : undefined) || (filename ? `/api/cover/${encodeURIComponent(filename)}` : undefined)

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
    setSyncOffset(0)
    const cached = loadFromCache(track.title || '', track.artist || '')
    if (cached && cached.lines.length > 0) {
      setLines(cached.lines)
      setLyricsLoaded(true)
      return
    }
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
          saveToCache(track.title || '', track.artist || '', { lines: l })
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

  useEffect(() => {
    if (!showLyrics) return
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'ArrowUp') { e.preventDefault(); setSyncOffset(s => Math.min(10, s + 0.25)) }
      if (e.shiftKey && e.key === 'ArrowDown') { e.preventDefault(); setSyncOffset(s => Math.max(-10, s - 0.25)) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showLyrics])

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

  useEffect(() => {
    if (lines.length === 0 || lines[0]?.time === null || lines[0]?.time === undefined) return
    const adjustedTime = currentTime + syncOffset
    let idx = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].time !== null && adjustedTime >= lines[i].time!) { idx = i; break }
    }
    setActiveIdx(idx)
  }, [currentTime, lines, syncOffset])

  useEffect(() => {
    if (activeIdx < 0 || !activeLineRef.current || !scrollRef.current) return
    const activeLine = activeLineRef.current
    const container = scrollRef.current
    const activeOffsetTop = activeLine.offsetTop
    const containerHeight = container.clientHeight
    const activeHeight = activeLine.clientHeight
    container.scrollTo({
      top: activeOffsetTop - containerHeight / 2 + activeHeight / 2,
      behavior: 'smooth',
    })
  }, [activeIdx])

  useEffect(() => {
    if (!showLyrics) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSubmit) { setShowSubmit(false); return }
        toggleShowLyrics()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showLyrics, toggleShowLyrics, showSubmit])

  const handleOverlayClick = useCallback(() => { toggleShowLyrics() }, [toggleShowLyrics])

  const handleLineClick = (time: number) => {
    audioEngine.seek(time)
  }

  const handleLrcUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const parsed = parseLRC(text)
      if (parsed.length > 0) {
        setLines(parsed)
        setLyricsLoaded(true)
        setUserLyrics(text)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleSubmitLyrics = async () => {
    if (!userLyrics.trim()) return
    if (!filename) { setSubmitStatus('error'); return }
    setSubmitStatus('saving')
    try {
      const token = (() => { try { return localStorage.getItem('neotokyo-auth-token') || '' } catch { return '' } })()
      const resp = await fetch('/api/lyrics/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ filename, lyrics: userLyrics }),
      })
      if (!resp.ok) throw new Error(await resp.text() || 'Submit failed')
      setSubmitStatus('done')
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
        saveToCache(track?.title || '', track?.artist || '', { lines: l })
      }
    } catch {
      setSubmitStatus('error')
    }
  }

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
      <div
        className={styles.background}
        style={albumArt ? {
          backgroundImage: `url(${albumArt}), linear-gradient(135deg, #0a0a14, #110e20)`,
        } : undefined}
      />

      <button className={styles.closeButton} onClick={e => { e.stopPropagation(); toggleShowLyrics() }} aria-label="Close lyrics">
        <X size={18} />
      </button>

      <div className={styles.topBar}>
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot} />
          <span className={styles.topLabel}>REAL-TIME TOKYO LYRICS</span>
        </div>
      </div>

      <div className={styles.mainContent} onClick={e => e.stopPropagation()}>
        <div className={styles.albumSide}>
          <div className={styles.albumArtWrap}>
            {albumArt ? (
              <img src={albumArt} alt={track.title} className={styles.albumArt} />
            ) : (
              <div className={styles.albumArtPlaceholder}>
                <Disc3 size={64} className="text-white/15" />
              </div>
            )}
          </div>
          <h2 className={styles.songTitle} title={track.title}>{track.title}</h2>
          {track.artist && <p className={styles.artistName} title={track.artist}>{track.artist}</p>}
          {track.source && <p className={styles.sourceLabel}>{track.source}</p>}
        </div>

        <div className={styles.lyricsPanel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitleArea}>
              <Sparkles size={16} className={styles.sparkleIcon} />
              <div className={styles.panelTitleBlock}>
                <span className={styles.panelTitle}>TOKYO-FM LYRIC SYNC CORE</span>
                <span className={styles.panelSubtitle}>REAL-TIME CASSETTE TRANSLATION MATRIX</span>
              </div>
            </div>
            <div className={styles.panelControls}>
              {syncOffset !== 0 && (
                <span className={styles.syncBadge}>
                  {syncOffset > 0 ? '+' : ''}{syncOffset.toFixed(2)}s
                </span>
              )}
              <div className={styles.langToggle}>
                {(['both', 'japanese', 'english'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setLyricsMode(mode)}
                    className={`${styles.langBtn} ${lyricsMode === mode ? styles.langBtnActive : ''}`}
                  >
                    {mode === 'both' ? 'BOTH' : mode === 'japanese' ? 'JP' : 'EN'}
                  </button>
                ))}
              </div>
              <button className={styles.expandBtn}><Maximize2 size={13} /></button>
            </div>
          </div>

          <div ref={scrollRef} className={styles.lyricsBody}>
            {showEmpty ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>NO LYRICS DETECTED</p>
                <p className={styles.emptyDesc}>Load a track from your library to view time-synced lyrics.</p>
                {!showSubmit ? (
                  <div className={styles.emptyActions}>
                    <button className={styles.addLyricsBtn} onClick={() => { setShowSubmit(true); setTimeout(() => submitRef.current?.focus(), 100) }}>
                      + Add Lyrics
                    </button>
                    <label className={styles.uploadBtn}>
                      <Upload size={13} />
                      Upload LRC
                      <input ref={fileInputRef} type="file" accept=".lrc,.txt" className="hidden" onChange={handleLrcUpload} />
                    </label>
                  </div>
                ) : (
                  <div className={styles.submitForm}>
                    <textarea
                      ref={submitRef}
                      className={styles.textarea}
                      placeholder={'Paste lyrics here...\n\nLRC format:\n[00:12.50]First line\n[00:16.80]Second line'}
                      value={userLyrics}
                      onChange={e => setUserLyrics(e.target.value)}
                      rows={6}
                      maxLength={65535}
                    />
                    <div className={styles.submitRow}>
                      <span className={styles.charCount}>{userLyrics.length} / 65535</span>
                      <div className={styles.submitBtns}>
                        <button onClick={() => { setShowSubmit(false); setSubmitStatus('idle'); setUserLyrics('') }} className={styles.cancelBtn}>Cancel</button>
                        <button onClick={handleSubmitLyrics} disabled={!userLyrics.trim() || submitStatus === 'saving'} className={styles.saveBtn}>
                          {submitStatus === 'saving' ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                    {submitStatus === 'done' && <p className={styles.successMsg}><CheckCircle size={12} /> Saved!</p>}
                    {submitStatus === 'error' && <p className={styles.errorMsg}><AlertCircle size={12} /> Failed.</p>}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.lyricsList}>
                {lines.map((line, index) => {
                  const isActive = index === activeIdx
                  const showJp = lyricsMode === 'both' || lyricsMode === 'japanese'
                  const showEn = (lyricsMode === 'both' || lyricsMode === 'english') && line.translation
                  return (
                    <div
                      key={index}
                      ref={isActive ? activeLineRef : null}
                      onClick={() => line.time !== null && line.time !== undefined && handleLineClick(line.time)}
                      className={`${styles.lyricLine} ${isActive ? styles.lyricLineActive : ''}`}
                    >
                      {showJp && (
                        <p className={`${styles.lyricText} ${isActive ? styles.lyricTextActive : ''}`}>
                          {isActive ? `\u2014 ${line.text || '\u00A0'} \u2014` : (line.text || '\u00A0')}
                        </p>
                      )}
                      {showEn && line.translation && (
                        <p className={`${styles.lyricTranslation} ${isActive ? styles.lyricTranslationActive : ''}`}>
                          {line.translation}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className={styles.panelFooter}>
            <div className={styles.footerTip}>
              <Info size={10} className={styles.footerTipIcon} />
              <span>Click any lyric line to skip audio playback directly<br />to that timestamp.</span>
            </div>
            <div className={styles.footerIndicators}>
              <div className={styles.indicator}>
                <span className={styles.indicatorLabel}>PCM STEREO</span>
                <span className={styles.indicatorValue}>LOCK</span>
              </div>
              <div className={styles.indicator}>
                <span className={styles.indicatorLabel}>BPM</span>
                <span className={styles.indicatorValue}>SYNCED</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
