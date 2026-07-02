import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { browseDirectory, deleteFiles, listFiles } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Folder, File, Trash2, ArrowUp, Search, Music, FileAudio } from 'lucide-react'
import type { BrowseResult, FileMeta } from '../types/audio'

export default function AdminBrowse() {
  const [data, setData] = useState<BrowseResult | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [files, setFiles] = useState<FileMeta[]>([])
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<'dirs' | 'files'>('files')

  useEffect(() => { loadFiles() }, [])

  const loadFiles = async () => {
    try {
      const res = await listFiles()
      setFiles(res.files || [])
    } catch { showToast('Failed to load files', 'error') }
  }

  const loadDirs = async (path: string) => {
    try { setData(await browseDirectory(path)) } catch { showToast('Browse failed', 'error') }
  }

  const toggleSelect = (name: string) => setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])

  const handleDelete = async () => {
    if (selected.length === 0) return
    try { const res = await deleteFiles(selected); showToast(`Deleted ${res.deleted} files`, 'success'); setSelected([]); loadFiles() }
    catch { showToast('Delete failed', 'error') }
  }

  const filtered = files.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.artist || '').toLowerCase().includes(search.toLowerCase())
  )

  function formatSize(bytes: number) {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${bytes} B`
  }

  return (
    <div className="p-6" style={{ background: '#0A0A2E' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2"><Folder size={18} /> FILE BROWSER</h2>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button onClick={handleDelete} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-error/20 border border-error/30 text-error text-[10px] font-body hover:bg-error/30 transition-all">
              <Trash2 size={12} /> Delete {selected.length}
            </button>
          )}
        </div>
      </div>

      {/* Mode toggle + Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex bg-surface-sunken rounded-md p-0.5 border border-border-default/30">
          <button onClick={() => setMode('files')} className={`px-3 py-1.5 rounded text-[10px] font-body tracking-[0.5px] transition-all ${mode === 'files' ? 'bg-gradient-to-r from-hot-pink/20 to-purple/20 text-white' : 'text-content-tertiary hover:text-white'}`}>
            <File size={11} className="inline mr-1" />Files
          </button>
          <button onClick={() => setMode('dirs')} className={`px-3 py-1.5 rounded text-[10px] font-body tracking-[0.5px] transition-all ${mode === 'dirs' ? 'bg-gradient-to-r from-hot-pink/20 to-purple/20 text-white' : 'text-content-tertiary hover:text-white'}`}>
            <Folder size={11} className="inline mr-1" />Directories
          </button>
        </div>
        {mode === 'files' && (
          <div className="flex-1 max-w-xs relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..."
              className="w-full pl-7 pr-2.5 py-1.5 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
          </div>
        )}
        <span className="text-[10px] font-body text-content-tertiary ml-auto">{mode === 'files' ? `${filtered.length} / ${files.length} files` : data?.dirs.length ? `${data.dirs.length} dirs` : ''}</span>
      </div>

      {mode === 'dirs' ? (
        <div className="space-y-1 max-h-[70vh] overflow-y-auto">
          {data && data.path && (
            <button onClick={() => loadDirs(data.path.split('/').slice(0, -1).join('/'))}
              className="flex items-center gap-2 text-xs p-3 rounded-md w-full text-left hover:bg-white/[0.02] transition-all text-content-tertiary hover:text-white">
              <ArrowUp size={14} />
              <span className="font-body">..</span>
            </button>
          )}
          {data?.dirs.map(d => (
            <button key={d} onClick={() => loadDirs(d)}
              className="flex items-center gap-2 text-xs p-3 rounded-md w-full text-left hover:bg-white/[0.02] transition-all">
              <Folder size={14} className="text-electric-blue/60" />
              <span className="font-body text-content-primary">{d}</span>
            </button>
          ))}
          {(!data || data.dirs.length === 0) && (
            <div className="flex flex-col items-center py-8 text-content-tertiary">
              <Folder size={24} className="opacity-40 mb-2" />
              <p className="text-[11px] font-body">No directories found</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1 max-h-[70vh] overflow-y-auto">
          {filtered.map(f => (
            <div key={f.name}
              className={`flex items-center gap-2 text-xs p-3 rounded-md transition-all cursor-pointer ${
                selected.includes(f.name) ? 'bg-hot-pink/10 border border-hot-pink/30' : 'hover:bg-white/[0.02] border border-transparent'
              }`}
              onClick={() => toggleSelect(f.name)}
            >
              <input type="checkbox" checked={selected.includes(f.name)} onChange={() => toggleSelect(f.name)} className="accent-hot-pink shrink-0" />
              {f.has_cover ? (
                <img src={`/api/files/${encodeURIComponent(f.name)}?cover=1`} alt="" className="w-8 h-8 rounded object-cover shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }} />
              ) : null}
              <Music size={16} className={`text-content-tertiary shrink-0 ${f.has_cover ? 'hidden' : ''}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-body text-content-primary truncate">{f.title || f.name}</p>
                <p className="text-[9px] font-body text-content-tertiary truncate">
                  {f.artist && <span>{f.artist}{f.album ? ` · ${f.album}` : ''} · </span>}
                  {formatSize(f.size)}
                  {f.genre ? ` · ${f.genre}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {f.has_lyrics && <span title="Has lyrics"><FileAudio size={10} className="text-purple/60" /></span>}
                <span className="text-[9px] font-mono text-content-tertiary">{f.name.split('.').pop()?.toUpperCase()}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-8 text-content-tertiary">
              <File size={24} className="opacity-40 mb-2" />
              <p className="text-[11px] font-body">{search ? 'No files match your search' : 'No audio files found'}</p>
              {!search && <NavLink to="/admin/import" className="text-[9px] text-electric-blue hover:text-white mt-1 transition-colors">Import music →</NavLink>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
