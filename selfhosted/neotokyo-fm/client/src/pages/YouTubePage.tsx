import { useState } from 'react'
import { searchYouTube } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../services/audioEngine'
import { Search, Monitor } from 'lucide-react'
import type { YTSearchResult } from '../types/audio'

export default function YouTubePage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YTSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const setTrack = usePlayerStore(s => s.setTrack)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const data = await searchYouTube(query)
      setResults(data.results)
    } catch { showToast('Search failed', 'error') }
    setLoading(false)
  }

  const playTrack = (r: YTSearchResult) => {
    const videoId = r.url.split('v=')[1]?.split('&')[0] || r.url.split('/').pop()
    const track = { title: r.title, artist: r.uploader, url: `/api/yt-proxy/${videoId}`, albumArt: r.thumbnail }
    setTrack(track)
    audioEngine.playTrack(track)
  }

  return (
    <div className="p-6">
      <h2 className="text-sm font-bold text-pink-400 mb-4">YouTube</h2>
      <div className="flex gap-2 mb-4">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search YouTube..."
          className="flex-1 px-3 py-2 bg-[#1d1e31] border border-[#2a2a4a] rounded text-xs focus:outline-none focus:border-pink-500/50" />
        <button onClick={handleSearch} disabled={loading}
          className="px-3 py-2 bg-pink-500/20 border border-pink-400/30 rounded text-xs text-pink-300 hover:bg-pink-500/30">
          <Search size={14} />
        </button>
      </div>
      {loading && <p className="text-xs text-[#5c3f45]">Searching...</p>}
      <div className="space-y-2">
        {results.map(r => (
          <button key={r.url} onClick={() => playTrack(r)}
            className="flex items-center gap-3 w-full bg-[#1d1e31]/50 border border-[#2a2a4a]/50 rounded-lg p-3 text-left hover:border-pink-500/30 transition-all">
            <div className="w-10 h-10 rounded bg-[#0b0c1f] flex items-center justify-center shrink-0 overflow-hidden">
              {r.thumbnail ? <img src={r.thumbnail} className="w-full h-full object-cover" alt="" /> : <Monitor size={14} className="text-pink-400/40" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">{r.title}</p>
              <p className="text-[10px] text-[#5c3f45]">{r.uploader} · {formatDuration(r.duration)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
