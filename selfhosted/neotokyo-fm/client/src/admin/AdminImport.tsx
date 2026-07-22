import { useState, useRef, useCallback, useEffect } from 'react'
import { expandPlaylist, previewDownloads, startDownload, uploadLocalFile, listDownloads, retryFailedDownloads, deleteDownload } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Upload, Link, ListMusic, Play, FileAudio, X, Loader2, RefreshCw, Trash2, CheckCircle, XCircle, Clock, ArrowUpDown, DownloadCloud, ChevronDown, ChevronRight, Plus, ExternalLink, Music, Gauge } from 'lucide-react'
import type { Download } from '../types/audio'

interface UploadMeta { title: string; artist: string; album: string; genre: string }

interface QueuedItem {
  url: string; filename: string; title?: string; duration?: number; filesize?: number
  thumbnail?: string; uploader?: string; extractor?: string; format: string
  previewed: boolean; previewing: boolean; error?: string
}

const FORMATS = [
  { value: 'mp3_192', label: 'MP3 192kbps' },
  { value: 'mp3_128', label: 'MP3 128kbps' },
  { value: 'mp3_320', label: 'MP3 320kbps' },
  { value: 'flac', label: 'FLAC' },
  { value: 'opus', label: 'Opus' },
  { value: 'original', label: 'Original' },
]

function formatSize(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1048576) return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${bytesPerSec} B/s`
}

function formatEta(secs: number): string {
  if (secs <= 0) return ''
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
  if (secs >= 60) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${secs}s`
}

