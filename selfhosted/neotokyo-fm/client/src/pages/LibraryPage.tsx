import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { listFiles, getMetadata } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { CardSkeleton } from '../components/ui/Skeleton'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../services/audioEngine'
import { storageGet, storageSet } from '../utils/storage'
import { Search, X } from 'lucide-react'
import type { FileMeta } from '../types/audio'

const SORT_OPTIONS = [
  { key: 'name_asc', label: 'Name ↑', compare: (a: FileMeta, b: FileMeta) => (a.title || a.name).localeCompare(b.title || b.name) },
  { key: 'name_desc', label: 'Name ↓', compare: (a: FileMeta, b: FileMeta) => (b.title || b.name).localeCompare(a.title || a.name) },
  { key: 'artist_asc', label: 'Artist ↑', compare: (a: FileMeta, b: FileMeta) => (a.artist || '').localeCompare(b.artist || '') },
  { key: 'date_desc', label: 'Newest', compare: (a: FileMeta, b: FileMeta) => b.modified - a.modified },
  { key: 'size_desc', label: 'Size ↓', compare: (a: FileMeta, b: FileMeta) => b.size - a.size },
]

function getSortKey(): string {
  return storageGet('library-sort', 'date_desc')
}

function setSortKey(key: string) {
  storageSet('library-sort', key)
}

export default function LibraryPage() {
  const [files, setFiles] = useState<FileMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [sortKey, setSortKeyState] = useState(getSortKey)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const setTrack = usePlayerStore(s => s.setTrack)
  const addToQueue = usePlayerStore(s => s.addToQueue)

  const loadFiles = useCallback(async () => {
    try {
      const data = await listFiles(50, offset)
      const withMeta = await Promise.all(
        data.files.map(async (f: { name: string; size: number; modified: number }) => {
          try {
            const meta = await getMetadata(f.name)
            return { ...f, ...meta }
          } catch { return { ...f, title: f.name, artist: null, album: null, album_art: null, has_cover: false, has_lyrics: false } }
        })
      )
      setFiles(prev => {
        const existing = new Set(prev.map(f => f.name))
        const unique = withMeta.filter(f => !existing.has(f.name))
        return [...prev, ...unique]
      })
      setOffset(prev => prev + withMeta.length)
      if (data.total <= offset + withMeta.length) setHasMore(false)
    } catch {
      showToast('Failed to load files', 'error')
    } finally {
      setLoading(false)
    }
  }, [offset])

  const fetched = useRef(false)
  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    loadFiles()
  }, [])
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore) loadFiles()
    })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadFiles])

  const handleSort = (key: string) => {
    setSortKeyState(key)
    setSortKey(key)
  }

  const sorted = useMemo(() => {
    const opt = SORT_OPTIONS.find(o => o.key === sortKey) || SORT_OPTIONS[0]
    return [...files].sort(opt.compare)
  }, [files, sortKey])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return sorted
    const q = searchQuery.toLowerCase()
    return sorted.filter(f => (f.title || f.name).toLowerCase().includes(q) || (f.artist || '').toLowerCase().includes(q))
  }, [sorted, searchQuery])

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const playTrack = (f: FileMeta) => {
    const tracks = sorted.map(x => ({
      title: x.title || x.name,
      artist: x.artist || undefined,
      url: `/api/audio/${encodeURIComponent(x.name)}`,
      albumArt: `/api/cover/${encodeURIComponent(x.name)}`,
    }))
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
    const tracks = selectedFiles.map(f => ({
      title: f.title || f.name,
      artist: f.artist || undefined,
      url: `/api/audio/${encodeURIComponent(f.name)}`,
      albumArt: `/api/cover/${encodeURIComponent(f.name)}`,
    }))
    const store = usePlayerStore.getState()
    store.setQueue(tracks)
    store.setTrack(tracks[0])
    audioEngine.playTrack(tracks[0])
    setSelected(new Set())
  }

  const queueSelected = () => {
    const selectedFiles = sorted.filter(f => selected.has(f.name))
    for (const f of selectedFiles) {
      addToQueue({ title: f.title || f.name, artist: f.artist || undefined, url: `/api/audio/${encodeURIComponent(f.name)}` })
    }
    showToast(`Added ${selectedFiles.length} to queue`, 'success')
    setSelected(new Set())
  }

  if (loading && files.length === 0) return <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-pink-400">Library ({searchQuery ? filtered.length : files.length})</h2>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex items-center">
            <Search size={12} className="absolute left-2 text-pink-400/50 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search songs..."
              className="w-32 pl-6 pr-6 py-1.5 bg-[#1d1e31] border border-[#2a2a4a] rounded text-[10px] text-white placeholder:text-[#5c3f45] focus:outline-none focus:border-pink-500/50 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-1.5 text-pink-400/50 hover:text-pink-400">
                <X size={10} />
              </button>
            )}
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-pink-400">{selected.size} selected</span>
              <button onClick={playSelected} className="px-2 py-1 text-[9px] bg-green-500/20 border border-green-400/30 rounded text-green-300">Play</button>
              <button onClick={queueSelected} className="px-2 py-1 text-[9px] bg-cyan-500/20 border border-cyan-400/30 rounded text-cyan-300">Queue</button>
              <button onClick={() => setSelected(new Set())} className="px-2 py-1 text-[9px] text-[#5c3f45]">Clear</button>
            </div>
          )}
          <div className="flex gap-1">
            {SORT_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => handleSort(opt.key)}
                className={`px-2 py-1 rounded text-[9px] border transition-all ${
                  sortKey === opt.key ? 'bg-pink-500/20 border-pink-400/40 text-pink-300' : 'bg-white/5 border-white/10 text-white/40'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-xs text-pink-400/50">No songs match your search</p>
          </div>
        ) : filtered.map(f => {
          const isSel = selected.has(f.name)
          return (
            <div key={f.name}
              className={`relative bg-[#1d1e31]/50 border rounded-lg p-2 text-left transition-all group cursor-pointer ${
                isSel ? 'border-pink-500/50 ring-1 ring-pink-500/30' : 'border-[#2a2a4a]/50 hover:border-pink-500/30'
              }`}
              onClick={() => toggleSelect(f.name)}
              onDoubleClick={() => playTrack(f)}
            >
              <div className="w-full aspect-square rounded bg-gradient-to-br from-pink-500/10 to-cyan-500/10 mb-1.5 flex items-center justify-center overflow-hidden">
                {f.has_cover ? (
                  <img src={`/api/cover/${encodeURIComponent(f.name)}`} className="w-full h-full object-cover" alt="" />
                ) : (
                  <MusicIcon />
                )}
                {isSel && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center">
                    <span className="text-[8px] text-white font-bold">✓</span>
                  </div>
                )}
              </div>
              <p className="text-xs font-medium truncate">{f.title || f.name}</p>
              <p className="text-[9px] text-[#5c3f45] truncate">{f.artist || 'Unknown'}</p>
            </div>
          )
        })}
      </div>
      {hasMore && <div ref={sentinelRef} className="h-8" />}
    </div>
  )
}

function MusicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-pink-400/40">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  )
}
