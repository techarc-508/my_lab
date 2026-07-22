import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { listFiles, getMetadata, searchFiles, getLibraryTree } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { CardSkeleton } from '../components/ui/Skeleton'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../services/audioEngine'
import { storageGet, storageSet } from '../utils/storage'
import { Search, X, LayoutGrid, List, Disc3, Folder, ChevronRight, Clock, Download } from 'lucide-react'
import BulkUploadButton from '../components/library/BulkUploadButton'
import type { FileMeta } from '../types/audio'

const SORT_OPTIONS = [
  { key: 'name_asc', label: 'Name ↑', compare: (a: FileMeta, b: FileMeta) => (a.title || a.name).localeCompare(b.title || b.name) },
  { key: 'name_desc', label: 'Name ↓', compare: (a: FileMeta, b: FileMeta) => (b.title || b.name).localeCompare(a.title || a.name) },
  { key: 'artist_asc', label: 'Artist ↑', compare: (a: FileMeta, b: FileMeta) => (a.artist || '').localeCompare(b.artist || '') },
  { key: 'date_desc', label: 'Newest', compare: (a: FileMeta, b: FileMeta) => b.modified - a.modified },
  { key: 'size_desc', label: 'Size ↓', compare: (a: FileMeta, b: FileMeta) => b.size - a.size },
]

function getSortKey(): string { return storageGet('library-sort', 'date_desc') }
function setSortKey(key: string) { storageSet('library-sort', key) }
function getViewMode(): 'grid' | 'list' { return storageGet<'grid' | 'list'>('library-view', 'grid') }
function setViewMode(m: 'grid' | 'list') { storageSet('library-view', m) }
function getGroupBy(): 'none' | 'album' { return storageGet<'none' | 'album'>('library-group', 'none') }
function setGroupBy(g: 'none' | 'album') { storageSet('library-group', g) }

