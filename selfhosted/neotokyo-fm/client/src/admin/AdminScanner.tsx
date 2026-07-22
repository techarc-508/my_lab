import { useState, useEffect } from 'react'
import { scanMetadata, searchAlbumArt, applyAlbumArt, updateFileTags, listFiles, getMetadata, findCover } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Search, Image, Check, X, Loader2, RefreshCw, Music, Globe } from 'lucide-react'
import type { AlbumArtResult } from '../types/audio'

interface ScanResult {
  name: string; title: string; artist: string; album: string
  hasCover: boolean; candidates: AlbumArtResult[]; searching: boolean; expanded: boolean
}

interface CoverJob {
  name: string; title: string; artist: string
  status: 'waiting' | 'searching' | 'applying' | 'done' | 'failed'
  source?: string; coverUrl?: string; error?: string
}

export default function AdminScanner() {
  const [files, setFiles] = useState<ScanResult[]>([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [selectedArt, setSelectedArt] = useState<Record<string, string>>({})
  const [coverJobs, setCoverJobs] = useState<CoverJob[]>([])
  const [coverRunning, setCoverRunning] = useState(false)
  const [coverDone, setCoverDone] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanStatus, setScanStatus] = useState('')

  useEffect(() => { loadFiles() }, [])

  // Poll scanner status during scan
  useEffect(() => {
    if (!scanning) return
    const poll = setInterval(async () => {
      try {
        const r = await fetch('/api/scanner-status')
        const d = await r.json()
        setScanProgress(d.progress || 0)
        setScanStatus(d.status || '')
        if (d.done) { setScanning(false); setScanProgress(0); setScanStatus(''); showToast(d.message || 'Scan complete', 'success'); await loadFiles() }
      } catch {}
    }, 600)
    return () => clearInterval(poll)
  }, [scanning])

  const handleScan = async () => {
    setScanning(true)
    setScanProgress(0)
    setScanStatus('Starting...')
    try {
      const res = await scanMetadata()
      if (!res.running) {
        setScanning(false)
        showToast(res.scanned ? `Scanned ${res.scanned} files` : 'No new files to scan', 'success')
      }
    } catch { setScanning(false); showToast('Scan failed', 'error') }
  }

  const loadFiles = async () => {
    setLoading(true)
    try {
      const data = await listFiles(0, 0)
      const withMeta = await Promise.all(
        data.files.map(async (f: any) => {
          let meta = { title: '', artist: '', album: '', hasCover: false }
          try { const m = await getMetadata(f.name); meta = { title: m.title || '', artist: m.artist || '', album: m.album || '', hasCover: m.has_cover } } catch {}
          return { name: f.name, title: meta.title, artist: meta.artist, album: meta.album, hasCover: meta.hasCover, candidates: [], searching: false, expanded: false }
        })
      )
      setFiles(withMeta)
    } catch { showToast('Failed to load', 'error') }
    setLoading(false)
  }

  const toggleExpand = (idx: number) => {
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, expanded: !f.expanded } : f))
    if (!files[idx].candidates.length && !files[idx].searching) searchArt(idx)
  }

  const searchArt = async (idx: number) => {
    const f = files[idx]
    if (!f.title) { showToast('No title to search', 'error'); return }
    setFiles(prev => prev.map((ff, i) => i === idx ? { ...ff, searching: true } : ff))
    try {
      const res = await findCover(f.name, f.title, f.artist)
      if (res.cover_url) {
        const candidates = [{ title: res.title || f.title, artist: res.artist || f.artist, album: '', artwork: res.cover_url, genre: '', release_date: '' }]
        setFiles(prev => prev.map((ff, i) => i === idx ? { ...ff, candidates, searching: false } : ff))
        setSelectedArt(prev => ({ ...prev, [f.name]: res.cover_url }))
      } else {
        const fb = await searchAlbumArt(f.title, f.artist)
        setFiles(prev => prev.map((ff, i) => i === idx ? { ...ff, candidates: fb.results || [], searching: false } : ff))
      }
    } catch {
      try { const fb = await searchAlbumArt(f.title, f.artist); setFiles(prev => prev.map((ff, i) => i === idx ? { ...ff, candidates: fb.results || [], searching: false } : ff)) }
      catch { setFiles(prev => prev.map((ff, i) => i === idx ? { ...ff, searching: false } : ff)) }
    }
  }

  const handleApplyArt = async (name: string, artwork: string) => {
    try { await applyAlbumArt(name, artwork); showToast('Album art applied', 'success'); setFiles(prev => prev.map(f => f.name === name ? { ...f, hasCover: true } : f)) }
    catch { showToast('Failed to apply', 'error') }
  }

  const handleUpdateMeta = async (name: string, title: string, artist: string, album: string) => {
    try { await updateFileTags(name, { title, artist, album, genre: '' }); showToast('Metadata updated', 'success') }
    catch { showToast('Update failed', 'error') }
  }

  const handleFixAllMissing = async () => {
    const missing = files.filter(f => !f.hasCover)
    if (missing.length === 0) { showToast('No files need covers', 'info'); return }
    const jobs: CoverJob[] = missing.map(f => ({ name: f.name, title: f.title, artist: f.artist, status: 'waiting' }))
    setCoverJobs(jobs)
    setCoverRunning(true)
    setCoverDone(false)
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]
      setCoverJobs(prev => prev.map((j, ji) => ji === i ? { ...j, status: 'searching' } : j))
      try {
        const res = await findCover(job.name, job.title, job.artist)
        if (res.cover_url) {
          setCoverJobs(prev => prev.map((j, ji) => ji === i ? { ...j, status: 'applying', source: res.source, coverUrl: res.cover_url } : j))
          try { await applyAlbumArt(job.name, res.cover_url); setCoverJobs(prev => prev.map((j, ji) => ji === i ? { ...j, status: 'done' } : j)) }
          catch { setCoverJobs(prev => prev.map((j, ji) => ji === i ? { ...j, status: 'failed', error: 'Apply failed' } : j)) }
        } else {
          const sres = await searchAlbumArt(job.title, job.artist)
          if (sres.results && sres.results.length > 0) {
            setCoverJobs(prev => prev.map((j, ji) => ji === i ? { ...j, status: 'applying', source: 'itunes', coverUrl: sres.results[0].artwork } : j))
            try { await applyAlbumArt(job.name, sres.results[0].artwork); setCoverJobs(prev => prev.map((j, ji) => ji === i ? { ...j, status: 'done' } : j)) }
            catch { setCoverJobs(prev => prev.map((j, ji) => ji === i ? { ...j, status: 'failed', error: 'Apply failed' } : j)) }
          } else { setCoverJobs(prev => prev.map((j, ji) => ji === i ? { ...j, status: 'failed', error: 'No source found' } : j)) }
        }
      } catch { setCoverJobs(prev => prev.map((j, ji) => ji === i ? { ...j, status: 'failed', error: 'Search error' } : j)) }
    }
    setCoverRunning(false)
    setCoverDone(true)
    const ok = jobs.filter(j => j.status === 'done').length
    showToast(`Fixed ${ok}/${jobs.length} covers`, ok === jobs.length ? 'success' : 'info')
    await loadFiles()
  }

  const closeOverlay = () => { setCoverJobs([]); setCoverDone(false) }
  const missingCover = files.filter(f => !f.hasCover).length
  const needsMeta = files.filter(f => !f.title).length
  const coverTotal = coverJobs.length
  const coverCompleted = coverJobs.filter(j => j.status === 'done' || j.status === 'failed').length
  const coverProgress = coverTotal > 0 ? Math.round((coverCompleted / coverTotal) * 100) : 0
  const sourceLabel: Record<string, string> = { source_url: 'Source URL', itunes: 'iTunes', youtube: 'YouTube' }

  return (
    <div className="p-6 bg-surface-deep">
      <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple mb-5 flex items-center gap-2"><Image size={18} /> ALBUM ART SCANNER</h2>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-5">
          <h3 className="text-[10px] font-display tracking-[2px] text-hot-pink uppercase mb-2 flex items-center gap-1.5"><Search size={12} /> Scan Metadata</h3>
          <p className="text-[11px] font-body text-content-tertiary mb-3">Scan audio files to create sidecar metadata.</p>
          <div className="flex items-center gap-3">
            <button onClick={handleScan} disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white text-[11px] font-body tracking-[1px] uppercase hover:brightness-110 active:brightness-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-glow-pink-sm">
              {scanning ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              {scanning ? 'Scanning...' : 'Scan New Files'}
            </button>
            {/* Progress bar for scan */}
            {scanning && (
              <div className="flex-1 space-y-1">
                <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-hot-pink to-purple rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }} />
                </div>
                {scanStatus && <p className="text-[9px] font-body text-content-tertiary truncate">{scanStatus}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-5">
          <h3 className="text-[10px] font-display tracking-[2px] text-purple uppercase mb-2 flex items-center gap-1.5"><Image size={12} /> Album Art</h3>
          <p className="text-[11px] font-body text-content-tertiary mb-3">{missingCover > 0 ? `${missingCover} file(s) missing covers.` : 'All files have covers.'}</p>
          <button onClick={handleFixAllMissing} disabled={missingCover === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-electric-blue/20 border border-electric-blue/30 text-electric-blue text-[11px] font-body tracking-[1px] uppercase hover:bg-electric-blue/30 disabled:opacity-35 disabled:cursor-not-allowed transition-all">
            <Image size={13} /> Fix All Covers {missingCover > 0 ? `(${missingCover})` : ''}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-xs font-display tracking-[2px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-1.5"><Music size={13} /> FILES</h3>
        <div className="flex gap-2 text-[10px] font-body">
          <span className="text-content-tertiary">Total: <span className="text-white">{files.length}</span></span>
          {needsMeta > 0 && <span className="text-warning/80">No meta: {needsMeta}</span>}
          {missingCover > 0 && <span className="text-hot-pink/80">No cover: {missingCover}</span>}
        </div>
        <button onClick={loadFiles} disabled={loading} className="ml-auto text-[10px] font-body text-content-tertiary hover:text-white transition-all flex items-center gap-1">
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-content-tertiary" /></div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center gap-3 mt-12 text-content-tertiary"><Music size={28} /><p className="text-xs font-body">No songs loaded. Scan new files to find songs missing metadata.</p></div>
      ) : (
        <div className="space-y-2 max-h-[70vh] overflow-y-auto">
          {files.map((f, idx) => (
            <div key={f.name} className="bg-surface-raised/50 border border-border-default/20 rounded-lg hover:border-hot-pink/20 transition-all overflow-hidden">
              <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => toggleExpand(idx)}>
                <div className="w-10 h-10 rounded-md bg-gradient-to-br from-hot-pink/10 to-purple/10 flex items-center justify-center overflow-hidden shrink-0 border border-border-default/30">
                  {f.hasCover ? <img src={`/api/cover/${encodeURIComponent(f.name)}`} className="w-full h-full object-cover" /> : <Music size={15} className="text-hot-pink/40" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-body text-content-primary truncate">{f.title || f.name}</p>
                  <p className="text-[10px] font-body text-content-tertiary truncate">{f.artist || f.album ? `${f.artist}${f.album ? ` — ${f.album}` : ''}` : 'No metadata'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!f.hasCover && <span className="text-[9px] font-body text-hot-pink/60 px-1.5 py-0.5 rounded bg-hot-pink/10">No cover</span>}
                  {!f.title && <span className="text-[9px] font-body text-warning/60 px-1.5 py-0.5 rounded bg-warning/10">No title</span>}
                  {f.title && f.artist && <span className="text-[9px] font-body text-success/60">✓</span>}
                </div>
              </div>
              {f.expanded && (
                <div className="px-3 pb-3 border-t border-border-default/20 pt-2">
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <input value={f.title} onChange={e => setFiles(prev => prev.map((ff, i) => i === idx ? { ...ff, title: e.target.value } : ff))} placeholder="Title"
                      className="px-2 py-1.5 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink transition-all" />
                    <input value={f.artist} onChange={e => setFiles(prev => prev.map((ff, i) => i === idx ? { ...ff, artist: e.target.value } : ff))} placeholder="Artist"
                      className="px-2 py-1.5 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink transition-all" />
                    <input value={f.album} onChange={e => setFiles(prev => prev.map((ff, i) => i === idx ? { ...ff, album: e.target.value } : ff))} placeholder="Album"
                      className="px-2 py-1.5 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink transition-all" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => handleUpdateMeta(f.name, f.title, f.artist, f.album)}
                      className="px-2.5 py-1.5 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white text-[10px] font-body tracking-[0.5px] uppercase hover:brightness-110 active:brightness-90 transition-all flex items-center gap-1 shadow-glow-pink-sm">
                      <Check size={10} /> Save
                    </button>
                    {!f.hasCover && (
                      <button onClick={() => searchArt(idx)} disabled={f.searching}
                        className="px-2.5 py-1.5 rounded-md bg-purple/20 border border-purple/30 text-purple text-[10px] font-body hover:bg-purple/30 disabled:opacity-35 transition-all flex items-center gap-1">
                        <Image size={10} /> {f.searching ? 'Searching...' : 'Find Cover'}
                      </button>
                    )}
                  </div>
                  {f.searching && <div className="flex items-center gap-2 text-[10px] font-body text-content-tertiary py-2"><Loader2 size={11} className="animate-spin" /> Searching source URL / iTunes / YouTube...</div>}
                  {f.candidates.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-body text-content-tertiary">Candidates:</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {f.candidates.map((c, ci) => (
                          <div key={ci} onClick={() => setSelectedArt(prev => ({ ...prev, [f.name]: c.artwork }))}
                            className={`shrink-0 w-24 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${selectedArt[f.name] === c.artwork ? 'border-hot-pink shadow-glow-pink-sm' : 'border-transparent hover:border-purple/50'}`}>
                            <img src={c.artwork} className="w-24 h-24 object-cover" />
                            <div className="p-1 bg-surface-sunken">
                              <p className="text-[8px] font-body truncate text-content-primary">{c.title}</p>
                              <p className="text-[7px] font-body text-content-tertiary truncate">{c.artist}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {selectedArt[f.name] && (
                        <button onClick={() => handleApplyArt(f.name, selectedArt[f.name])}
                          className="px-2.5 py-1.5 rounded-md bg-success/20 border border-success/30 text-success text-[10px] font-body hover:bg-success/30 transition-all flex items-center gap-1">
                          <Check size={10} /> Apply Selected
                        </button>
                      )}
                    </div>
                  )}
                  {!f.searching && f.expanded && f.candidates.length === 0 && f.title && (
                    <p className="text-[10px] font-body text-content-tertiary">No cover found — tried source URL, iTunes, and YouTube.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {coverJobs.length > 0 && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-raised border border-border-default/50 rounded-lg w-full max-w-xl max-h-[80vh] flex flex-col shadow-glow-combo">
            <div className="p-5 border-b border-border-default/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display tracking-[2px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2"><Image size={14} /> FIX COVERS</h3>
                <span className="text-[10px] font-body text-content-tertiary">{coverCompleted}/{coverTotal}</span>
              </div>
              <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-hot-pink to-purple rounded-full transition-all duration-300 shadow-glow-pink-sm" style={{ width: `${coverProgress}%` }} />
              </div>
              <p className="text-[9px] font-body text-content-tertiary mt-1">{coverRunning ? 'Processing...' : coverDone ? 'Complete' : ''}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {coverJobs.map((job, i) => (
                <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-md text-xs transition-colors ${
                  job.status === 'done' ? 'bg-success/5 border border-success/10' :
                  job.status === 'failed' ? 'bg-error/5 border border-error/10' :
                  job.status === 'searching' || job.status === 'applying' ? 'bg-electric-blue/5 border border-electric-blue/10' : 'border border-transparent'
                }`}>
                  {job.status === 'waiting' && <div className="w-3.5 h-3.5 rounded-full border-2 border-content-tertiary/50" />}
                  {job.status === 'searching' && <Loader2 size={14} className="animate-spin text-electric-blue shrink-0" />}
                  {job.status === 'applying' && <Loader2 size={14} className="animate-spin text-warning shrink-0" />}
                  {job.status === 'done' && <Check size={14} className="text-success shrink-0" />}
                  {job.status === 'failed' && <X size={14} className="text-error shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-body text-content-primary truncate">{job.title || job.name}</p>
                    <div className="flex items-center gap-2 text-[9px] font-body text-content-tertiary">
                      {job.status === 'searching' && <span>Searching...</span>}
                      {job.status === 'applying' && <span>Applying cover...</span>}
                      {job.status === 'done' && job.source && <span className="flex items-center gap-1 text-success/60"><Globe size={9} /> {sourceLabel[job.source] || job.source}</span>}
                      {job.status === 'failed' && <span className="text-error/60">{job.error || 'Failed'}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {coverDone && <div className="p-3 border-t border-border-default/30 flex justify-end"><button onClick={closeOverlay} className="px-4 py-2 rounded-md bg-electric-blue/20 border border-electric-blue/30 text-electric-blue text-[10px] font-body tracking-[0.5px] uppercase hover:bg-electric-blue/30 transition-all">Close</button></div>}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan-progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
        .animate-scan-progress { width: 40%; animation: scan-progress 1.5s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
