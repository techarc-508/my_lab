import { useState, useEffect, useCallback, useMemo } from 'react'
import { listFiles, getMetadata, updateFileMetadata, batchUpdateMetadata, uploadCover, deleteCover, deleteFiles } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Music, Search, Trash2, Edit3, Image, Upload, X, Check, Radio } from 'lucide-react'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import type { FileMeta } from '../types/audio'

interface FileEntry extends FileMeta {
  name: string; size: number; modified: number
}

export default function AdminSongs() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editFile, setEditFile] = useState<FileEntry | null>(null)
  const [editForm, setEditForm] = useState({ title: '', artist: '', album: '', genre: '' })
  const [batchEditOpen, setBatchEditOpen] = useState(false)
  const [batchForm, setBatchForm] = useState({ title: '', artist: '', album: '', genre: '' })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false)
  const [convertTargets, setConvertTargets] = useState<Set<string>>(new Set())
  const [converting, setConverting] = useState(false)
  // Inline edit state
  const [inlineEdit, setInlineEdit] = useState<{ name: string; field: string; value: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listFiles(0, 0)
      const withMeta = await Promise.all(
        data.files.map(async (f: any) => {
          try { const meta = await getMetadata(f.name); return { ...f, ...meta } }
          catch { return { ...f, title: f.name, artist: null, album: null, album_art: null, has_cover: false, has_lyrics: false } }
        })
      )
      setFiles(withMeta)
    } catch { showToast('Failed to load songs', 'error') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return files
    const q = search.toLowerCase()
    return files.filter(f => (f.title || f.name).toLowerCase().includes(q) || (f.artist || '').toLowerCase().includes(q))
  }, [files, search])

  const toggleSelect = (name: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next })
  }

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(f => f.name)))
  }

  const openEdit = (f: FileEntry) => {
    setEditFile(f); setEditForm({ title: f.title || '', artist: f.artist || '', album: f.album || '', genre: f.genre || '' })
  }

  const saveEdit = async () => {
    if (!editFile) return
    try { await updateFileMetadata(editFile.name, editForm); showToast('Updated', 'success'); setEditFile(null); load() }
    catch { showToast('Update failed', 'error') }
  }

  // Inline edit save
  const saveInlineEdit = async (name: string, field: string, value: string) => {
    try { await updateFileMetadata(name, { [field]: value }); showToast('Updated', 'success') }
    catch { showToast('Update failed', 'error') }
    setInlineEdit(null)
  }

  const saveBatchEdit = async () => {
    const upd = Array.from(selected).map(name => ({ name, ...batchForm })).filter(u => u.title || u.artist || u.album || u.genre)
    if (upd.length === 0) { showToast('No changes', 'error'); return }
    try {
      await batchUpdateMetadata(upd)
      showToast(`Updated ${upd.length} songs`, 'success')
      setBatchEditOpen(false); setSelected(new Set()); setBatchForm({ title: '', artist: '', album: '', genre: '' }); load()
    } catch { showToast('Batch update failed', 'error') }
  }

  const handleDelete = async (name: string) => {
    try { await deleteFiles([name]); showToast('Deleted', 'success'); setConfirmDelete(null); load() }
    catch { showToast('Delete failed', 'error') }
  }

  const handleBatchDelete = async () => {
    try { await deleteFiles(Array.from(selected)); showToast(`Deleted ${selected.size} songs`, 'success'); setSelected(new Set()); setConfirmBatchDelete(false); load() }
    catch { showToast('Batch delete failed', 'error'); setConfirmBatchDelete(false) }
  }

  const handleCoverUpload = async (name: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try { await uploadCover(name, file); showToast('Cover uploaded', 'success'); load() }
    catch { showToast('Upload failed', 'error') }
    e.target.value = ''
  }

  const handleCoverDelete = async (name: string) => {
    try { await deleteCover(name); showToast('Cover removed', 'success'); load() }
    catch { showToast('Cover delete failed', 'error') }
  }

  const handleConvert = async (name: string) => {
    try {
      const res = await fetch('/api/transcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name, bitrate: 320 }),
      })
      const data = await res.json()
      if (res.ok) showToast(`Converted: ${data.output}`, 'success')
      else showToast(data.error || 'Convert failed', 'error')
    } catch { showToast('Convert failed', 'error') }
  }

  return (
    <div className="p-6 bg-surface-deep">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2">
          <Music size={18} /> MANAGE SONGS <span className="text-content-tertiary text-sm">({files.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              className="w-48 pl-7 pr-2 py-2 bg-surface-sunken border border-border-default rounded-md text-[11px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
          </div>
          <button onClick={load} className="px-3 py-2 rounded-md text-[10px] font-body text-content-tertiary border border-border-default hover:border-electric-blue/50 hover:text-white transition-all">Refresh</button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-gradient-to-r from-hot-pink/10 to-purple/10 border border-hot-pink/20 rounded-lg">
          <span className="text-[11px] font-body text-hot-pink">{selected.size} selected</span>
          <button onClick={() => setBatchEditOpen(true)} className="px-2.5 py-1 text-[10px] font-body bg-electric-blue/20 border border-electric-blue/30 rounded-md text-electric-blue hover:bg-electric-blue/30 transition-all flex items-center gap-1">
            <Edit3 size={10} /> Edit
          </button>
          <button onClick={() => setConfirmBatchDelete(true)} className="px-2.5 py-1 text-[10px] font-body bg-error/20 border border-error/30 rounded-md text-error hover:bg-error/30 transition-all flex items-center gap-1">
            <Trash2 size={10} /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="px-2 py-1 text-[10px] font-body text-content-tertiary hover:text-white transition-all">Clear</button>
        </div>
      )}

      {loading ? (
        <div className="text-[11px] font-body text-content-tertiary py-12 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-[11px] font-body text-content-tertiary py-12 text-center">No songs found</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-default/30">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-default/30 bg-surface-sunken/50">
                <th className="w-10 p-3 text-left"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={selectAll} className="accent-hot-pink rounded" /></th>
                <th className="p-3 text-left text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Cover</th>
                <th className="p-3 text-left text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Title</th>
                <th className="p-3 text-left text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Artist</th>
                <th className="p-3 text-left text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Album</th>
                <th className="p-3 text-left text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Genre</th>
                <th className="p-3 text-right text-content-tertiary font-body text-[10px] uppercase tracking-[1px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.name} className="border-b border-border-default/20 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3"><input type="checkbox" checked={selected.has(f.name)} onChange={() => toggleSelect(f.name)} className="accent-hot-pink rounded" /></td>
                  <td className="p-3">
                    <div className="relative group">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-br from-hot-pink/10 to-purple/10 flex items-center justify-center overflow-hidden border border-border-default/50">
                        {f.has_cover ? <img src={`/api/cover/${encodeURIComponent(f.name)}`} className="w-full h-full object-cover" /> : <Music size={13} className="text-hot-pink/40" />}
                      </div>
                      <div className="absolute -bottom-1 -right-1 hidden group-hover:flex gap-0.5">
                        <label className="w-4 h-4 bg-surface-raised rounded flex items-center justify-center cursor-pointer border border-border-default hover:border-hot-pink/50">
                          <Upload size={7} className="text-hot-pink" />
                          <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={e => handleCoverUpload(f.name, e)} />
                        </label>
                        {f.has_cover && <button onClick={() => handleCoverDelete(f.name)} className="w-4 h-4 bg-surface-raised rounded flex items-center justify-center border border-border-default hover:border-error/50"><X size={7} className="text-error" /></button>}
                      </div>
                    </div>
                  </td>
                  {/* Inline editable cells */}
                  {(['title', 'artist', 'album', 'genre'] as const).map(field => (
                    <td key={field} className="p-3 truncate max-w-[200px] font-body text-[11px]"
                      onClick={() => setInlineEdit({ name: f.name, field, value: f[field] || '' })}>
                      {inlineEdit?.name === f.name && inlineEdit?.field === field ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus value={inlineEdit.value} onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                            className="w-full px-1.5 py-0.5 bg-surface-sunken border border-hot-pink rounded text-[11px] text-content-primary focus:outline-none"
                            onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(f.name, field, inlineEdit.value); if (e.key === 'Escape') setInlineEdit(null) }}
                            onBlur={() => saveInlineEdit(f.name, field, inlineEdit.value)} />
                        </div>
                      ) : (
                        <span className="cursor-pointer hover:text-hot-pink transition-colors">{field === 'title' ? (f.title || f.name) : ((f as any)[field] || '-')}</span>
                      )}
                    </td>
                  ))}
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleConvert(f.name)} className="p-1.5 rounded hover:bg-success/10 hover:text-success transition-all" title="Convert to MP3 320kbps">
                        <Radio size={12} />
                      </button>
                      <button onClick={() => openEdit(f)} className="p-1.5 rounded hover:bg-hot-pink/10 hover:text-hot-pink transition-all" title="Edit metadata">
                        <Edit3 size={12} />
                      </button>
                      <button onClick={() => setConfirmDelete(f.name)} className="p-1.5 rounded hover:bg-error/10 hover:text-error transition-all" title="Delete">
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

      {/* Edit modal */}
      {editFile && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={() => setEditFile(null)}>
          <div className="bg-surface-raised border border-border-default/50 rounded-lg p-6 w-96 space-y-4 shadow-glow-combo" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-display tracking-[2px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2"><Edit3 size={14} /> EDIT METADATA</h3>
            <p className="text-[10px] font-body text-content-tertiary truncate">{editFile.name}</p>
            <div className="space-y-3">
              {(['title', 'artist', 'album', 'genre'] as const).map(field => (
                <div key={field}>
                  <label className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px] block mb-1">{field}</label>
                  <input value={editForm[field]} onChange={e => setEditForm(prev => ({ ...prev, [field]: e.target.value }))}
                    className="w-full px-3 py-2 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={saveEdit} className="flex-1 py-2 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white text-[11px] font-body tracking-[1px] uppercase hover:brightness-110 active:brightness-90 transition-all flex items-center justify-center gap-1.5 shadow-glow-pink-sm">
                <Check size={12} /> Save
              </button>
              <button onClick={() => setEditFile(null)} className="px-4 py-2 text-[11px] font-body text-content-tertiary hover:text-white transition-all">Cancel</button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <label className="flex-1 py-2 rounded-md border border-border-default text-[10px] font-body text-content-tertiary text-center cursor-pointer hover:border-electric-blue/50 hover:text-white transition-all flex items-center justify-center gap-1">
                <Upload size={10} /> Upload Cover
                <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={e => { handleCoverUpload(editFile.name, e); setEditFile(null) }} />
              </label>
              {editFile.has_cover && (
                <button onClick={() => { handleCoverDelete(editFile.name); setEditFile(null) }} className="px-3 py-2 text-[10px] font-body text-error/60 hover:text-error transition-all flex items-center gap-1">
                  <X size={10} /> Remove Cover
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch edit modal */}
      {batchEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={() => setBatchEditOpen(false)}>
          <div className="bg-surface-raised border border-border-default/50 rounded-lg p-6 w-96 space-y-4 shadow-glow-combo" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-display tracking-[2px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2"><Edit3 size={14} /> BATCH EDIT <span className="text-content-tertiary text-[10px]">({selected.size} songs)</span></h3>
            <p className="text-[10px] font-body text-warning/60">Leave blank to keep unchanged</p>
            <div className="space-y-3">
              {(['title', 'artist', 'album', 'genre'] as const).map(field => (
                <div key={field}>
                  <label className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px] block mb-1">{field}</label>
                  <input value={batchForm[field]} onChange={e => setBatchForm(prev => ({ ...prev, [field]: e.target.value }))} placeholder="Leave blank to keep"
                    className="w-full px-3 py-2 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={saveBatchEdit} className="flex-1 py-2 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white text-[11px] font-body tracking-[1px] uppercase hover:brightness-110 active:brightness-90 transition-all flex items-center justify-center gap-1.5 shadow-glow-pink-sm">
                <Check size={12} /> Apply
              </button>
              <button onClick={() => setBatchEditOpen(false)} className="px-4 py-2 text-[11px] font-body text-content-tertiary hover:text-white transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="DELETE SONG"
        message={`Are you sure you want to delete "${confirmDelete}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Confirm batch delete dialog */}
      <ConfirmDialog
        open={confirmBatchDelete}
        title="DELETE SONGS"
        message={`Are you sure you want to delete ${selected.size} songs? This cannot be undone.`}
        confirmLabel={`Delete ${selected.size}`}
        variant="danger"
        onConfirm={handleBatchDelete}
        onCancel={() => setConfirmBatchDelete(false)}
      />
    </div>
  )
}
