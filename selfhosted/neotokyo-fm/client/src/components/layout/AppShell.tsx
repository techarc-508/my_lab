import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import PlayerPanel from '../player/PlayerPanel'
import LyricsOverlay from '../player/LyricsOverlay'
import EQPanel from '../player/EQPanel'
import ScanlineOverlay from '../ui/ScanlineOverlay'
import StreamToast from '../ui/StreamToast'
import ShortcutCheatsheet from '../ui/ShortcutCheatsheet'
import ErrorBoundary from '../ErrorBoundary'
import { usePlayerStore } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { Play, Pause, Music } from 'lucide-react'

function MobileMiniPlayer() {
  const track = usePlayerStore(s => s.currentTrack)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const navigate = useNavigate()
  if (!track) return null
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-raised/95 backdrop-blur-lg border-t border-border-default/50">
      <button onClick={() => navigate('/')} className="flex items-center gap-3 px-3 py-2 w-full text-left">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-hot-pink/10 to-cyan-500/10 flex items-center justify-center overflow-hidden shrink-0">
          {track.albumArt ? (
            <img src={track.albumArt} className="w-full h-full object-cover" alt="" />
          ) : (
            <Music size={14} className="text-hot-pink/60" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate text-content-primary">{track.title}</p>
          {track.artist && <p className="text-[10px] text-content-tertiary truncate">{track.artist}</p>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); audioEngine.togglePlay() }} className="p-2" aria-label="Toggle play">
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </button>
    </div>
  )
}

export default function AppShell() {
  const currentTrack = usePlayerStore(s => s.currentTrack)
  const setTrack = usePlayerStore(s => s.setTrack)
  useKeyboardShortcuts()

  useEffect(() => {
    const recentTracks = usePlayerStore.getState().recentlyPlayed
    if (currentTrack) {
      audioEngine.playTrack(currentTrack)
      // Populate queue from recently played so auto-advance works after resume
      if (recentTracks.length > 1) {
        usePlayerStore.getState().setQueue(
          recentTracks.filter(t => t.url !== currentTrack.url)
        )
      }
    } else {
      // No persisted track — play a random song from library
      fetch('/api/files')
        .then(r => r.json())
        .then(data => {
          const total = data.total || 0
          if (total > 0) {
            const offset = Math.floor(Math.random() * total)
            return fetch(`/api/files?limit=1&offset=${offset}`).then(r => r.json())
          }
          return null
        })
        .then(data => {
          if (data?.files?.[0]) {
            const f = data.files[0]
            const track = {
              title: f.title || f.name,
              artist: f.artist || undefined,
              url: `/api/audio/${encodeURIComponent(f.name)}`,
              albumArt: `/api/cover/${encodeURIComponent(f.name)}`,
            }
            setTrack(track)
            audioEngine.playTrack(track)
            if (recentTracks.length > 0) {
              usePlayerStore.getState().setQueue(
                recentTracks.filter(t => t.url !== track.url)
              )
            }
          }
        })
        .catch(() => {})
    }
  }, []) // only on mount

  return (
    <div className="h-full flex bg-surface-base overflow-hidden">
      <Sidebar />
      <PlayerPanel />
      <div className="flex-1 flex flex-col min-w-0 bg-surface-base">
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <MobileMiniPlayer />
      <LyricsOverlay />
      <EQPanel />
      <ScanlineOverlay />
      <StreamToast />
      <ShortcutCheatsheet />
    </div>
  )
}