function formatDuration(secs: number): string {
  if (!secs) return ''
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AdminImport() {
  const [url, setUrl] = useState('')
  const [queuedItems, setQueuedItems] = useState<QueuedItem[]>([])
  const [duplicates, setDuplicates] = useState('replace')
  const [localFiles, setLocalFiles] = useState<{ file: File; meta: UploadMeta }[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [expanding, setExpanding] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [downloads, setDownloads] = useState<Download[]>([])
  const [sortBy, setSortBy] = useState<'added' | 'progress' | 'speed'>('added')
  const dropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const prevIds = useRef<Set<string>>(new Set())

  useEffect(() => {}, [])

  useEffect(() => {
    const load = async () => {
      try {
        const list = await listDownloads()
        const newCompleted = list.filter((d: Download) => d.status === 'completed' && !prevIds.current.has(d.download_id))
        for (const d of newCompleted) {
          showToast(`Download complete: ${d.title || d.filename}`, 'success')
        }
        prevIds.current = new Set(list.map((d: Download) => d.download_id))
        setDownloads(list)
      } catch {}
    }
    load()
    pollRef.current = setInterval(load, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const fetchPreviewsFor = async (items: QueuedItem[]) => {
    const toPreview = items.filter(i => !i.previewed && !i.previewing)
    if (toPreview.length === 0) return
    setQueuedItems(prev => prev.map(i => toPreview.find(t => t.url === i.url) ? { ...i, previewing: true } : i))
    try {
      const data = await previewDownloads(toPreview.map(i => ({ url: i.url, filename: i.filename })))
      if (data.files) {
        setQueuedItems(prev => prev.map(i => {
          const match = data.files.find((f: any) => f.url === i.url)
          if (match) {
            return { ...i, title: match.title || i.title, duration: match.duration, filesize: match.filesize, thumbnail: match.thumbnail, uploader: match.uploader, extractor: match.extractor, previewed: true, previewing: false, error: undefined }
          }
          return { ...i, previewed: true, previewing: false }
        }))
      }
    } catch {
      setQueuedItems(prev => prev.map(i => toPreview.find(t => t.url === i.url) ? { ...i, previewing: false, previewed: true, error: 'Preview failed' } : i))
    }
  }

  const addItemsAndPreview = (items: { url: string; filename: string; title?: string }[]) => {
    const newItems: QueuedItem[] = items.map(item => ({
      url: item.url, filename: item.filename, title: item.title, format: 'mp3_192', previewed: !!item.title, previewing: false,
    }))
    setQueuedItems(prev => {
      const combined = [...prev, ...newItems]
      setTimeout(() => fetchPreviewsFor(combined), 0)
      return combined
    })
  }

  const handleExpand = async () => {
    if (!url.trim()) return
    setExpanding(true); setError('')
    try {
      const data = await expandPlaylist(url)
      if (data.error) { setError(data.error); return }
      const items = data.files.map((f: any) => ({ url: f.url, filename: f.filename || f.title || f.url, title: f.title }))
      addItemsAndPreview(items)
      showToast(`Found ${data.count} tracks`, 'success')
      setUrl('')
    } catch (e: any) {
      const msg = e?.message || 'Failed to expand URL'
      setError(msg); showToast(msg, 'error')
    }
    setExpanding(false)
  }

  const handleStartAll = async () => {
    if (queuedItems.length === 0) return
    setStarting(true); setError('')
    try {
      const res = await startDownload(queuedItems.map(i => ({ url: i.url, filename: i.filename, format: i.format })), duplicates)
      showToast(`Started ${res.count || queuedItems.length} download(s)`, 'success')
      setQueuedItems([])
    } catch (e: any) {
      const msg = e?.message || 'Failed to start downloads'
      if (msg.includes('CSRF')) showToast('Session expired, refresh the page', 'error')
      setError(msg); showToast(msg, 'error')
    }
    setStarting(false)
  }

  const removeQueued = (idx: number) => setQueuedItems(prev => prev.filter((_, i) => i !== idx))
  const clearAllQueued = () => setQueuedItems([])
  const updateItemFormat = (idx: number, format: string) => setQueuedItems(prev => prev.map((item, i) => i === idx ? { ...item, format } : item))

  const handleAddBatchUrls = () => {
    const lines = batchText.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'))
    if (lines.length === 0) { showToast('No valid URLs found', 'error'); return }
    addItemsAndPreview(lines.map(url => ({ url, filename: url.split('/').pop() || url })))
    showToast(`Added ${lines.length} URL(s)`, 'success')
    setBatchText('')
  }

  const handleClearFailed = async () => {
    const toRemove = downloads.filter(d => d.status === 'failed')
    if (toRemove.length === 0) { showToast('No failed downloads', 'info'); return }
    let ok = 0
    for (const d of toRemove) { try { await deleteDownload(d.download_id); ok++ } catch {} }
    showToast(`Cleared ${ok} failed download(s)`, 'success')
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|flac|m4a|ogg|wav|opus|webm)$/i))
    if (dropped.length === 0) { showToast('No audio files found', 'error'); return }
    setLocalFiles(prev => [...prev, ...dropped.map(f => ({ file: f, meta: { title: f.name.replace(/\.[^.]+$/, ''), artist: '', album: '', genre: '' } }))])
    showToast(`Added ${dropped.length} file(s)`, 'success')
  }, [])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    if (picked.length === 0) return
    setLocalFiles(prev => [...prev, ...picked.map(f => ({ file: f, meta: { title: f.name.replace(/\.[^.]+$/, ''), artist: '', album: '', genre: '' } }))])
    showToast(`Added ${picked.length} file(s)`, 'success')
  }

  const removeLocal = (idx: number) => setLocalFiles(prev => prev.filter((_, i) => i !== idx))
  const updateMeta = (idx: number, field: keyof UploadMeta, value: string) => setLocalFiles(prev => prev.map((item, i) => i === idx ? { ...item, meta: { ...item.meta, [field]: value } } : item))

  const uploadAll = async () => {
    if (localFiles.length === 0) return
    setUploading(true)
    let ok = 0, fail = 0
    for (const item of localFiles) {
      try { const res = await uploadLocalFile(item.file); if (res.ok) ok++; else fail++ } catch { fail++ }
    }
    setUploading(false)
    if (fail === 0) { showToast(`Uploaded ${ok} file(s)`, 'success'); setLocalFiles([]) }
    else { showToast(`${ok} uploaded, ${fail} failed`, 'error') }
  }

  const handleRetryAll = async () => {
    try {
      const r = await retryFailedDownloads()
      if (r.retried > 0) showToast(`Retrying ${r.retried} download(s)`, 'success')
      else showToast('No failed downloads to retry', 'info')
    } catch { showToast('Retry failed', 'error') }
  }

  const handleRetrySingle = async (downloadUrl: string) => {
    try { await startDownload([{ url: downloadUrl }], duplicates); showToast('Retrying...', 'success') } catch { showToast('Retry failed', 'error') }
  }

  const handleDeleteDownload = async (id: string) => {
    try { await deleteDownload(id); showToast('Download removed', 'info') } catch { showToast('Delete failed', 'error') }
  }

  const running = downloads.filter(d => d.status === 'running' || d.status === 'pending')
  const completed = downloads.filter(d => d.status === 'completed')
  const failed = downloads.filter(d => d.status === 'failed')
  const processing = downloads.filter(d => d.status === 'processing')

  const totalSpeed = running.reduce((s, d) => s + (d.speed || 0), 0)
  const maxSpeed = 10485760

  const sorted = [...downloads].sort((a, b) => {
    if (sortBy === 'progress') return (b.progress || 0) - (a.progress || 0)
    if (sortBy === 'speed') return (b.speed || 0) - (a.speed || 0)
    return (b.added || 0) - (a.added || 0)
  })

  return (
    <div className="p-6 pb-32 bg-surface-deep">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2"><DownloadCloud size={18} /> IMPORT</h2>
        <div className="flex items-center gap-2 text-[10px] font-body">
          {running.length > 0 && (
            <span className="flex items-center gap-1.5 text-success/80">
              <Gauge size={10} />
              <span className="font-mono text-[10px]">{formatSpeed(totalSpeed)}</span>
              <span>{running.length} active</span>
            </span>
          )}
          {failed.length > 0 && <span className="text-error/80">{failed.length} failed</span>}
          <span className="text-content-tertiary">{downloads.length} total</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-5">
          <h3 className="text-[10px] font-display tracking-[2px] text-hot-pink uppercase mb-3 flex items-center gap-1.5">
            <DownloadCloud size={12} /> URL Download
          </h3>
          <div className="flex gap-2 mb-2">
            <input value={url} onChange={e => { setUrl(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && handleExpand()}
              placeholder="YouTube, SoundCloud, direct MP3..."
              className="flex-1 px-3 py-2.5 bg-surface-sunken border border-border-default rounded-md text-[11px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
            <button onClick={handleExpand} disabled={expanding || !url.trim()}
              className="px-3 py-2.5 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white text-[11px] font-body hover:brightness-110 active:brightness-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-glow-pink-sm" title="Expand playlist/URL">
              {expanding ? <Loader2 size={14} className="animate-spin" /> : <ListMusic size={14} />}
            </button>
          </div>
          {error && (
            <p className="text-[10px] font-body text-error mb-2 bg-error/10 border border-error/20 rounded px-2 py-1">
              {error.includes('CSRF') ? 'Session expired. Please refresh the page.' : error}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[10px] font-body text-content-tertiary">Duplicates:</label>
            <select value={duplicates} onChange={e => setDuplicates(e.target.value)}
              className="px-2.5 py-1.5 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary focus:outline-none focus:border-hot-pink">
              <option value="replace">Replace</option>
              <option value="skip">Skip</option>
              <option value="rename">Rename</option>
            </select>
          </div>
          <div className="mt-3 border-t border-border-default/20 pt-2">
            <button onClick={() => setBatchOpen(!batchOpen)} className="flex items-center gap-1 text-[10px] font-body text-content-tertiary hover:text-electric-blue transition-all">
              {batchOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Batch URLs
            </button>
            {batchOpen && (
              <div className="mt-1.5">
                <textarea value={batchText} onChange={e => setBatchText(e.target.value)} placeholder="Paste one URL per line..." rows={3}
                  className="w-full px-2.5 py-1.5 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-electric-blue transition-all resize-none font-mono mb-1.5" />
                <button onClick={handleAddBatchUrls} disabled={!batchText.trim()}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-electric-blue/20 border border-electric-blue/30 text-electric-blue text-[10px] font-body hover:bg-electric-blue/30 disabled:opacity-35 transition-all">
                  <Plus size={10} /> Add URLs to Queue
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-5">
          <h3 className="text-[10px] font-display tracking-[2px] text-purple uppercase mb-3 flex items-center gap-1.5">
            <FileAudio size={12} /> Local Files
          </h3>
          <div ref={dropRef} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-6 text-center mb-3 transition-all cursor-pointer ${
              dragging ? 'border-hot-pink bg-hot-pink/10 shadow-glow-pink-sm' : 'border-border-default hover:border-purple/50'
            }`}
            onClick={() => inputRef.current?.click()}>
            <input ref={inputRef} type="file" multiple accept="audio/*,.mp3,.flac,.m4a,.ogg,.wav,.opus,.webm" onChange={handleFilePick} className="hidden" />
            <Upload size={22} className="mx-auto mb-1.5 text-content-tertiary" />
            <p className="text-xs font-body text-content-tertiary">Drop files or click to browse</p>
            <p className="text-[9px] font-body text-content-tertiary mt-0.5">MP3, FLAC, M4A, OGG, WAV</p>
          </div>
          {localFiles.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-body text-content-tertiary">{localFiles.length} file(s)</span>
                <button onClick={uploadAll} disabled={uploading}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-success/20 border border-success/30 text-success text-[10px] font-body hover:bg-success/30 disabled:opacity-35 transition-all">
                  <Upload size={10} /> {uploading ? 'Uploading...' : 'Upload All'}
                </button>
              </div>
              {localFiles.map((item, i) => (
                <div key={i} className="bg-surface-sunken/50 border border-border-default/20 rounded-md p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <FileAudio size={11} className="text-purple/60 shrink-0" />
                    <span className="text-[10px] font-body flex-1 truncate font-mono text-content-primary">{item.file.name}</span>
                    <span className="text-[9px] font-body text-content-tertiary">{formatSize(item.file.size)}</span>
                    <button onClick={() => removeLocal(i)} className="text-error/40 hover:text-error transition-all"><X size={10} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <input placeholder="Title" value={item.meta.title} onChange={e => updateMeta(i, 'title', e.target.value)}
                      className="px-1.5 py-1 bg-surface-sunken border border-border-default rounded-md text-[9px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-purple transition-all" />
                    <input placeholder="Artist" value={item.meta.artist} onChange={e => updateMeta(i, 'artist', e.target.value)}
                      className="px-1.5 py-1 bg-surface-sunken border border-border-default rounded-md text-[9px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-purple transition-all" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {queuedItems.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-display tracking-[2px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-1.5"><ListMusic size={14} /> QUEUE — {queuedItems.length} item{queuedItems.length > 1 ? 's' : ''}</h3>
            <div className="flex items-center gap-2">
              <button onClick={clearAllQueued} className="text-[10px] font-body text-content-tertiary hover:text-error transition-all">Clear All</button>
              <button onClick={handleStartAll} disabled={starting}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-gradient-to-r from-success/30 to-electric-blue/30 border border-success/40 text-success text-[11px] font-body tracking-[1px] uppercase hover:brightness-110 disabled:opacity-35 transition-all shadow-glow-blue-sm">
                {starting ? <Loader2 size={13} className="animate-spin" /> : <DownloadCloud size={13} />}
                Start All Downloads
              </button>
            </div>
          </div>
          <div className="space-y-2 mb-6">
            {queuedItems.map((item, i) => (
              <div key={`${item.url}-${i}`} className="bg-surface-raised/60 border border-border-default/30 rounded-lg overflow-hidden hover:border-purple/20 transition-all">
                <div className="flex p-3 gap-3">
                  <div className="w-14 h-14 rounded-md bg-surface-sunken shrink-0 overflow-hidden flex items-center justify-center border border-border-default/30">
                    {item.previewing ? (
                      <Loader2 size={14} className="animate-spin text-content-tertiary" />
                    ) : item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.fallback')?.classList.remove('hidden') }} />
                    ) : null}
                    <Music size={16} className={`text-content-tertiary ${item.thumbnail ? 'hidden' : ''} fallback`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-body text-content-primary truncate">{item.title || item.filename || 'Unknown'}</p>
                        {item.uploader && <p className="text-[10px] font-body text-content-tertiary truncate">{item.uploader}</p>}
                      </div>
                      <button onClick={() => removeQueued(i)} className="text-error/40 hover:text-error transition-all shrink-0"><X size={12} /></button>
                    </div>
                    <div className="flex items-center gap-2.5 mt-1 text-[9px] font-body text-content-tertiary flex-wrap">
                      {item.duration ? <span>{formatDuration(item.duration)}</span> : null}
                      {item.filesize ? <span>{formatSize(item.filesize)}</span> : null}
                      {item.extractor ? <span className="uppercase text-purple/60">{item.extractor}</span> : null}
                      {item.error ? <span className="text-error">{item.error}</span> : null}
                      {!item.previewed && !item.previewing && <span className="text-warning">Pending preview...</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <label className="text-[9px] font-body text-content-tertiary">Format:</label>
                      <select value={item.format} onChange={e => updateItemFormat(i, e.target.value)}
                        className="px-1.5 py-0.5 bg-surface-sunken border border-border-default rounded-md text-[9px] font-body text-content-primary focus:outline-none focus:border-electric-blue">
                        {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border-default/30 mb-4" />
        </>
      )}

      {queuedItems.length === 0 && <div className="border-t border-border-default/30 mb-4" />}

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-display tracking-[2px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-1.5"><DownloadCloud size={14} /> DOWNLOADS</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[10px] font-body text-content-tertiary mr-2">
            <ArrowUpDown size={10} />
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="bg-transparent border-none text-[10px] font-body text-content-tertiary focus:outline-none cursor-pointer">
              <option value="added">Newest</option>
              <option value="progress">Progress</option>
              <option value="speed">Speed</option>
            </select>
          </div>
          {failed.length > 0 && (
            <>
              <button onClick={handleRetryAll} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-warning/20 border border-warning/30 text-warning text-[10px] font-body hover:bg-warning/30 transition-all">
                <RefreshCw size={12} /> Retry All ({failed.length})
              </button>
              <button onClick={handleClearFailed} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-error/20 border border-error/30 text-error text-[10px] font-body hover:bg-error/30 transition-all">
                <Trash2 size={12} /> Clear Failed
              </button>
            </>
          )}
        </div>
      </div>

      {downloads.length === 0 ? (
        <div className="flex flex-col items-center gap-3 mt-12 text-content-tertiary">
          <DownloadCloud size={28} />
          <p className="text-xs font-body">No downloads yet. Use URL or Local Files above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {running.length > 0 && (
            <div>
              <h4 className="text-[10px] font-display tracking-[2px] text-electric-blue mb-2 uppercase flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" /> Active ({running.length})
              </h4>
              <div className="space-y-1.5">
                {running.map(d => (
                  <div key={d.download_id} className="bg-surface-raised/50 border border-electric-blue/10 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-body text-content-primary flex-1 truncate">{d.title || d.filename || d.url}</span>
                      <span className="text-[10px] font-mono text-electric-blue/60 ml-2">{d.progress}%</span>
                    </div>
                    <div className="w-full bg-surface-sunken rounded-full h-1.5 mb-1.5">
                      <div className="bg-gradient-to-r from-electric-blue to-hot-pink h-1.5 rounded-full transition-all duration-500 shadow-glow-blue-sm" style={{ width: `${d.progress || 0}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-body text-content-tertiary">
                      <span>{d.downloaded_bytes ? formatSize(d.downloaded_bytes) : ''}{d.total_bytes ? ` / ${formatSize(d.total_bytes)}` : ''}</span>
                      <div className="flex items-center gap-3">
                        {d.speed ? <span>⬇ {formatSpeed(d.speed)}</span> : null}
                        {d.eta ? <span>⏱ {formatEta(d.eta)}</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {processing.length > 0 && (
            <div>
              <h4 className="text-[10px] font-display tracking-[2px] text-warning mb-2 uppercase flex items-center gap-1.5"><Clock size={12} /> Processing ({processing.length})</h4>
              <div className="space-y-1">
                {processing.map(d => (
                  <div key={d.download_id} className="flex items-center gap-2 text-xs p-3 rounded-md bg-warning/5 border border-warning/10">
                    <Clock size={12} className="text-warning/60 shrink-0" />
                    <span className="flex-1 truncate font-body text-content-primary">{d.title || d.filename}</span>
                    <span className="text-[10px] font-body text-warning/60">Converting...</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {failed.length > 0 && (
            <div>
              <h4 className="text-[10px] font-display tracking-[2px] text-error mb-2 uppercase flex items-center gap-1.5"><XCircle size={12} /> Failed ({failed.length})</h4>
              <div className="space-y-1">
                {failed.map(d => (
                  <div key={d.download_id} className="flex items-center gap-2 text-xs p-3 rounded-md bg-error/5 border border-error/10">
                    <XCircle size={12} className="text-error/60 shrink-0" />
                    <span className="flex-1 truncate font-body text-content-primary">{d.title || d.filename || d.url}</span>
                    <span className="text-[10px] font-body text-error/60 max-w-[200px] truncate" title={d.error || ''}>{d.error || 'Unknown error'}</span>
                    <button onClick={() => handleRetrySingle(d.url)} className="px-2 py-1 text-[10px] font-body bg-warning/20 border border-warning/30 rounded-md text-warning hover:bg-warning/30 transition-all">Retry</button>
                    <button onClick={() => handleDeleteDownload(d.download_id)} className="text-error/40 hover:text-error transition-all"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h4 className="text-[10px] font-display tracking-[2px] text-success mb-2 uppercase flex items-center gap-1.5"><CheckCircle size={12} /> Completed ({completed.length})</h4>
              <div className="space-y-1">
                {sorted.filter(d => d.status === 'completed').slice(0, 30).map(d => (
                  <div key={d.download_id} className="flex items-center gap-2 text-xs p-3 rounded-md bg-surface-raised/30 border border-border-default/20 hover:bg-surface-raised/50 transition-all">
                    <CheckCircle size={12} className="text-success/60 shrink-0" />
                    <span className="flex-1 truncate font-body text-content-primary">{d.title || d.filename}</span>
                    {d.filepath && <span className="text-[9px] font-mono text-content-tertiary truncate max-w-[200px]">{d.filepath.split('/').pop()}</span>}
                    {d.total_bytes ? <span className="text-[10px] font-body text-content-tertiary">{formatSize(d.total_bytes)}</span> : null}
                    <button onClick={() => handleDeleteDownload(d.download_id)} className="text-error/40 hover:text-error transition-all"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
