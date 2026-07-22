import { useState, useEffect } from 'react'
import { getBackups, createBackup, deleteBackup } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Trash2, Shield, Plus, CalendarClock, Download, RotateCcw, AlertTriangle, Info, Loader2 } from 'lucide-react'

interface ScheduledBackup { id: number; name: string; created_at: string }

export default function AdminBackups() {
  const [backups, setBackups] = useState<any[]>([])
  const [scheduled, setScheduled] = useState<ScheduledBackup[]>([])
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    try { setBackups(await getBackups()) } catch {}
    try { const res = await fetch('/api/stats/scheduled-backups', { credentials: 'include' }); if (res.ok) setScheduled(await res.json()) } catch {}
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await createBackup()
      showToast(`Backup v${res.version} created`, 'success')
      load()
    } catch { showToast('Create failed', 'error') }
    setCreating(false)
  }

  const handleDelete = async (id: string) => {
    try { await deleteBackup(id); load(); showToast('Backup deleted', 'info') }
    catch { showToast('Delete failed', 'error') }
  }

  const handleRestore = async (id: string) => {
    setRestoring(id)
    try {
      const res = await fetch(`/api/backups/${id}/restore`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': localStorage.getItem('csrfToken') || '' } })
      if (res.ok) {
        const data = await res.json()
        showToast(`Restored ${data.restored} playlist(s) from v${data.version}`, 'success')
      } else {
        showToast('Restore failed', 'error')
      }
    } catch { showToast('Restore failed', 'error') }
    setRestoring(null)
    setConfirmRestore(null)
  }

  return (
    <div className="p-6 bg-surface-deep">
      <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple mb-5 flex items-center gap-2"><Shield size={18} /> BACKUPS</h2>

      <div className="bg-surface-raised border border-electric-blue/20 rounded-lg p-4 mb-5 flex items-start gap-3">
        <Info size={16} className="text-electric-blue shrink-0 mt-0.5" />
        <div className="text-[11px] font-body text-content-secondary leading-relaxed">
          <p className="mb-1"><strong className="text-white">Playlist backups</strong> are snapshots of all your playlist <code className="text-hot-pink">.json</code> files.
          You can create them manually, restore a previous version, or let the <strong className="text-electric-blue">daily auto-backup</strong> handle it.</p>
          <p className="text-content-tertiary">Auto-backup runs daily at <strong className="text-white">12:00 AM</strong> (UTC+5:30) and preserves radio stations + playlists.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-electric-blue uppercase mb-2 flex items-center gap-1.5"><Plus size={12} /> Create Backup</h3>
          <p className="text-[11px] font-body text-content-tertiary mb-3">
            Save a snapshot of all playlists. Keeps last 10 versions.
          </p>
          <button onClick={handleCreate} disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white text-[11px] font-body tracking-[1px] uppercase hover:brightness-110 active:brightness-90 disabled:opacity-35 transition-all shadow-glow-pink-sm">
            <Plus size={14} /> {creating ? 'Creating...' : 'Create Backup'}
          </button>
        </div>

        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <h3 className="text-[10px] font-display tracking-[2px] text-warning uppercase mb-2 flex items-center gap-1.5"><RotateCcw size={12} /> Restore</h3>
          <p className="text-[11px] font-body text-content-tertiary mb-3">
            Pick a backup below and click <strong className="text-warning">Restore</strong> to revert playlists to that version.
          </p>
          <p className="text-[10px] font-body text-content-tertiary/60 flex items-center gap-1">
            <AlertTriangle size={10} /> Restoring overwrites current playlists.
          </p>
        </div>
      </div>

      {scheduled.length > 0 && (
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4 mb-5">
          <h3 className="text-xs font-display tracking-[2px] text-electric-blue mb-3 flex items-center gap-2 uppercase">
            <CalendarClock size={14} /> Scheduled Backups
          </h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {scheduled.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-[10px] font-body py-1.5 border-b border-border-default/20 last:border-0">
                <Shield size={10} className="text-success/60 shrink-0" />
                <span className="flex-1 text-content-primary truncate">{s.name}</span>
                <span className="text-content-tertiary font-mono shrink-0">{s.created_at ? new Date(s.created_at + 'Z').toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-body text-content-tertiary mt-2">Auto-backup runs daily at <strong className="text-white">12:00 AM UTC+5:30</strong> (18:30 UTC)</p>
        </div>
      )}

      {backups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 mt-12 text-content-tertiary">
          <Shield size={32} />
          <p className="text-xs font-body">No playlist backups yet. Create your first one above.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {backups.map((b: any) => {
            const isRestoring = restoring === String(b.id)
            const isConfirming = confirmRestore === String(b.id)
            return (
              <div key={b.id}
                className={`flex items-center gap-2 text-xs p-3 rounded-md transition-all ${
                  isConfirming ? 'bg-warning/10 border border-warning/30' : 'bg-surface-raised/30 border border-border-default/20 hover:border-hot-pink/20'
                }`}>
                <Shield size={12} className="text-electric-blue/60 shrink-0" />
                <span className="flex-1 font-body text-content-primary">Backup v{b.version}</span>
                <span className="text-[10px] font-body text-content-tertiary">{b.created}</span>
                {b.device && <span className="text-[9px] font-mono text-content-tertiary/50">{b.device}</span>}
                <div className="flex items-center gap-1 shrink-0">
                  {!isConfirming ? (
                    <>
                      <button onClick={() => setConfirmRestore(String(b.id))}
                        className="px-2 py-1 rounded-md bg-warning/20 border border-warning/30 text-warning text-[9px] font-body hover:bg-warning/30 transition-all flex items-center gap-1">
                        <RotateCcw size={10} /> Restore
                      </button>
                      <button onClick={() => handleDelete(b.id)} className="text-error/40 hover:text-error transition-all p-1"><Trash2 size={12} /></button>
                    </>
                  ) : (
                    <>
                      <span className="text-[9px] font-body text-warning">Overwrite current playlists?</span>
                      <button onClick={() => handleRestore(String(b.id))} disabled={isRestoring}
                        className="px-2 py-1 rounded-md bg-warning/30 border border-warning/50 text-warning text-[9px] font-body hover:brightness-110 transition-all disabled:opacity-35 flex items-center gap-1">
                        {isRestoring ? <><Loader2 size={10} className="animate-spin" /> Restoring...</> : <><AlertTriangle size={10} /> Confirm</>}
                      </button>
                      <button onClick={() => setConfirmRestore(null)} className="text-content-tertiary hover:text-white text-[9px] p-1">Cancel</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
