import { useState, useEffect, useMemo } from 'react'
import { fetchLyrics, ensureCsrfToken } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Music, FileText, CheckCircle, XCircle, Loader2, RefreshCw, Search, SkipForward, AlertTriangle } from 'lucide-react'

interface LyricsFile {
  name: string
  title: string
  artist: string
  has_lyrics: boolean
  size: number
}

export default function AdminLyrics() {
  const [files, setFiles] = useState<LyricsFile[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [fetchSingle, setFetchSingle] = useState<string | null>(null)
  const [result, setResult] = useState<{ fetched: number; skipped: number; errors: number; files: { filename: string; status: string }[] } | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'missing' | 'all'>('missing')

  useEffect(() => {
    ensureCsrfToken().then(loadFiles)
  }, [])

  const loadFiles = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/lyrics-status', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setFiles(data.files || [])
      }
    } catch {}
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let list = files
    if (tab === 'missing') list = list.filter(f => !f.has_lyrics)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        f.artist.toLowerCase().includes(q)
      )
    }
    return list
  }, [files, tab, search])

  const withLyrics = files.filter(f => f.has_lyrics).length
  const withoutLyrics = files.filter(f => !f.has_lyrics).length

  const handleFetchAll = async () => {
    setFetching(true)
    setResult(null)
    try {
      const res = await fetchLyrics(undefined, 'all')
      setResult(res)
      loadFiles()
    } catch { setResult({ fetched: 0, skipped: 0, errors: 0, files: [] }) }
    setFetching(false)
  }

  const handleFetchForce = async () => {
    setFetching(true)
    setResult(null)
    try {
      const res = await fetchLyrics(undefined, 'force')
      setResult(res)
      loadFiles()
    } catch { setResult({ fetched: 0, skipped: 0, errors: 0, files: [] }) }
    setFetching(false)
  }

  const handleFetchSingle = async (fn: string) => {
    setFetchSingle(fn)
    try {
      const res = await fetchLyrics(fn, 'force')
      if (res.fetched > 0) showToast(`Lyrics fetched for ${fn}`, 'success')
      else showToast(`No lyrics found for ${fn}`, 'info')
      loadFiles()
    } catch { showToast(`Failed to fetch lyrics for ${fn}`, 'error') }
    setFetchSingle(null)
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case 'ok': return <span className="text-success">Fetched</span>
      case 'not_found': return <span className="text-content-tertiary">Not found</span>
      case 'error': return <span className="text-error">Error</span>
      default: return s
    }
  }

  return (
    <div className="p-6" style={{ background: '#0A0A2E' }}>
      <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple mb-5 flex items-center gap-2"><FileText size={18} /> LYRICS MANAGER</h2>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mb-5">
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4 xl:col-span-3">
          <p className="text-[10px] font-body text-content-tertiary mb-3">
            Fetch lyrics from <strong className="text-electric-blue">LRCLIB</strong> for your audio files.
            Files with existing lyrics sidecar (<code className="text-hot-pink">.lrc</code>) are skipped unless you force re-fetch.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleFetchAll} disabled={fetching || withoutLyrics === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-hot-pink to-purple text-white text-[11px] font-body uppercase tracking-[1px] hover:brightness-110 transition-all disabled:opacity-35 shadow-glow-pink-sm">
              {fetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Fetch Missing ({withoutLyrics})
            </button>
            <button onClick={handleFetchForce} disabled={fetching}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default text-content-secondary text-[11px] font-body hover:border-hot-pink/40 transition-all disabled:opacity-35">
              <RefreshCw size={13} />
              Force Re-fetch All
            </button>
            <button onClick={loadFiles} disabled={loading}
              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-body text-content-tertiary hover:text-white transition-all">
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4 flex flex-col justify-center">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-display text-white">{files.length}</p>
              <p className="text-[9px] font-body text-content-tertiary uppercase">Total</p>
            </div>
            <div>
              <p className="text-lg font-display text-success">{withLyrics}</p>
              <p className="text-[9px] font-body text-content-tertiary uppercase">With</p>
            </div>
            <div>
              <p className="text-lg font-display text-hot-pink">{withoutLyrics}</p>
              <p className="text-[9px] font-body text-content-tertiary uppercase">Missing</p>
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="p-4 rounded-lg bg-surface-raised border border-border-default/50 mb-4 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-success"><CheckCircle size={16} /> {result.fetched} fetched</span>
          <span className="text-content-tertiary">|</span>
          <span className="flex items-center gap-1.5 text-content-tertiary">{result.skipped} skipped</span>
          {result.errors > 0 && (
            <>
              <span className="text-content-tertiary">|</span>
              <span className="flex items-center gap-1.5 text-error"><XCircle size={16} /> {result.errors} errors</span>
            </>
          )}
          {result.files.length > 0 && (
            <>
              <span className="text-content-tertiary">|</span>
              <button onClick={() => setResult(null)} className="text-content-tertiary hover:text-white transition-all text-[10px]">Dismiss</button>
            </>
          )}
        </div>
      )}

      {result && result.files.length > 0 && (
        <div className="bg-surface-sunken border border-border-default/30 rounded-lg mb-4 p-3 max-h-32 overflow-y-auto">
          <p className="text-[9px] font-body text-content-tertiary uppercase tracking-[1px] mb-1">Details</p>
          <div className="space-y-0.5">
            {result.files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] font-body">
                <span className="text-content-tertiary truncate flex-1">{f.filename}</span>
                <span>{statusLabel(f.status)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <Music size={14} className="text-hot-pink" />
          <div className="flex gap-1">
            {(['missing', 'all'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-body tracking-[0.5px] transition-all uppercase ${
                  tab === t ? 'bg-gradient-to-r from-hot-pink/20 to-purple/20 text-white border border-hot-pink/30 shadow-glow-pink-sm' : 'text-content-tertiary hover:text-white border border-transparent'
                }`}>
                {t === 'missing' ? `Missing (${withoutLyrics})` : `All (${files.length})`}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-36 pl-6 pr-2 py-1.5 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink transition-all" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-content-tertiary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-content-tertiary">
            {tab === 'missing' ? <CheckCircle size={28} className="text-success/60" /> : <Music size={28} />}
            <p className="text-xs font-body">{tab === 'missing' ? 'All files have lyrics! 🎉' : search ? 'No files match search.' : 'No audio files found.'}</p>
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto space-y-0.5">
            {filtered.map(f => {
              const isFetching = fetchSingle === f.name
              return (
                <div key={f.name}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-border-default/20 last:border-0 hover:bg-white/[0.02] transition-colors ${
                    isFetching ? 'bg-electric-blue/5' : ''
                  }`}>
                  <div className="w-8 h-8 rounded-md bg-gradient-to-br from-hot-pink/10 to-purple/10 flex items-center justify-center overflow-hidden shrink-0 border border-border-default/30">
                    {f.has_lyrics ? (
                      <FileText size={14} className="text-success/80" />
                    ) : (
                      <Music size={14} className="text-content-tertiary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-body text-content-primary truncate">{f.title || f.name}</p>
                    {f.artist && <p className="text-[10px] font-body text-content-tertiary truncate">{f.artist}</p>}
                  </div>
                  <span className={`text-[10px] font-mono ${f.has_lyrics ? 'text-success/80' : 'text-hot-pink/60'}`}>
                    {f.has_lyrics ? '✓ Lyrics' : 'Missing'}
                  </span>
                  <span className="text-[10px] font-mono text-content-tertiary/50 hidden sm:block">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  {!f.has_lyrics && (
                    <button onClick={() => handleFetchSingle(f.name)} disabled={isFetching}
                      className="px-2 py-1 rounded-md bg-electric-blue/20 border border-electric-blue/30 text-electric-blue text-[9px] font-body hover:bg-electric-blue/30 disabled:opacity-35 transition-all shrink-0 flex items-center gap-1">
                      {isFetching ? <Loader2 size={10} className="animate-spin" /> : <SkipForward size={10} />}
                      {isFetching ? 'Fetching...' : 'Fetch'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
