import { useState, useEffect, useRef } from 'react'
import { getPlaylists, createPlaylist, deletePlaylist, updatePlaylist } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../services/audioEngine'
import { Plus, Trash2, Music, GripVertical } from 'lucide-react'

function PlaylistCover({ tracks }: { tracks: any[] }) {
  const [failed, setFailed] = useState(false)
  const first = tracks?.[0]
  const coverUrl = first?.url ? `/api/cover/${encodeURIComponent(decodeURIComponent(first.url.replace('/api/audio/', '')))}` : null
  if (!coverUrl || failed) {
    return <Music size={14} className="text-pink-400/40" />
  }
  return <img src={coverUrl} className="w-full h-full object-cover" alt="" onError={() => setFailed(true)} />
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<any[]>([])
  const [newName, setNewName] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const setTrack = usePlayerStore(s => s.setTrack)
  const dragItem = useRef<{ plIdx: number; trackIdx: number } | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    try { setPlaylists(await getPlaylists()) } catch { showToast('Failed to load playlists', 'error') }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    try { await createPlaylist(newName); setNewName(''); load() } catch { showToast('Failed to create', 'error') }
  }

  const handleDelete = async (name: string) => {
    try { await deletePlaylist(name); load() } catch { showToast('Failed to delete', 'error') }
  }

  const handleRemoveTrack = async (plName: string, trackUrl: string, tracks: any[]) => {
    try { await updatePlaylist(plName, tracks.filter((t: any) => t.url !== trackUrl)); load() } catch { showToast('Failed to update', 'error') }
  }

  const playTrack = (t: any, plTracks: any[]) => {
    const tracks = plTracks.map(x => ({
      title: x.title || x.filename,
      url: x.url,
    }))
    const idx = plTracks.findIndex(x => x.url === t.url)
    const store = usePlayerStore.getState()
    store.setQueue(tracks)
    const track = tracks[idx >= 0 ? idx : 0]
    store.setTrack(track)
    audioEngine.playTrack(track)
  }

  const addToPlayerQueue = (t: any) => {
    const store = usePlayerStore.getState()
    store.addToQueue({ title: t.title || t.filename, url: t.url })
    showToast('Added to queue', 'success')
  }

  const handleDragStart = (plIdx: number, trackIdx: number) => {
    dragItem.current = { plIdx, trackIdx }
    setDragIdx(trackIdx)
  }

  const handleDragOver = (e: React.DragEvent, trackIdx: number) => {
    e.preventDefault()
    setDragIdx(trackIdx)
  }

  const handleDrop = async (plIdx: number, targetIdx: number) => {
    setDragIdx(null)
    if (!dragItem.current || dragItem.current.plIdx !== plIdx) return
    const { trackIdx } = dragItem.current
    if (trackIdx === targetIdx) return
    const pl = playlists[plIdx]
    const tracks = [...pl.tracks]
    const [moved] = tracks.splice(trackIdx, 1)
    tracks.splice(targetIdx, 0, moved)
    try {
      await updatePlaylist(pl.name, tracks)
      load()
    } catch { showToast('Failed to reorder', 'error') }
  }

  const handleDragEnd = () => {
    setDragIdx(null)
    dragItem.current = null
  }

  return (
    <div className="p-6">
      <h2 className="text-sm font-bold text-pink-400 mb-4">Playlists</h2>
      <div className="flex gap-2 mb-4">
        <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="New playlist name..."
          className="flex-1 px-3 py-2 bg-surface-card border border-border-subtle rounded text-xs focus:outline-none focus:border-pink-500/50" />
        <button onClick={handleCreate} className="px-3 py-2 bg-pink-500/20 border border-pink-400/30 rounded text-xs text-pink-300">
          <Plus size={14} />
        </button>
      </div>
      <div className="space-y-3">
        {playlists.map((pl, plIdx) => (
          <div key={pl.name} className="bg-surface-card/50 border border-border-subtle/50 rounded-lg p-3 card-hover">
            <div className="flex items-center gap-3 mb-2">
              {/* Cover art */}
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gradient-to-br from-pink-500/10 to-cyan-500/10 flex items-center justify-center">
                <PlaylistCover tracks={pl.tracks} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-content-primary truncate">{pl.name}</h3>
                <p className="text-[10px] text-content-tertiary">{pl.tracks?.length || 0} tracks</p>
              </div>
              <button onClick={() => handleDelete(pl.name)} className="text-red-400/60 hover:text-red-400 shrink-0"><Trash2 size={12} /></button>
            </div>
            {pl.tracks?.length > 0 ? (
              <div className="space-y-1">
                {pl.tracks.map((t: any, i: number) => (
                  <div key={`${t.url}-${i}`}
                    draggable
                    onDragStart={() => handleDragStart(plIdx, i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={(e) => handleDrop(plIdx, i)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 text-[10px] p-1 rounded group ${
                      dragIdx === i ? 'border border-pink-500/30 bg-pink-500/5' : ''
                    }`}
                  >
                    <span className="cursor-grab active:cursor-grabbing text-text-muted"><GripVertical size={10} /></span>
                    <button onClick={() => playTrack(t, pl.tracks)} className="flex-1 text-left truncate hover:text-pink-300">{t.title || t.filename}</button>
                    <button onClick={() => addToPlayerQueue(t)} className="text-cyan-400/0 group-hover:text-cyan-400/60 hover:text-cyan-400" title="Add to queue">+Q</button>
                    <button onClick={() => handleRemoveTrack(pl.name, t.url, pl.tracks)} className="text-red-400/0 group-hover:text-red-400/60 hover:text-red-400"><Trash2 size={10} /></button>
                  </div>
                ))}
              </div>
            ) : <p className="text-[10px] text-text-muted">Empty playlist</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
