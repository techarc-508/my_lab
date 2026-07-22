import { useState, useEffect, useRef } from 'react'
import { listDownloads, retryFailedDownloads, deleteDownload } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { RefreshCw, Trash2, Download as DownloadIcon, CheckCircle, XCircle, Clock, ArrowUpDown, Gauge } from 'lucide-react'
import type { Download } from '../types/audio'

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

function formatSize(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export default function AdminDownloads() {
  const [downloads, setDownloads] = useState<Download[]>([])
  const [sortBy, setSortBy] = useState<'added' | 'progress' | 'speed'>('added')
  const prevIds = useRef<Set<string>>(new Set())

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

  useEffect(() => { load(); const id = setInterval(load, 2000); return () => clearInterval(id) }, [])

  const handleRetry = async () => {
    try { const r = await retryFailedDownloads(); showToast(`Retrying ${r.retried} downloads`, 'success'); load() } catch { showToast('Retry failed', 'error') }
  }

  const handleRetrySingle = async (url: string) => {
    try { const { startDownload } = await import('../services/grabberAPI'); await startDownload([{ url }], 'replace'); showToast('Retrying...', 'success'); load() }
    catch { showToast('Retry failed', 'error') }
  }

  const handleDelete = async (id: string) => { try { await deleteDownload(id); load() } catch { showToast('Delete failed', 'error') } }

  const running = downloads.filter(d => d.status === 'running' || d.status === 'pending')
  const completed = downloads.filter(d => d.status === 'completed')
  const failed = downloads.filter(d => d.status === 'failed')
  const processing = downloads.filter(d => d.status === 'processing')

  const totalSpeed = running.reduce((s, d) => s + (d.speed || 0), 0)
  const maxSpeed = 10485760 // 10 MB/s for gauge reference

  const sorted = [...downloads].sort((a, b) => {
    if (sortBy === 'progress') return (b.progress || 0) - (a.progress || 0)
    if (sortBy === 'speed') return (b.speed || 0) - (a.speed || 0)
    return (b.added || 0) - (a.added || 0)
  })

  return (
    <div className="p-6 bg-surface-deep">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2"><DownloadIcon size={18} /> DOWNLOADS <span className="text-content-tertiary text-sm">({downloads.length})</span></h2>
        <div className="flex items-center gap-2">
          {/* Speed Gauge */}
          {running.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-electric-blue/10 border border-electric-blue/20 mr-2">
              <Gauge size={12} className="text-electric-blue" />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-electric-blue font-medium">{formatSpeed(totalSpeed)}</span>
                  <span className="text-[9px] font-body text-content-tertiary">({running.length} active)</span>
                </div>
                <div className="w-24 h-1 bg-surface-sunken rounded-full mt-0.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-electric-blue to-hot-pink rounded-full transition-all duration-500" style={{ width: `${Math.min((totalSpeed / maxSpeed) * 100, 100)}%` }} />
                </div>
              </div>
            </div>
          )}
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
            <button onClick={handleRetry} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-warning/20 border border-warning/30 text-warning text-[10px] font-body hover:bg-warning/30 transition-all">
              <RefreshCw size={12} /> Retry All ({failed.length})
            </button>
          )}
        </div>
      </div>

      {running.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-electric-blue mb-2 uppercase flex items-center gap-1">
            <DownloadIcon size={10} /> Active ({running.length})
          </h3>
          <div className="space-y-1">
            {running.map(d => (
              <div key={d.download_id} className="bg-surface-raised/50 border border-electric-blue/10 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-body text-content-primary flex-1 truncate">{d.title || d.filename || d.url}</span>
                  <div className="flex items-center gap-3">
                    {d.speed ? <span className="text-[10px] font-mono text-electric-blue/60">{formatSpeed(d.speed)}</span> : null}
                    <span className="text-[10px] font-mono text-electric-blue/60">{d.progress}%</span>
                  </div>
                </div>
                <div className="w-full bg-surface-sunken rounded-full h-1.5 mb-1.5">
                  <div className="bg-gradient-to-r from-electric-blue to-hot-pink h-1.5 rounded-full transition-all duration-500 shadow-glow-blue-sm" style={{ width: `${d.progress || 0}%` }} />
                </div>
                <div className="flex items-center justify-between text-[9px] font-body text-content-tertiary">
                  <span>{d.downloaded_bytes ? formatSize(d.downloaded_bytes) : ''}{d.total_bytes ? ` / ${formatSize(d.total_bytes)}` : ''}</span>
                  <div className="flex items-center gap-3">
                    {d.eta ? <span>⏱ {formatEta(d.eta)}</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {processing.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-warning mb-2 uppercase flex items-center gap-1.5"><Clock size={12} /> Processing ({processing.length})</h3>
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
        <div className="mb-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-error mb-2 uppercase flex items-center gap-1.5"><XCircle size={12} /> Failed ({failed.length})</h3>
          <div className="space-y-1">
            {failed.map(d => (
              <div key={d.download_id} className="flex items-center gap-2 text-xs p-3 rounded-md bg-error/5 border border-error/10">
                <XCircle size={12} className="text-error/60 shrink-0" />
                <span className="flex-1 truncate font-body text-content-primary">{d.title || d.filename || d.url}</span>
                <span className="text-[10px] font-body text-error/60 max-w-[200px] truncate" title={d.error || ''}>{d.error || 'Unknown error'}</span>
                <button onClick={() => handleRetrySingle(d.url)} className="px-2 py-1 text-[10px] font-body bg-warning/20 border border-warning/30 rounded-md text-warning hover:bg-warning/30 transition-all">Retry</button>
                <button onClick={() => handleDelete(d.download_id)} className="text-error/40 hover:text-error transition-all"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h3 className="text-[10px] font-display tracking-[2px] text-success mb-2 uppercase flex items-center gap-1.5"><CheckCircle size={12} /> Completed ({completed.length})</h3>
          <div className="space-y-1">
            {sorted.filter(d => d.status === 'completed').slice(0, 30).map(d => (
              <div key={d.download_id} className="flex items-center gap-2 text-xs p-3 rounded-md bg-surface-raised/30 border border-border-default/20 hover:bg-surface-raised/50 transition-all">
                <CheckCircle size={12} className="text-success/60 shrink-0" />
                <span className="flex-1 truncate font-body text-content-primary">{d.title || d.filename}</span>
                {d.filepath && <span className="text-[9px] font-mono text-content-tertiary truncate max-w-[200px]">{d.filepath.split('/').pop()}</span>}
                {d.total_bytes ? <span className="text-[10px] font-body text-content-tertiary">{formatSize(d.total_bytes)}</span> : null}
                <button onClick={() => handleDelete(d.download_id)} className="text-error/40 hover:text-error transition-all"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {downloads.length === 0 && (
        <div className="flex flex-col items-center gap-3 mt-16 text-content-tertiary">
          <DownloadIcon size={32} />
          <p className="text-xs font-body">No downloads yet. Start one from Uploads.</p>
        </div>
      )}
    </div>
  )
}
