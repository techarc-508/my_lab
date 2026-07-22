import { useState, useEffect, useMemo, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { getHealth, getAdminStats, getSystemInfo, getBatchHistory, listDownloads, getTopPlays, getTopArtists, getRecentPlays, getRecentVisits, getLibraryBreakdown } from '../services/grabberAPI'
import { CardSkeleton } from '../components/ui/Skeleton'
import { AnimatedStat, Sparkline, Donut, MiniBar } from '../components/ui/AdminCharts'
import { BarChart3, Download, Music, Radio, HardDrive, Clock, Activity, Headphones, User, History, Globe, Shield, CalendarClock } from 'lucide-react'
import type { HealthResponse, SystemInfo, BatchRecord, Download as DownloadRecord } from '../types/audio'

const GENRE_COLORS = ['#FF006E', '#3A86FF', '#00D4AA', '#FFBE0B', '#8338EC', '#FB5607', '#FF006E', '#3A86FF', '#00D4AA', '#FFBE0B']
const FORMAT_COLORS: Record<string, string> = { '.mp3': '#3A86FF', '.flac': '#FF006E', '.m4a': '#00D4AA', '.ogg': '#FFBE0B', '.wav': '#8338EC', '.opus': '#FB5607', '.webm': '#FF006E' }

export default function AdminDashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [stats, setStats] = useState<{ total_files: number; total_size: number } | null>(null)
  const [sys, setSys] = useState<SystemInfo | null>(null)
  const [history, setHistory] = useState<BatchRecord[]>([])
  const [downloads, setDownloads] = useState<DownloadRecord[]>([])
  const [topPlays, setTopPlays] = useState<{ title: string; artist: string; count: number }[]>([])
  const [topArtists, setTopArtists] = useState<{ artist: string; count: number }[]>([])
  const [recentPlays, setRecentPlays] = useState<{ title: string; artist: string; played_at: string }[]>([])
  const [visits, setVisits] = useState<{ ip: string; username: string; path: string; visited_at: string }[]>([])
  const [bd, setBd] = useState<{ total_files: number; genres: { name: string; count: number }[]; formats: { ext: string; count: number }[]; with_lyrics: number } | null>(null)
  const [scheduled, setScheduled] = useState<{ created_at?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'plays' | 'artists' | 'recent' | 'visits'>('plays')

  const load = () => {
    const isFirst = loading
    Promise.all([
      getHealth().then(setHealth).catch(() => {}),
      getAdminStats().then(setStats).catch(() => {}),
      getSystemInfo().then(setSys).catch(() => {}),
      getBatchHistory().then(setHistory).catch(() => {}),
      listDownloads().then(d => setDownloads(d.filter((x: DownloadRecord) => x.status === 'running' || x.status === 'pending'))).catch(() => {}),
      getTopPlays(10).then(setTopPlays).catch(() => {}),
      getTopArtists(10).then(setTopArtists).catch(() => {}),
      getRecentPlays(15).then(setRecentPlays).catch(() => {}),
      getRecentVisits(10).then(setVisits).catch(() => {}),
      getLibraryBreakdown().then(setBd).catch(() => {}),
      fetch('/api/stats/scheduled-backups', { credentials: 'include' }).then(r => r.ok && r.json()).then(d => setScheduled(d || [])).catch(() => {}),
    ]).finally(() => { if (isFirst) setLoading(false) })
  }

  useEffect(() => {
    if (document.visibilityState === 'visible') load()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 10000)
    return () => clearInterval(id)
  }, [])

  const running = downloads.filter(d => d.status === 'running' || d.status === 'pending')

  const playsSparkline = useMemo(() => {
    if (recentPlays.length < 2) return []
    const now = Date.now()
    const buckets = Array.from({ length: 24 }, (_, i) => {
      const start = now - (23 - i) * 3600000
      const end = start + 3600000
      return recentPlays.filter(p => {
        const t = new Date(p.played_at + 'Z').getTime()
        return t >= start && t < end
      }).length
    })
    return buckets
  }, [recentPlays])

  const tileIconColor = (label: string) => {
    switch (label) {
      case 'Files': return 'text-hot-pink'
      case 'Size': return 'text-electric-blue'
      case 'Batches': return 'text-success'
      case 'Active DL': return running.length > 0 ? 'text-warning' : 'text-content-tertiary'
      case 'Uptime': return 'text-electric-blue'
      case 'FFmpeg': return health?.ffmpeg ? 'text-success' : 'text-error'
      default: return 'text-hot-pink'
    }
  }

  const nextBackup = useMemo(() => {
    if (scheduled.length === 0) return null
    const sorted = [...scheduled].filter(s => s.created_at).sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
    if (sorted.length === 0) return null
    const nextTime = new Date(sorted[0].created_at!).getTime() + 86400000
    const remaining = nextTime - Date.now()
    if (remaining <= 0) return 'Soon'
    const h = Math.floor(remaining / 3600000)
    const m = Math.floor((remaining % 3600000) / 60000)
    return `${h}h ${m}m`
  }, [scheduled])

  if (loading) return <div className="p-6 space-y-4"><CardSkeleton h="h-32" /><CardSkeleton h="h-48" /></div>

  const tiles = [
    { label: 'Files', value: stats?.total_files ?? 0, icon: Music, isNum: true, suffix: '' },
    { label: 'Size', value: stats?.total_size ?? 0, icon: Download, isNum: true, suffix: 'bytes', raw: stats?.total_size },
    { label: 'Batches', value: history.length, icon: BarChart3, isNum: true, suffix: '' },
    { label: 'Active DL', value: running.length, icon: Activity, isNum: true, suffix: '' },
    { label: 'Uptime', value: sys?.uptime ?? '—', icon: Clock, isNum: false, suffix: '' },
    { label: 'FFmpeg', value: health?.ffmpeg ? '✓' : '✗', icon: Radio, isNum: false, suffix: '' },
  ]

  return (
    <div className="p-6 space-y-4 bg-surface-deep">
      <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2"><BarChart3 size={18} /> DASHBOARD</h2>

      {/* Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {tiles.map(t => (
          <div key={t.label} className="bg-surface-raised border border-border-default/30 rounded-lg p-4 hover:border-hot-pink/30 transition-colors group">
            <div className="flex items-center gap-2 mb-1.5">
              <t.icon size={14} className={tileIconColor(t.label)} />
              <span className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px]">{t.label}</span>
            </div>
            <p className="text-lg font-display tracking-[1px] text-white">
              {t.label === 'Size' && t.raw ? (
                <SizeStat bytes={t.raw} />
              ) : t.isNum && typeof t.value === 'number' ? (
                <AnimatedStat value={t.value} />
              ) : (
                String(t.value)
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Genre Donut */}
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-hot-pink uppercase mb-3 flex items-center gap-1.5"><Music size={12} /> GENRES</h3>
          {bd && bd.genres.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center">
                <Donut percent={100} size={56} strokeWidth={5} color="#FF006E" />
                <span className="text-[9px] font-body text-content-tertiary mt-1">{bd.genres.reduce((s, g) => s + g.count, 0)} songs</span>
              </div>
              <div className="flex-1 space-y-1 max-h-28 overflow-y-auto">
                {bd.genres.slice(0, 8).map((g, i) => (
                  <div key={g.name} className="flex items-center gap-2 text-[10px] font-body">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: GENRE_COLORS[i % GENRE_COLORS.length] }} />
                    <span className="flex-1 truncate text-content-secondary">{g.name}</span>
                    <span className="text-content-tertiary font-mono">{g.count}</span>
                  </div>
                ))}
                {bd.genres.length > 8 && <span className="text-[9px] font-body text-content-tertiary">+{bd.genres.length - 8} more</span>}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-3 text-content-tertiary">
              <Music size={20} className="opacity-40 mb-1" />
              <p className="text-[10px] font-body">No genre tags found</p>
              <NavLink to="/admin/scanner" className="text-[9px] text-electric-blue hover:text-white mt-1 transition-colors">Run Album Art scanner →</NavLink>
            </div>
          )}
        </div>

        {/* Lyrics Coverage */}
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-purple uppercase mb-3 flex items-center gap-1.5"><Shield size={12} /> LYRICS</h3>
          {bd ? (
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center">
                <Donut percent={bd.total_files > 0 ? (bd.with_lyrics / bd.total_files) * 100 : 0} size={56} strokeWidth={5} color="#8338EC" />
                <span className="text-[9px] font-body text-content-tertiary mt-1">{bd.total_files > 0 ? Math.round((bd.with_lyrics / bd.total_files) * 100) : 0}%</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] font-body">
                  <span className="w-2 h-2 rounded-sm bg-purple shrink-0" />
                  <span className="text-content-secondary">With lyrics</span>
                  <span className="ml-auto text-white font-mono">{bd.with_lyrics}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-body">
                  <span className="w-2 h-2 rounded-sm bg-white/10 shrink-0" />
                  <span className="text-content-secondary">Missing</span>
                  <span className="ml-auto text-content-tertiary font-mono">{bd.total_files - bd.with_lyrics}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-body border-t border-border-default/20 pt-1.5">
                  <span className="text-content-tertiary">Total files</span>
                  <span className="ml-auto text-white font-mono">{bd.total_files}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-3 text-content-tertiary">
              <Shield size={20} className="opacity-40 mb-1" />
              <p className="text-[10px] font-body">Loading lyrics status...</p>
              <button onClick={load} className="text-[9px] text-electric-blue hover:text-white mt-1 transition-colors">Retry →</button>
            </div>
          )}
        </div>

        {/* Storage Breakdown */}
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-electric-blue uppercase mb-3 flex items-center gap-1.5"><HardDrive size={12} /> STORAGE</h3>
          {bd && bd.formats.length > 0 ? (
            <div className="space-y-2">
              <MiniBar items={bd.formats.map(f => ({ label: f.ext, value: f.count, color: FORMAT_COLORS[f.ext] || '#3A86FF' }))} />
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {bd.formats.map(f => (
                  <div key={f.ext} className="flex items-center gap-2 text-[10px] font-body">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: FORMAT_COLORS[f.ext] || '#3A86FF' }} />
                    <span className="flex-1 text-content-secondary uppercase font-mono text-[9px]">{f.ext.replace('.', '')}</span>
                    <span className="text-content-tertiary font-mono">{f.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-3 text-content-tertiary">
              <HardDrive size={20} className="opacity-40 mb-1" />
              <p className="text-[10px] font-body">No audio files found</p>
              <NavLink to="/admin/import" className="text-[9px] text-electric-blue hover:text-white mt-1 transition-colors">Import music →</NavLink>
            </div>
          )}
        </div>
      </div>

      {/* Disk + Sparkline Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sys && (
          <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
            <h3 className="text-[10px] font-display tracking-[2px] text-electric-blue uppercase mb-2 flex items-center gap-1.5"><HardDrive size={12} /> DISK</h3>
            <div className="w-full bg-surface-sunken rounded-full h-2 mb-2">
              <div className="bg-gradient-to-r from-hot-pink to-purple h-2 rounded-full transition-all shadow-glow-pink-sm" style={{ width: `${Math.min((sys.disk_used / sys.disk_total) * 100, 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] font-body text-content-tertiary">
              <span>{formatSize(sys.disk_used)} used</span>
              <span>{formatSize(sys.disk_free)} free</span>
              <span>{formatSize(sys.disk_total)} total</span>
            </div>
          </div>
        )}

        {/* Plays Sparkline */}
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-hot-pink uppercase mb-2 flex items-center gap-1.5"><Activity size={12} /> PLAYS (24h)</h3>
          <Sparkline data={playsSparkline} width={220} height={36} color="#FF006E" />
          <div className="flex justify-between text-[9px] font-body text-content-tertiary mt-1">
            <span>Peak: {Math.max(...playsSparkline, 0)}</span>
            <span>Total: {playsSparkline.reduce((s, v) => s + v, 0)}</span>
          </div>
        </div>
      </div>

      {/* Backup Countdown */}
      {nextBackup && (
        <div className="bg-surface-raised border border-electric-blue/20 rounded-lg p-3 flex items-center gap-3">
          <CalendarClock size={14} className="text-electric-blue shrink-0" />
          <span className="text-[11px] font-body text-content-secondary">Next auto-backup in <strong className="text-white font-mono">{nextBackup}</strong></span>
        </div>
      )}

      {/* Active Downloads */}
      {running.length > 0 && (
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-warning uppercase mb-2 flex items-center gap-1.5"><Activity size={12} /> ACTIVE DOWNLOADS</h3>
          <div className="space-y-1">
            {running.map(d => (
              <div key={d.download_id} className="flex items-center gap-2 text-[11px] font-body py-1.5 border-b border-border-default/20 last:border-0">
                <span className="flex-1 truncate text-content-primary">{d.filename || d.title}</span>
                {d.speed ? <span className="text-electric-blue/60 font-mono text-[10px]">{formatSpeed(d.speed)}</span> : null}
                <span className="text-warning/60">{d.progress}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Stats */}
      <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <Headphones size={14} className="text-hot-pink" />
          <h3 className="text-[10px] font-display tracking-[2px] uppercase text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-1.5"><Headphones size={12} /> USER STATS</h3>
          <div className="flex gap-1 ml-auto">
            {(['plays', 'artists', 'recent', 'visits'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-body tracking-[0.5px] transition-all ${
                  tab === t ? 'bg-gradient-to-r from-hot-pink/20 to-purple/20 text-white border border-hot-pink/30 shadow-glow-pink-sm' : 'text-content-tertiary hover:text-white border border-transparent'
                }`}>
                {t === 'plays' ? 'Top Songs' : t === 'artists' ? 'Top Artists' : t === 'recent' ? 'Recent' : 'Visits'}
              </button>
            ))}
          </div>
        </div>
        {tab === 'plays' && (
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {topPlays.filter(p => !p.title.toLowerCase().includes('test')).map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] font-body py-1.5 border-b border-border-default/20 last:border-0">
                <span className="text-content-tertiary w-5 font-mono text-[10px]">{i + 1}</span>
                <Music size={10} className="text-hot-pink/60 shrink-0" />
                <span className="flex-1 truncate text-content-primary">{p.title}</span>
                <span className="text-content-tertiary truncate max-w-[120px]">{p.artist}</span>
                <span className="text-electric-blue/60 font-mono text-[11px]">{p.count}</span>
              </div>
            ))}
            {topPlays.length === 0 && <p className="text-[11px] font-body text-content-tertiary py-2">No plays recorded yet.</p>}
          </div>
        )}
        {tab === 'artists' && (
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {topArtists.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] font-body py-1.5 border-b border-border-default/20 last:border-0">
                <span className="text-content-tertiary w-5 font-mono text-[10px]">{i + 1}</span>
                <User size={10} className="text-electric-blue/60 shrink-0" />
                <span className="flex-1 truncate text-content-primary">{a.artist || 'Unknown'}</span>
                <span className="text-hot-pink/60 font-mono text-[11px]">{a.count}</span>
              </div>
            ))}
            {topArtists.length === 0 && <p className="text-[11px] font-body text-content-tertiary py-2">No plays recorded yet.</p>}
          </div>
        )}
        {tab === 'recent' && (
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {recentPlays.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] font-body py-1.5 border-b border-border-default/20 last:border-0">
                <History size={10} className="text-success/60 shrink-0" />
                <span className="flex-1 truncate text-content-primary">{p.title}</span>
                <span className="text-content-tertiary truncate max-w-[100px]">{p.artist}</span>
                <span className="text-content-tertiary font-mono text-[9px]">{p.played_at ? new Date(p.played_at + 'Z').toLocaleString() : ''}</span>
              </div>
            ))}
            {recentPlays.length === 0 && <p className="text-[11px] font-body text-content-tertiary py-2">No plays recorded yet.</p>}
          </div>
        )}
        {tab === 'visits' && (
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {visits.map((v, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] font-body py-1.5 border-b border-border-default/20 last:border-0">
                <Globe size={10} className="text-warning/60 shrink-0" />
                <span className="font-mono text-[9px] text-content-primary">{v.ip}</span>
                <span className="text-content-tertiary">{v.username}</span>
                <span className="text-content-tertiary">{v.path}</span>
                <span className="text-content-tertiary font-mono ml-auto text-[9px]">{v.visited_at ? new Date(v.visited_at + 'Z').toLocaleString() : ''}</span>
              </div>
            ))}
            {visits.length === 0 && <p className="text-[11px] font-body text-content-tertiary py-2">No visits recorded yet.</p>}
          </div>
        )}
      </div>

      {/* Server Health */}
      {health && (
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-hot-pink uppercase mb-2 flex items-center gap-1.5"><Radio size={12} /> SERVER HEALTH</h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] font-body">
            <span className="text-content-tertiary">Status</span><span className="text-success">{health.status}</span>
            <span className="text-content-tertiary">Python</span><span className="truncate">{health.python}</span>
            <span className="text-content-tertiary">FFmpeg</span><span>{health.ffmpeg || <span className="text-error">Not found</span>}</span>
            <span className="text-content-tertiary">LRCLib</span><span>{health.lrclib ? <span className="text-success">Connected</span> : <span className="text-content-tertiary">Disabled</span>}</span>
            <span className="text-content-tertiary">Download Dir</span><span className="truncate font-mono text-[10px]">{health.download_dir}</span>
          </div>
        </div>
      )}

      {/* Recent Batches */}
      {history.length > 0 && (
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-electric-blue uppercase mb-2 flex items-center gap-1.5"><BarChart3 size={12} /> RECENT BATCHES</h3>
          <div className="space-y-0.5">
            {history.slice(0, 10).map(b => (
              <div key={b.id} className="flex items-center justify-between text-[11px] font-body py-1.5 border-b border-border-default/20 last:border-0">
                <span className="truncate flex-1 text-content-primary">{b.title || b.url}</span>
                <span className="text-content-tertiary ml-2">{b.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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

function SizeStat({ bytes }: { bytes: number }) {
  const [display, setDisplay] = useState(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    if (bytes === 0) { setDisplay(0); return }
    const start = performance.now()
    const duration = 800
    const target = bytes
    const raf = (now: number) => {
      if (!mounted.current) return
      const pct = Math.min((now - start) / duration, 1)
      setDisplay(Math.round(target * (1 - Math.pow(1 - pct, 3))))
      if (pct < 1) requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
    return () => { mounted.current = false }
  }, [bytes])
  return <>{formatSize(display)}</>
}


