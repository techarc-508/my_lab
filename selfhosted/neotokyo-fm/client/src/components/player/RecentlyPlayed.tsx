import { useState } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'
import { Clock, Music, Play } from 'lucide-react'

export default function RecentlyPlayed() {
  const [open, setOpen] = useState(false)
  const recentlyPlayed = usePlayerStore(s => s.recentlyPlayed)
  const setTrack = usePlayerStore(s => s.setTrack)

  const playTrack = (t: typeof recentlyPlayed[0]) => {
    setTrack(t)
    audioEngine.playTrack(t)
    setOpen(false)
  }

  if (recentlyPlayed.length === 0) return null

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[10px] text-text-muted hover:text-white">
        <Clock size={12} /> Recent
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-surface-deep border border-border-subtle/50 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
          <div className="p-2 space-y-1">
            {recentlyPlayed.map((t, i) => (
              <button key={`${t.url}-${i}`} onClick={() => playTrack(t)}
                className="flex items-center gap-2 text-xs p-2 rounded w-full text-left hover:bg-white/5 group">
                <div className="w-6 h-6 rounded bg-surface-card flex items-center justify-center shrink-0">
                  {t.albumArt ? <img src={t.albumArt} className="w-full h-full object-cover rounded" /> : <Music size={10} className="text-text-muted" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{t.title}</p>
                  {t.artist && <p className="text-[10px] text-text-muted truncate">{t.artist}</p>}
                </div>
                <Play size={10} className="text-pink-400/0 group-hover:text-pink-400/60" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
