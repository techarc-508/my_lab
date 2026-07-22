import { useState, useRef, useCallback, useEffect } from 'react'
import { searchYouTube, expandPlaylist, startDownload, getDownload } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { API_BASE } from '../config'
import { Search, Monitor, Download, Loader2, ListMusic, Plus, Radio, X, Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize } from 'lucide-react'
import type { YTSearchResult } from '../types/audio'

export default function YouTubePage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YTSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [downloading, setDownloading] = useState<Set<string>>(new Set())
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [searchPulse, setSearchPulse] = useState(false)

  const [activeVideo, setActiveVideo] = useState<YTSearchResult | null>(null)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoMuted, setVideoMuted] = useState(false)
  const [videoVolume, setVideoVolume] = useState(1)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [videoLoading, setVideoLoading] = useState(true)
  const [videoError, setVideoError] = useState(false)
  const [showVolume, setShowVolume] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const volumeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hasSearched = useRef(false)

  useEffect(() => {
    return () => {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    }
  }, [])

  useEffect(() => {
    if (!activeVideo) {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
      setVideoPlaying(false)
      setVideoProgress(0)
      setVideoDuration(0)
    }
  }, [activeVideo])

  useEffect(() => {
    if (!activeVideo) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const v = videoRef.current
      switch (e.key) {
        case 'Escape': handleCloseVideo(); break
        case ' ': e.preventDefault(); e.stopImmediatePropagation(); togglePlay(); break
        case 'm': case 'M': toggleMute(); break
        case 'f': case 'F': toggleFullscreen(); break
        case 'ArrowLeft': e.preventDefault(); e.stopImmediatePropagation(); if (v) v.currentTime = Math.max(0, v.currentTime - 5); break
        case 'ArrowRight': e.preventDefault(); e.stopImmediatePropagation(); if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + 5); break
        case 'ArrowUp': e.preventDefault(); e.stopImmediatePropagation(); if (v) { v.volume = Math.min(1, v.volume + 0.1); setVideoMuted(false); setVideoVolume(v.volume) } break
        case 'ArrowDown': e.preventDefault(); e.stopImmediatePropagation(); if (v) { v.volume = Math.max(0, v.volume - 0.1); setVideoVolume(v.volume) } break
        case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
          if (v && v.duration) v.currentTime = (parseInt(e.key) / 10) * v.duration; break
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideo, videoPlaying, videoMuted])

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setResults([])
    setPage(1)
    setHasMore(true)
    setActiveVideo(null)
    setSearchPulse(true)
    setTimeout(() => setSearchPulse(false), 500)
    try {
      const data = await searchYouTube(query, 1, 10)
      setResults(data.results)
      setHasMore(data.has_more)
      hasSearched.current = true
    } catch { showToast('Search failed', 'error') }
    setLoading(false)
  }

  const handleLoadMore = async () => {
    if (!query.trim() || !hasMore) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const data = await searchYouTube(query, nextPage, 10)
      setResults(prev => [...prev, ...data.results])
      setPage(nextPage)
      setHasMore(data.has_more)
    } catch { showToast('Failed to load more', 'error') }
    setLoadingMore(false)
  }

  const extractVideoId = (url: string) => url.split('v=')[1]?.split('&')[0] || url.split('/').pop() || ''

  const handlePlay = useCallback((r: YTSearchResult) => {
    const videoId = extractVideoId(r.url)
    if (!videoId) return

    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    setActiveVideo(r)
    setVideoPlaying(true)
    setVideoProgress(0)
    setVideoDuration(0)
    setVideoLoading(true)
    setVideoError(false)
  }, [])

  const handleVideoCanPlay = useCallback(() => {
    setVideoLoading(false)
    const v = videoRef.current
    if (v) { v.volume = videoVolume; v.play().then(() => setVideoPlaying(true)).catch(() => setVideoPlaying(false)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCloseVideo = useCallback(() => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    setActiveVideo(null)
    setVideoPlaying(false)
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (videoPlaying) { v.pause(); setVideoPlaying(false) }
    else { v.play().then(() => setVideoPlaying(true)).catch(() => {}) }
  }, [videoPlaying])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setVideoMuted(!videoMuted)
  }, [videoMuted])

  const toggleFullscreen = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (document.fullscreenElement) document.exitFullscreen()
    else v.requestFullscreen().catch(() => {})
  }, [])

  const toggleMini = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((document as any).pictureInPictureElement) { document.exitPictureInPicture().catch(() => {}) }
    else if ((v as any).requestPictureInPicture) { (v as any).requestPictureInPicture().catch(() => {}) }
  }, [])

  const handleVolumeChange = useCallback((val: number) => {
    const v = videoRef.current
    if (!v) return
    v.volume = val
    v.muted = val === 0
    setVideoVolume(val)
    setVideoMuted(val === 0)
  }, [])

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (!v || !videoDuration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = pct * videoDuration
  }, [videoDuration])

  const handleDownload = async (r: YTSearchResult) => {
    if (downloading.has(r.url)) return
    setDownloading(prev => new Set(prev).add(r.url))
    showToast(`Starting download: ${r.title}`, 'info')
    try {
      const result = await startDownload([{ url: r.url }])
      if (result?.downloads?.[0]?.download_id) {
        pollDownload(result.downloads[0].download_id, r.title)
      }
    } catch {
      showToast(`Download failed: ${r.title}`, 'error')
      setDownloading(prev => { const next = new Set(prev); next.delete(r.url); return next })
    }
  }

  const pollDownload = (id: string, title: string) => {
    const check = async () => {
      try {
        const status = await getDownload(id)
        if (status.status === 'completed') {
          showToast(`Download complete: ${title}`, 'success')
          setDownloading(prev => { const next = new Set(prev); next.delete(id); return next })
        } else if (status.status === 'failed') {
          showToast(`Download failed: ${title} — ${status.error || ''}`, 'error')
          setDownloading(prev => { const next = new Set(prev); next.delete(id); return next })
        } else { setTimeout(check, 2000) }
      } catch { setTimeout(check, 2000) }
    }
    setTimeout(check, 2000)
  }

  const handleImportPlaylist = async () => {
    if (!playlistUrl.trim()) return
    setImporting(true)
    try {
      const data = await expandPlaylist(playlistUrl)
      if (data.error) { showToast(data.error, 'error') }
      else { showToast(`Imported ${data.count} videos`, 'success'); setShowImport(false); setPlaylistUrl('') }
    } catch { showToast('Failed to import playlist', 'error') }
    setImporting(false)
  }

  const fmtTime = (s: number) => {
    if (!s || !isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const activeVideoId = activeVideo ? extractVideoId(activeVideo.url) : ''

  const VolumeIcon = videoMuted || videoVolume === 0 ? VolumeX : videoVolume < 0.5 ? Volume1 : Volume2

  const resultsList = (
    <div className="flex flex-col gap-1">
      {results.map((r, index) => {
        const isDownloading = downloading.has(r.url)
        const isActive = activeVideo?.url === r.url
        return (
          <div
            key={r.url}
            className={`yt-result-card rounded-xl overflow-hidden transition-all duration-300 ${
              isActive
                ? 'yt-card-active border border-neon-pink/30 shadow-glow-pink-sm ring-1 ring-neon-pink/20'
                : 'bg-surface-card/50 border border-border-subtle/50 hover:border-neon-pink/30 card-hover'
            }`}
            style={{ '--i': index } as React.CSSProperties}
          >
            <div className="flex items-center gap-2 p-2">
              <button onClick={() => handlePlay(r)} className="relative shrink-0 group">
                <div className="w-28 aspect-video rounded-lg overflow-hidden bg-surface-deep">
                  {r.thumbnail ? (
                    <img src={r.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Monitor size={18} className="text-neon-pink/30" /></div>
                  )}
                  {isActive && videoPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="flex items-center gap-0.5">
                        {[0,1,2].map(i => (
                          <div key={i} className="w-0.5 bg-neon-pink rounded-full animate-pulse" style={{ height: 8 + Math.random() * 8, animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  {!isActive && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                      <Play size={16} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/70 text-[9px] text-white font-mono">
                  {formatDuration(r.duration)}
                </div>
              </button>

              <div className="flex-1 min-w-0 py-1">
                <p className={`text-[11px] font-medium line-clamp-2 leading-tight ${isActive ? 'text-neon-pink' : 'text-content-primary'}`}>{r.title}</p>
                <p className="text-[10px] text-content-tertiary mt-0.5 truncate">{r.uploader}</p>
                <div className="flex items-center gap-1 mt-1">
                  <button onClick={() => handleDownload(r)} disabled={isDownloading}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-[9px] font-medium hover:bg-neon-pink/20 transition-all">
                    {isDownloading ? <Loader2 size={9} className="animate-spin" /> : <Download size={9} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
      {hasMore && results.length > 0 && (
        <button onClick={handleLoadMore} disabled={loadingMore}
          className="w-full mt-1 py-2 rounded-xl border border-border-subtle/50 text-[11px] text-content-secondary hover:text-neon-pink hover:border-neon-pink/30 transition-all">
          {loadingMore ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )

  return (
    <div className="p-6 pb-32">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Radio size={20} className="text-neon-pink" />
        <h2 className="text-lg font-bold text-content-primary">YouTube</h2>
        <div className="flex-1" />
        <button onClick={() => setShowImport(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] border border-neon-pink/30 text-neon-pink hover:bg-neon-pink/10 transition-all">
          <Plus size={12} /> Import Playlist
        </button>
      </div>

      {showImport && (
        <div className="mb-4 bg-surface-card/50 border border-border-subtle/50 rounded-xl p-4 animate-slide-up">
          <div className="flex items-center gap-2 mb-2">
            <ListMusic size={14} className="text-neon-pink" />
            <span className="text-[10px] text-white/40 tracking-wider uppercase">Import YouTube Playlist</span>
          </div>
          <div className="flex gap-2">
            <input value={playlistUrl} onChange={e => setPlaylistUrl(e.target.value)}
              placeholder="Paste playlist URL..."
              className="flex-1 px-3 py-2 bg-surface-deep border border-border-subtle/50 rounded-lg text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-neon-pink/50" />
            <button onClick={handleImportPlaylist} disabled={importing}
              className="px-3 py-2 rounded-lg bg-neon-pink/20 border border-neon-pink/30 text-neon-pink text-xs hover:bg-neon-pink/30 transition-all">
              {importing ? <Loader2 size={14} className="animate-spin" /> : 'Import'}
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="flex gap-2 mb-6">
        <div className={`flex-1 relative ${searchPulse ? 'yt-search-pulse' : ''}`}>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search YouTube..."
            className="w-full px-3 py-2.5 bg-surface-card border border-border-subtle rounded-xl text-xs focus:outline-none focus:border-neon-pink/50 transition-all" />
        </div>
        <button onClick={handleSearch} disabled={loading}
          className="px-4 py-2.5 bg-gradient-to-r from-neon-pink to-neon-purple rounded-xl text-xs text-white font-medium hover:brightness-110 active:scale-95 transition-all shadow-glow-pink-sm">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        </button>
      </div>

      {loading && <div className="w-full h-0.5 rounded-full mb-4 yt-neon-sweep" />}

      {/* YouTube-style layout: video left, results right */}
      {activeVideo && activeVideoId ? (
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Left: Video player (smaller) */}
          <div className="w-full lg:w-[60%] xl:w-[65%] shrink-0">
            <div className="relative rounded-xl overflow-hidden border border-neon-pink/20 shadow-glow-pink-md bg-black">
              <video
                ref={videoRef}
                src={`${API_BASE}/api/yt-stream/${activeVideoId}`}
                className="w-full aspect-video bg-black cursor-pointer"
                onClick={togglePlay}
                onCanPlay={handleVideoCanPlay}
                onTimeUpdate={() => {
                  const v = videoRef.current
                  if (v) { setVideoProgress(v.currentTime); setVideoDuration(v.duration || 0) }
                }}
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
                onEnded={() => setVideoPlaying(false)}
                onError={() => { setVideoError(true); setVideoLoading(false) }}
                onWaiting={() => setVideoLoading(true)}
                onPlaying={() => setVideoLoading(false)}
                playsInline
                crossOrigin="anonymous"
              />

              {videoLoading && !videoError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 size={28} className="text-neon-pink animate-spin" />
                </div>
              )}

              {videoError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
                  <Monitor size={28} className="text-neon-pink/50" />
                  <p className="text-xs text-content-tertiary">Video unavailable</p>
                  <button onClick={() => handleDownload(activeVideo)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-pink/20 border border-neon-pink/30 text-neon-pink text-xs hover:bg-neon-pink/30 transition-all">
                    <Download size={12} /> Download Audio
                  </button>
                </div>
              )}

              {/* Seek bar */}
              {videoDuration > 0 && (
                <div onClick={seek}
                  className="absolute bottom-[48px] left-0 right-0 h-1.5 bg-white/10 cursor-pointer group z-10 hover:h-2 transition-all">
                  <div className="h-full bg-neon-pink transition-[width] duration-100" style={{ width: `${(videoProgress / videoDuration) * 100}%` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-neon-pink shadow-glow-pink-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ left: `calc(${(videoProgress / videoDuration) * 100}% - 6px)` }} />
                </div>
              )}

              {/* Controls */}
              <div className="yt-video-controls absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center gap-2 z-10">
                <button onClick={togglePlay}
                  className="w-7 h-7 rounded-full bg-neon-pink/90 flex items-center justify-center hover:bg-neon-pink transition-all shrink-0">
                  {videoPlaying ? <Pause size={12} className="text-white" /> : <Play size={12} className="text-white ml-0.5" />}
                </button>

                <div className="relative shrink-0"
                  onMouseEnter={() => setShowVolume(true)}
                  onMouseLeave={() => { setShowVolume(false); clearTimeout(volumeTimeout.current) }}>
                  <button onClick={toggleMute}
                    className="text-content-secondary hover:text-content-primary transition-all">
                    <VolumeIcon size={14} />
                  </button>
                  {showVolume && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface-raised border border-border-subtle rounded-lg p-2 shadow-xl"
                      onMouseEnter={() => clearTimeout(volumeTimeout.current)}
                      onMouseLeave={() => setShowVolume(false)}>
                      <input type="range" min="0" max="1" step="0.05"
                        value={videoMuted ? 0 : videoVolume}
                        onChange={e => handleVolumeChange(parseFloat(e.target.value))}
                        className="w-20 h-1 accent-neon-pink cursor-pointer" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-content-primary truncate font-medium">{activeVideo.title}</p>
                </div>

                <span className="text-[10px] text-content-tertiary font-mono shrink-0">
                  {fmtTime(videoProgress)} / {fmtTime(videoDuration)}
                </span>

                <button onClick={toggleMini}
                  className="p-1 rounded text-content-secondary hover:text-content-primary hover:bg-white/10 transition-all shrink-0"
                  title="Picture in Picture">
                  <Minimize size={13} />
                </button>
                <button onClick={toggleFullscreen}
                  className="p-1 rounded text-content-secondary hover:text-content-primary hover:bg-white/10 transition-all shrink-0"
                  title="Fullscreen">
                  <Maximize size={13} />
                </button>
                <button onClick={handleCloseVideo}
                  className="p-1 rounded text-content-secondary hover:text-error hover:bg-white/10 transition-all shrink-0"
                  title="Close">
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Video info below player */}
            <div className="mt-2 px-1">
              <p className="text-sm font-semibold text-content-primary line-clamp-2">{activeVideo.title}</p>
              <p className="text-[11px] text-content-tertiary mt-0.5">{activeVideo.uploader}</p>
            </div>

            {/* Results below video on mobile */}
            <div className="mt-4 lg:hidden">{resultsList}</div>
          </div>

          {/* Right: Results list */}
          <div className="flex-1 min-w-0 hidden lg:block">
            <p className="text-[10px] text-content-tertiary uppercase tracking-wider font-bold mb-2 px-1">Results</p>
            {resultsList}
          </div>
        </div>
      ) : (
        /* No video active — show results in grid */
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r, index) => {
            const isDownloading = downloading.has(r.url)
            return (
              <div key={r.url}
                className="yt-result-card rounded-2xl overflow-hidden bg-surface-card/50 border border-border-subtle/50 hover:border-neon-pink/30 card-hover transition-all duration-300"
                style={{ '--i': index } as React.CSSProperties}>
                <button onClick={() => handlePlay(r)} className="w-full text-left group">
                  <div className="relative aspect-video bg-surface-deep overflow-hidden">
                    {r.thumbnail ? (
                      <img src={r.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Monitor size={24} className="text-neon-pink/30" /></div>
                    )}
                    <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white font-mono">
                      {formatDuration(r.duration)}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                      <div className="w-10 h-10 rounded-full bg-neon-pink/90 flex items-center justify-center shadow-glow-pink-sm">
                        <Play size={18} className="text-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-content-primary truncate group-hover:text-neon-pink transition-colors">{r.title}</p>
                    <p className="text-[10px] text-content-tertiary mt-0.5 truncate">{r.uploader}</p>
                  </div>
                </button>
                <div className="px-3 pb-2">
                  <button onClick={() => handleDownload(r)} disabled={isDownloading}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-neon-pink/10 border border-neon-pink/20 text-neon-pink text-[9px] font-medium hover:bg-neon-pink/20 transition-all">
                    {isDownloading ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                    {isDownloading ? 'Saving...' : 'Download'}
                  </button>
                </div>
              </div>
            )
          })}
          {hasMore && results.length > 0 && (
            <button onClick={handleLoadMore} disabled={loadingMore}
              className="w-full mt-4 py-2.5 rounded-xl border border-border-subtle/50 text-xs text-content-secondary hover:text-neon-pink hover:border-neon-pink/30 transition-all">
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
