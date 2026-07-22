import { useEffect, useState } from 'react'
import { Outlet, useLocation, NavLink } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomPlayerBar from '../player/BottomPlayerBar'
import NowPlayingOverlay from '../player/NowPlayingOverlay'
import LyricsOverlay from '../player/LyricsOverlay'
import EQPanel from '../player/EQPanel'
import StreamToast from '../ui/StreamToast'
import ShortcutCheatsheet from '../ui/ShortcutCheatsheet'
import InstallPrompt from '../ui/InstallPrompt'
import PageTransition from '../ui/PageTransition'
import ErrorBoundary from '../ErrorBoundary'
import { usePlayerStore } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { Menu, X, Home, Radio, Music, Monitor, ListMusic, Rss, Settings, Shield, Sun, Moon } from 'lucide-react'

const mobileNavItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/radio', icon: Radio, label: 'Radio' },
  { to: '/library', icon: Music, label: 'Library' },
  { to: '/youtube', icon: Monitor, label: 'YouTube' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/podcasts', icon: Rss, label: 'Podcasts' },
]

export default function AppShell() {
  const currentTrack = usePlayerStore(s => s.currentTrack)
  const setTrack = usePlayerStore(s => s.setTrack)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [time, setTime] = useState('')
  const location = useLocation()
  useKeyboardShortcuts()

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const recentTracks = usePlayerStore.getState().recentlyPlayed
    if (currentTrack) {
      audioEngine.playTrack(currentTrack)
      if (recentTracks.length > 1) {
        usePlayerStore.getState().setQueue(
          recentTracks.filter(t => t.url !== currentTrack.url)
        )
      }
    } else {
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
  }, [])

  return (
    <div className="h-full flex flex-col bg-surface-base overflow-hidden relative">
      {/* Background decorative elements (dark mode) */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-neon-pink/10 blur-[130px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-neon-cyan/10 blur-[130px] pointer-events-none z-0" />
      <div className="absolute inset-0 retro-grid opacity-20 pointer-events-none z-0" />

      {/* Mobile Header */}
      <div className="md:hidden w-full px-4 py-3 flex items-center justify-between border-b border-white/5 z-30 relative bg-surface-base/90 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white"
          >
            <Menu size={20} />
          </button>
          <span className="font-sans text-sm font-black tracking-tight uppercase text-gradient-neon">
            NeoTokyoFM
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-neon-pink font-bold">{time}</span>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed top-0 bottom-0 left-0 w-64 z-50 p-5 flex flex-col justify-between bg-surface-base border-r border-white/10">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-neon-cyan font-bold tracking-widest">TOKYO DIRECTORY</span>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-lg hover:bg-white/5 text-gray-500">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-1.5 text-left">
                {mobileNavItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-neon-pink/15 text-neon-pink border border-neon-pink/20'
                          : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`
                    }
                  >
                    <item.icon size={16} className="text-neon-pink shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}

                <div className="mt-2 pt-2 border-t border-white/5">
                  <NavLink to="/settings" className={({ isActive }) => `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${isActive ? 'text-neon-cyan' : 'text-gray-500 hover:text-white'}`}>
                    <Settings size={16} className="text-neon-pink shrink-0" />
                    <span>Settings</span>
                  </NavLink>
                </div>
              </div>
            </div>

            <div className="p-3 bg-black/30 rounded-xl border border-white/5 flex flex-col gap-1 text-left">
              <span className="font-mono text-[8px] text-gray-500">SYSTEM STATUS</span>
              <span className="text-[10px] text-neon-cyan font-bold tracking-wider">SHINJUKU ANTENNA: ON</span>
            </div>
          </div>
        </>
      )}

      {/* Main content area */}
      <div className="flex-1 flex min-h-0 relative z-10">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-y-auto pb-[72px]">
            <ErrorBoundary>
              <PageTransition><Outlet /></PageTransition>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <BottomPlayerBar />
      <NowPlayingOverlay />
      <LyricsOverlay />
      <EQPanel />
      <StreamToast />
      <InstallPrompt />
      <ShortcutCheatsheet />
    </div>
  )
}
