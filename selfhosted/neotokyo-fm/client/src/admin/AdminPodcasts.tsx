import { useState, useEffect, useMemo } from 'react'
import { adminListPodcasts, adminDeletePodcast, adminSyncAllPodcasts, adminSeedPodcasts, syncPodcast } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Rss, RefreshCw, Trash2, Download, Plus, Search, RotateCw } from 'lucide-react'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import type { Podcast } from '../types/audio'

export default function AdminPodcasts() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState<Record<number, boolean>>({})
  const [syncingAll, setSyncingAll] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Podcast | null>(null)
  const [confirmSeed, setConfirmSeed] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setPodcasts(await adminListPodcasts()) } catch { showToast('Failed to load podcasts', 'error') }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return podcasts
    const q = search.toLowerCase()
    return podcasts.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.author || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    )
  }, [podcasts, search])

  const stats = useMemo(() => {
    const totalPodcasts = podcasts.length
    const totalEpisodes = podcasts.reduce((s, p) => s + (p.episode_count || 0), 0)
    return { totalPodcasts, totalEpisodes }
  }, [podcasts])

  const handleSync = async (id: number) => {
    setSyncing(prev => ({ ...prev, [id]: true }))
    try {
      await syncPodcast(id)
      showToast('Sync started', 'success')
      setTimeout(load, 3000)
    } catch { showToast('Sync failed', 'error') }
    setTimeout(() => setSyncing(prev => ({ ...prev, [id]: false })), 4000)
  }

  const handleSyncAll = async () => {
    setSyncingAll(true)
    try {
      const r = await adminSyncAllPodcasts()
      showToast(`Syncing ${r.syncing} podcast(s)...`, 'success')
      setTimeout(load, 3000)
    } catch { showToast('Sync all failed', 'error') }
    setTimeout(() => setSyncingAll(false), 4000)
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const r = await adminSeedPodcasts()
      showToast(`Seeded ${r.count} podcasts`, 'success')
      load()
    } catch { showToast('Seed failed', 'error') }
    setSeeding(false)
    setConfirmSeed(false)
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await adminDeletePodcast(confirmDelete.id)
      showToast('Podcast deleted', 'success')
      setConfirmDelete(null)
      load()
    } catch { showToast('Delete failed', 'error') }
  }

  return (
    <div className="p-6 bg-surface-deep">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2">
          <Rss size={18} /> PODCASTS <span className="text-content-tertiary text-sm">({podcasts.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title, author, category..."
              className="w-56 pl-7 pr-2 py-2 bg-surface-sunken border border-border-default rounded-md text-[11px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
          </div>
          <button onClick={handleSyncAll} disabled={syncingAll}
            className="px-3 py-2 rounded-md text-[10px] font-body text-content-tertiary border border-border-default hover:border-electric-blue/50 hover:text-white transition-all flex items-center gap-1">
            <RefreshCw size={11} className={syncingAll ? 'animate-spin' : ''} /> Sync All
          </button>
          <button onClick={() => setConfirmSeed(true)} disabled={seeding}
            className="px-3 py-2 rounded-md text-[10px] font-body text-success/80 border border-success/30 hover:border-success/60 hover:text-success transition-all flex items-center gap-1">
            <Plus size={11} className={seeding ? 'animate-spin' : ''} /> Seed
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-3">
          <p className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px]">Total Podcasts</p>
          <p className="text-lg font-display tracking-[1px] text-white mt-1">{stats.totalPodcasts}</p>
        </div>
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-3">
          <p className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px]">Total Episodes</p>
          <p className="text-lg font-display tracking-[1px] text-white mt-1">{stats.totalEpisodes}</p>
        </div>
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-3">
          <p className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px]">Total Downloads</p>
          <p className="text-lg font-display tracking-[1px] text-white mt-1">—</p>
        </div>
      </div>

      {loading ? (
        <div className="text-[11px] font-body text-content-tertiary py-12 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-[11px] font-body text-content-tertiary py-12 text-center">
          {podcasts.length === 0 ? 'No podcasts found. Use Seed to add sample podcasts.' : 'No podcasts match your search.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-default/30">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-default/30 bg-surface-sunken/50">
                <th className="p-3 text-left text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Title</th>
                <th className="p-3 text-left text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Author</th>
                <th className="p-3 text-left text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Category</th>
                <th className="p-3 text-center text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Episodes</th>
                <th className="p-3 text-left text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Last Synced</th>
                <th className="p-3 text-left text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Error</th>
                <th className="p-3 text-right text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-border-default/20 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3 font-body text-[11px] truncate max-w-[200px]">{p.title || 'Untitled'}</td>
                  <td className="p-3 font-body text-[11px] text-content-secondary truncate max-w-[150px]">{p.author || '—'}</td>
                  <td className="p-3 font-body text-[11px] text-content-secondary truncate max-w-[120px]">{p.category || '—'}</td>
                  <td className="p-3 text-center font-body text-[11px] text-content-secondary">{p.episode_count || 0}</td>
                  <td className="p-3 font-body text-[11px] text-content-secondary">
                    {p.last_synced ? new Date(p.last_synced + 'Z').toLocaleString() : 'Never'}
                  </td>
                  <td className="p-3 font-body text-[11px] text-error/70 truncate max-w-[150px]">{p.error || '—'}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleSync(p.id)} disabled={syncing[p.id]}
                        className="p-1.5 rounded hover:bg-electric-blue/10 hover:text-electric-blue transition-all" title="Sync">
                        <RotateCw size={12} className={syncing[p.id] ? 'animate-spin' : ''} />
                      </button>
                      <button onClick={() => setConfirmDelete(p)}
                        className="p-1.5 rounded hover:bg-error/10 hover:text-error transition-all" title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="DELETE PODCAST"
        message={`Are you sure you want to delete "${confirmDelete?.title || 'this podcast'}"? This will remove all episodes and cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmSeed}
        title="SEED PODCASTS"
        message="This will add sample podcasts to the database. Continue?"
        confirmLabel="Seed"
        variant="warning"
        onConfirm={handleSeed}
        onCancel={() => setConfirmSeed(false)}
      />
    </div>
  )
}