export default function LibraryPage() {
  const [files, setFiles] = useState<FileMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [sortKey, setSortKeyState] = useState(getSortKey)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewModeState] = useState<'grid' | 'list'>(getViewMode)
  const [groupBy, setGroupByState] = useState<'none' | 'album'>(getGroupBy)
  const [folderTree, setFolderTree] = useState<any[]>([])
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [showFolders, setShowFolders] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const setTrack = usePlayerStore(s => s.setTrack)
  const addToQueue = usePlayerStore(s => s.addToQueue)
  const cacheOffline = usePlayerStore(s => s.cacheOffline)
  const removeOffline = usePlayerStore(s => s.removeOffline)
  const offlineTracks = usePlayerStore(s => s.offlineTracks)

  useEffect(() => {
    getLibraryTree().then(data => setFolderTree(data.tree || [])).catch(() => {})
  }, [])

  const loadFiles = useCallback(async () => {
    try {
      const data = await listFiles(50, offset)
      const withMeta = await Promise.all(
        data.files.map(async (f: { name: string; size: number; modified: number }) => {
          try { const meta = await getMetadata(f.name); return { ...f, ...meta } }
          catch { return { ...f, title: f.name, artist: null, album: null, album_art: null, has_cover: false, has_lyrics: false } }
        })
      )
      setFiles(prev => {
        const existing = new Set(prev.map(f => f.name))
        const unique = withMeta.filter(f => !existing.has(f.name))
        return [...prev, ...unique]
      })
      setOffset(prev => prev + withMeta.length)
      if (data.total <= offset + withMeta.length) setHasMore(false)
    } catch { showToast('Failed to load files', 'error') }
    finally { setLoading(false) }
  }, [offset])

  const fetched = useRef(false)
  useEffect(() => { if (fetched.current) return; fetched.current = true; loadFiles() }, [])

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q)
    if (!q.trim()) return
    if (q.length < 2) return
    try {
      const data = await searchFiles(q)
      if (data.results && data.results.length > 0) {
        setFiles(prev => {
          const existing = new Set(prev.map(f => f.name))
          const newOnes = data.results.filter((r: any) => !existing.has(r.filename)).map((r: any) => ({
            name: r.filename,
            size: 0, modified: 0,
            title: r.title || '',
            artist: r.artist || null,
            album: r.album || null,
            album_art: null, has_cover: false, has_lyrics: false,
          }))
          return newOnes.length > 0 ? [...newOnes, ...prev] : prev
        })
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && hasMore) loadFiles() })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadFiles])

  const handleSort = (key: string) => { setSortKeyState(key); setSortKey(key) }
  const handleViewMode = (mode: 'grid' | 'list') => { setViewModeState(mode); setViewMode(mode) }
  const handleGroupBy = (g: 'none' | 'album') => { setGroupByState(g); setGroupBy(g) }

  const sorted = useMemo(() => {
    const opt = SORT_OPTIONS.find(o => o.key === sortKey) || SORT_OPTIONS[0]
    return [...files].sort(opt.compare)
  }, [files, sortKey])

  const filtered = useMemo(() => {
    let q = searchQuery.trim()
    if (!q) return sorted
    q = q.toLowerCase()
    return sorted.filter(f => (f.title || f.name).toLowerCase().includes(q) || (f.artist || '').toLowerCase().includes(q))
  }, [sorted, searchQuery])

  const albums = useMemo(() => {
    if (groupBy !== 'album') return null
    const groups = new Map<string, FileMeta[]>()
    for (const f of filtered) {
      const key = f.album || '(No Album)'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(f)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered, groupBy])

  const toggleSelect = (name: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next })
  }

  const playTrack = (f: FileMeta) => {
    const tracks = sorted.map(x => ({ title: x.title || x.name, artist: x.artist || undefined, url: `/api/audio/${encodeURIComponent(x.name)}`, albumArt: `/api/cover/${encodeURIComponent(x.name)}` }))
    const idx = sorted.findIndex(x => x.name === f.name)
    const store = usePlayerStore.getState()
    store.setQueue(tracks)
    const track = tracks[idx >= 0 ? idx : 0]
    store.setTrack(track)
    audioEngine.playTrack(track)
  }

  const playSelected = () => {
    const selectedFiles = sorted.filter(f => selected.has(f.name))
    if (selectedFiles.length === 0) return
    const tracks = selectedFiles.map(f => ({ title: f.title || f.name, artist: f.artist || undefined, url: `/api/audio/${encodeURIComponent(f.name)}`, albumArt: `/api/cover/${encodeURIComponent(f.name)}` }))
    const store = usePlayerStore.getState()
    store.setQueue(tracks); store.setTrack(tracks[0]); audioEngine.playTrack(tracks[0]); setSelected(new Set())
  }

  const queueSelected = () => {
    const selectedFiles = sorted.filter(f => selected.has(f.name))
    for (const f of selectedFiles) addToQueue({ title: f.title || f.name, artist: f.artist || undefined, url: `/api/audio/${encodeURIComponent(f.name)}` })
    showToast(`Added ${selectedFiles.length} to queue`, 'success'); setSelected(new Set())
  }

  function renderFolderTree(nodes: any[], depth = 0) {
    return nodes.map((node, i) => (
      <div key={i}>
        <button
          onClick={() => {
            setCurrentFolder(node.path || node.name)
            setShowFolders(false)
          }}
          className={`flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg text-[10px] transition-all hover:bg-white/5 ${currentFolder === (node.path || node.name) ? 'bg-neon-pink/10 text-neon-pink' : 'text-content-tertiary'}`}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
        >
          <Folder size={10} className="shrink-0 text-neon-pink/60" />
          <span className="truncate">{node.name}</span>
          {node.children && node.children.length > 0 && <ChevronRight size={8} className="ml-auto text-content-tertiary/40" />}
        </button>
        {node.children && renderFolderTree(node.children, depth + 1)}
      </div>
    ))
  }

  if (loading && files.length === 0) return <div className="p-6 pb-32 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}</div>

  return (
    <div className="p-6 pb-32">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-neon-pink">Library ({searchQuery ? filtered.length : files.length})</h2>
        <div className="flex items-center gap-2">
          {/* Folder tree toggle */}
          <button onClick={() => setShowFolders(!showFolders)}
            className={`px-2 py-1 rounded-lg text-[9px] border transition-all ${showFolders ? 'bg-neon-pink/20 border-neon-pink/30 text-neon-pink' : 'bg-white/5 border-white/10 text-white/40'}`}>
            <Folder size={10} />
          </button>

          {/* Bulk upload */}
          <BulkUploadButton />

          {/* Search */}
          <div className="relative flex items-center">
            <Search size={12} className="absolute left-2 text-neon-pink/50 pointer-events-none" />
            <input value={searchQuery} onChange={e => {
              setSearchQuery(e.target.value)
              if (e.target.value.length >= 2) handleSearch(e.target.value)
            }} placeholder="Search songs..."
              className="w-32 pl-6 pr-6 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-[10px] text-white placeholder:text-text-muted focus:outline-none focus:border-neon-pink/50 transition-all backdrop-blur-sm" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-1.5 text-neon-pink/50 hover:text-neon-pink"><X size={10} /></button>}
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-neon-pink">{selected.size} selected</span>
              <button onClick={playSelected} className="px-2 py-1 text-[9px] bg-green-500/20 border border-green-400/30 rounded-lg text-green-300">Play</button>
              <button onClick={queueSelected} className="px-2 py-1 text-[9px] bg-cyan-500/20 border border-cyan-400/30 rounded-lg text-cyan-300">Queue</button>
              <button onClick={() => setSelected(new Set())} className="px-2 py-1 text-[9px] text-text-muted">Clear</button>
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex gap-0.5 border border-border-subtle/50 rounded-lg overflow-hidden">
            <button onClick={() => handleViewMode('grid')} className={`p-1.5 transition-all ${viewMode === 'grid' ? 'bg-neon-pink/20 text-neon-pink' : 'text-white/40 hover:text-white/60'}`}>
              <LayoutGrid size={12} />
            </button>
            <button onClick={() => handleViewMode('list')} className={`p-1.5 transition-all ${viewMode === 'list' ? 'bg-neon-pink/20 text-neon-pink' : 'text-white/40 hover:text-white/60'}`}>
              <List size={12} />
            </button>
          </div>

          {/* Group by toggle */}
          <button onClick={() => handleGroupBy(groupBy === 'album' ? 'none' : 'album')}
            className={`px-2 py-1 rounded-lg text-[9px] border transition-all ${groupBy === 'album' ? 'bg-neon-pink/20 border-neon-pink/30 text-neon-pink' : 'bg-white/5 border-white/10 text-white/40'}`}>
            Albums
          </button>

          {/* Sort */}
          <div className="flex gap-1">
            {SORT_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => handleSort(opt.key)}
                className={`px-2 py-1 rounded-lg text-[9px] border transition-all ${sortKey === opt.key ? 'bg-neon-pink/20 border-neon-pink/30 text-neon-pink' : 'bg-white/5 border-white/10 text-white/40'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Folder sidebar */}
      {showFolders && folderTree.length > 0 && (
        <div className="mb-4 bg-surface-card/50 border border-border-subtle/50 rounded-2xl p-2 max-h-48 overflow-y-auto backdrop-blur-xl">
          {renderFolderTree(folderTree)}
        </div>
      )}

      {viewMode === 'grid' && groupBy === 'album' && albums ? (
        /* Album grouping (grid) */
        <div className="space-y-10">
          {albums.map(([albumName, albumFiles]) => (
            <div key={albumName}>
              <div className="flex items-center gap-2 mb-4">
                <Disc3 size={14} className="text-neon-pink/60" />
                <h3 className="text-xs font-semibold text-neon-pink">{albumName}</h3>
                <span className="text-[9px] text-text-muted">({albumFiles.length})</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
                {albumFiles.map(f => {
                  const isSel = selected.has(f.name)
                  return (
                    <div key={f.name}
                      className={`relative group cursor-pointer rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] ${isSel ? 'ring-2 ring-neon-pink/50' : ''}`}
                      onClick={() => toggleSelect(f.name)} onDoubleClick={() => playTrack(f)}>
                      <div className="w-full aspect-square bg-gradient-to-br from-neon-pink/10 to-neon-cyan/10 flex items-center justify-center overflow-hidden">
                        {f.has_cover ? <img src={`/api/cover/${encodeURIComponent(f.name)}`} className="w-full h-full object-cover" /> : <MusicIcon />}
                      </div>
                      {/* Hover overlay with track info */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-white text-sm font-bold truncate">{f.title || f.name}</p>
                          <p className="text-white/70 text-xs truncate">{f.artist || 'Unknown'}</p>
                        </div>
                      </div>
                      {/* Selection indicator */}
                      {isSel && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-neon-pink flex items-center justify-center z-10"><span className="text-[9px] text-white font-bold">✓</span></div>}
                      {/* Download button */}
                      <button onClick={e => { e.stopPropagation(); cacheOffline(`/api/audio/${encodeURIComponent(f.name)}`, f.name) }}
                        className="absolute bottom-2 right-2 w-6 h-6 rounded-lg bg-surface-card/80 backdrop-blur-sm border border-border-subtle/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-neon-pink/20 z-10">
                        <Download size={10} className="text-neon-pink/60" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid view (no grouping) */
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center py-12"><p className="text-xs text-neon-pink/50">No songs match your search</p></div>
          ) : filtered.map(f => {
            const isSel = selected.has(f.name)
            return (
              <div key={f.name}
                className={`relative group cursor-pointer rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] ${isSel ? 'ring-2 ring-neon-pink/50' : ''}`}
                onClick={() => toggleSelect(f.name)} onDoubleClick={() => playTrack(f)}>
                <div className="w-full aspect-square bg-gradient-to-br from-neon-pink/10 to-neon-cyan/10 flex items-center justify-center overflow-hidden">
                  {f.has_cover ? <img src={`/api/cover/${encodeURIComponent(f.name)}`} className="w-full h-full object-cover" /> : <MusicIcon />}
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-white text-sm font-bold truncate">{f.title || f.name}</p>
                    <p className="text-white/70 text-xs truncate">{f.artist || 'Unknown'}</p>
                  </div>
                </div>
                {isSel && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-neon-pink flex items-center justify-center z-10"><span className="text-[9px] text-white font-bold">✓</span></div>}
                <button onClick={e => { e.stopPropagation(); cacheOffline(`/api/audio/${encodeURIComponent(f.name)}`, f.name) }}
                  className="absolute bottom-2 right-2 w-6 h-6 rounded-lg bg-surface-card/80 backdrop-blur-sm border border-border-subtle/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-neon-pink/20 z-10">
                  <Download size={10} className="text-neon-pink/60" />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        /* List view */
        <div className="space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-12"><p className="text-xs text-neon-pink/50">No songs match your search</p></div>
          ) : filtered.map(f => {
            const isSel = selected.has(f.name)
            return (
              <div key={f.name} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer ${isSel ? 'bg-neon-pink/10 border border-neon-pink/30' : 'bg-surface-card/30 border border-transparent hover:bg-surface-card/60 hover:border-border-subtle/50'}`}
                onClick={() => toggleSelect(f.name)} onDoubleClick={() => playTrack(f)}>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-pink/10 to-neon-cyan/10 shrink-0 flex items-center justify-center overflow-hidden">
                  {f.has_cover ? <img src={`/api/cover/${encodeURIComponent(f.name)}`} className="w-full h-full object-cover" /> : <MusicIconSmall />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{f.title || f.name}</p>
                  <p className="text-[10px] text-text-muted truncate">{f.artist || 'Unknown'}{f.album ? ` · ${f.album}` : ''}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); cacheOffline(`/api/audio/${encodeURIComponent(f.name)}`, f.name) }}
                  className="p-1 rounded-lg hover:bg-neon-pink/10 hover:text-neon-pink transition-all shrink-0 opacity-0 group-hover:opacity-100">
                  <Download size={10} />
                </button>
                {offlineTracks.includes(`/api/audio/${encodeURIComponent(f.name)}`) && (
                  <span className="text-[8px] text-neon-cyan/60 border border-neon-cyan/20 rounded-lg px-1 py-0.5 flex items-center gap-0.5">
                    <Download size={7} /> cached
                  </span>
                )}
                {(f as any).ingested && (
                  <span className="text-[8px] text-success/50 border border-success/20 rounded-lg px-1 py-0.5 flex items-center gap-0.5">
                    <Clock size={7} /> auto
                  </span>
                )}
                {isSel && <div className="w-4 h-4 rounded-full bg-neon-pink flex items-center justify-center shrink-0"><span className="text-[8px] text-white font-bold">✓</span></div>}
              </div>
            )
          })}
        </div>
      )}
      {hasMore && <div ref={sentinelRef} className="h-8" />}
    </div>
  )
}

function MusicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-neon-pink/40">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function MusicIconSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-neon-pink/40">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  )
}
