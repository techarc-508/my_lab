import { useState, useEffect } from 'react'
import { getSettings, retryMetadata, changePassword, clearPlayStats, resetLrclib, getIngestionLog } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Save, RefreshCw, Settings as SettingsIcon, Trash2, Activity, Download, Shield, Eye, EyeOff, Clock } from 'lucide-react'
import type { ServerSettings } from '../types/audio'

export default function AdminSettings() {
  const [settings, setSettings] = useState<ServerSettings | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [watcherEnabled, setWatcherEnabled] = useState(false)
  const [ingestionLog, setIngestionLog] = useState<any[]>([])
  const [showIngestion, setShowIngestion] = useState(false)

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s);
      setWatcherEnabled((s as any).watcher_enabled || false);
    }).catch(() => {})
    getIngestionLog(20).then(setIngestionLog).catch(() => {})
  }, [])

  const handlePassword = async () => {
    if (!newPassword.trim()) return
    try { await changePassword(newUsername || 'admin', newPassword); showToast('Password updated (in-memory)', 'success'); setNewPassword(''); setNewUsername('') }
    catch { showToast('Failed to update', 'error') }
  }

  const handleRetryMetadata = async () => { try { const res = await retryMetadata(); showToast(`Scanned ${res.scanned} files`, 'success') } catch { showToast('Failed', 'error') } }

  const handleClearPlays = async () => {
    try { await clearPlayStats(); showToast('Play stats cleared', 'success') } catch { showToast('Failed', 'error') }
  }

  const handleResetLrclib = async () => {
    try { await resetLrclib(); showToast('LRCLIB circuit breaker reset', 'success') } catch { showToast('Failed', 'error') }
  }

  const handleDownloadLogs = () => {
    fetch('/api/logs?lines=500', { credentials: 'include' })
      .then(r => r.text())
      .then(text => {
        const blob = new Blob([text], { type: 'text/plain' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `neotokyo-logs-${new Date().toISOString().slice(0, 10)}.txt`
        a.click()
        URL.revokeObjectURL(a.href)
        showToast('Logs downloaded', 'success')
      })
      .catch(() => showToast('Failed to download logs', 'error'))
  }

  return (
    <div className="p-6 bg-surface-deep">
      <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple mb-5 flex items-center gap-2"><SettingsIcon size={18} /> SETTINGS</h2>

      <div className="bg-surface-raised border border-border-default/30 rounded-lg p-5 mb-4">
        <h3 className="text-xs font-display tracking-[2px] text-electric-blue mb-3 flex items-center gap-2 uppercase">
          <SettingsIcon size={14} /> Server Config
        </h3>
        {settings ? (
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] font-body">
            <span className="text-content-tertiary">Download Dir</span><span className="text-content-primary truncate font-mono text-[10px]">{settings.download_dir}</span>
            <span className="text-content-tertiary">Playlist Dir</span><span className="text-content-primary truncate font-mono text-[10px]">{settings.playlist_dir}</span>
            <span className="text-content-tertiary">Metadata Dir</span><span className="text-content-primary truncate font-mono text-[10px]">{settings.metadata_dir}</span>
            <span className="text-content-tertiary">yt-dlp</span><span className={settings.ytdlp_available ? 'text-success' : 'text-error'}>{settings.ytdlp_available ? 'Available' : 'Not found'}</span>
          </div>
        ) : <p className="text-[10px] font-body text-content-tertiary">Loading...</p>}
      </div>

      <div className="bg-surface-raised border border-border-default/30 rounded-lg p-5 mb-4">
        <h3 className="text-xs font-display tracking-[2px] text-success mb-3 uppercase flex items-center gap-2"><Activity size={14} /> Watcher</h3>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-body text-content-tertiary">File watcher auto-ingestion</span>
          <button onClick={() => setWatcherEnabled(!watcherEnabled)}
            className={`relative w-10 h-5 rounded-full transition-all ${watcherEnabled ? 'bg-success' : 'bg-surface-sunken border border-border-default'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${watcherEnabled ? 'left-5' : 'left-0.5'}`} />
          </button>
          <span className={`text-[10px] font-mono ${watcherEnabled ? 'text-success' : 'text-content-tertiary'}`}>{watcherEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <button onClick={() => setShowIngestion(!showIngestion)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-sunken border border-border-default text-content-tertiary text-[10px] font-body hover:text-white transition-all mb-3">
          <Clock size={10} /> {showIngestion ? 'Hide' : 'Show'} Ingestion Log
        </button>
        {showIngestion && (
          <div className="max-h-40 overflow-y-auto space-y-0.5 mb-3">
            {ingestionLog.length === 0 ? (
              <p className="text-[10px] font-body text-content-tertiary">No ingestion events yet</p>
            ) : ingestionLog.map((e, i) => (
              <div key={e.id || i} className="flex items-center gap-2 text-[9px] font-mono text-content-tertiary py-0.5 border-b border-border-default/10 last:border-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.status === 'done' ? 'bg-success' : e.status === 'error' ? 'bg-error' : 'bg-warning'}`} />
                <span className="truncate flex-1">{e.filename || e.title || '—'}</span>
                {e.error && <span className="text-error truncate max-w-[120px]" title={e.error}>{e.error}</span>}
                <span className="text-content-tertiary/50">{e.created ? new Date(e.created + 'Z').toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface-raised border border-border-default/30 rounded-lg p-5 mb-4">
        <h3 className="text-xs font-display tracking-[2px] text-hot-pink mb-3 uppercase flex items-center gap-2"><Activity size={14} /> Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleRetryMetadata}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-purple/20 border border-purple/30 text-purple text-[11px] font-body hover:bg-purple/30 transition-all">
            <RefreshCw size={12} /> Scan Files for Metadata
          </button>
          <button onClick={handleClearPlays}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-warning/20 border border-warning/30 text-warning text-[11px] font-body hover:bg-warning/30 transition-all">
            <Trash2 size={12} /> Clear Play Stats
          </button>
          <button onClick={handleResetLrclib}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-electric-blue/20 border border-electric-blue/30 text-electric-blue text-[11px] font-body hover:bg-electric-blue/30 transition-all">
            <Shield size={12} /> Reset LRCLIB
          </button>
          <button onClick={handleDownloadLogs}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-success/20 border border-success/30 text-success text-[11px] font-body hover:bg-success/30 transition-all">
            <Download size={12} /> Download Logs
          </button>
        </div>
      </div>

      <div className="bg-surface-raised border border-border-default/30 rounded-lg p-5">
        <h3 className="text-xs font-display tracking-[2px] text-warning mb-3 uppercase flex items-center gap-2"><Save size={14} /> Change Credentials</h3>
        <p className="text-[10px] font-body text-warning/60 mb-3">Changes are in-memory only. Set ADMIN_USERNAME/ADMIN_PASSWORD env vars to persist.</p>
        <div className="flex gap-2">
          <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="New username"
            className="flex-1 px-3 py-2.5 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
          <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="New password"
            className="flex-1 px-3 py-2.5 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
          <button onClick={handlePassword}
            className="px-3 py-2.5 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white hover:brightness-110 active:brightness-90 transition-all shadow-glow-pink-sm">
            <Save size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
