import { NavLink } from 'react-router-dom'
import { Home, Radio, Music, Monitor, ListMusic, Rss, Settings, Shield, SlidersHorizontal } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import { isLoggedIn } from '../../services/grabberAPI'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

const discoverItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/radio', icon: Radio, label: 'Radio' },
  { to: '/library', icon: Music, label: 'Library' },
  { to: '/youtube', icon: Monitor, label: 'YouTube' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/podcasts', icon: Rss, label: 'Podcasts' },
]

export default function Sidebar() {
  const currentTrack = usePlayerStore(s => s.currentTrack)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const navigate = useNavigate()
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleAdminClick = () => {
    if (isLoggedIn()) {
      navigate('/admin')
    } else {
      navigate('/admin/login', { state: { from: '/admin' } })
    }
  }

  return (
    <aside className="hidden md:flex w-64 shrink-0 bg-surface-base/90 backdrop-blur-xl border-r border-white/5 flex-col justify-between h-full pb-[88px] relative z-20">
      <div className="flex flex-col gap-6 p-5">
        {/* Logo Block */}
        <div className="flex items-center gap-3 select-none py-1">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-neon-pink flex items-center justify-center font-mono font-bold text-white text-base shadow-glow-pink-sm animate-spin-slow">
              🗼
            </div>
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-cyan opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-cyan"></span>
            </span>
          </div>
          <div className="flex flex-col text-left">
            <span className="font-sans text-sm font-black tracking-tight uppercase text-gradient-neon">
              NeoTokyoFM
            </span>
            <span className="font-mono text-[8px] text-gray-500 tracking-wider">80S HI-FI STATIONS</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-col gap-1 text-left">
          <span className="font-mono text-[9px] text-gray-500 font-bold tracking-widest px-2.5 pb-2 uppercase">Discover</span>

          {discoverItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                  isActive
                    ? 'bg-neon-pink/15 text-neon-pink border border-neon-pink/20 shadow-sm font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`
              }
              aria-label={item.label}
            >
              <item.icon size={16} className="shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Utility section */}
          <div className="mt-3 pt-2 border-t border-white/5 flex flex-col gap-1">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-3.5 py-1.5 rounded-xl text-[11px] font-semibold tracking-wide transition-all ${
                  isActive ? 'text-neon-cyan font-bold' : 'text-gray-500 hover:text-white'
                }`
              }
              aria-label="Settings"
            >
              <Settings size={14} className="shrink-0" />
              <span>Settings</span>
            </NavLink>

            <button
              onClick={handleAdminClick}
              className="w-full flex items-center gap-3 px-3.5 py-1.5 rounded-xl text-[11px] font-semibold tracking-wide transition-all text-gray-500 hover:text-white"
              aria-label="Admin Panel"
            >
              <Shield size={14} className="shrink-0" />
              <span>Admin Portal</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mini Now Playing Card */}
      {currentTrack && (
        <div className="mx-5 mb-5 rounded-2xl p-3 bg-black/40 border border-white/5 flex flex-col gap-2 relative overflow-hidden group select-none hover:border-neon-pink/30 transition-all cursor-pointer text-left">
          <div className="flex items-center gap-2.5">
            <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-neutral-800">
              {currentTrack.albumArt ? (
                <img
                  src={currentTrack.albumArt}
                  alt={currentTrack.title}
                  className={`w-full h-full object-cover ${isPlaying ? 'animate-spin-slow' : ''}`}
                />
              ) : (
                <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
                  <Music size={14} className="text-gray-600" />
                </div>
              )}
            </div>
            <div className="flex flex-col text-left truncate flex-1 min-w-0">
              <span className="text-xs font-bold text-white truncate">{currentTrack.title}</span>
              <span className="text-[10px] text-gray-500 truncate">{currentTrack.artist || 'Unknown'}</span>
            </div>
          </div>
          <div className="flex items-center justify-between font-mono text-[8px] text-gray-500 border-t border-white/5 pt-2 mt-1">
            <span className="text-neon-cyan animate-pulse">NOW PLAYING</span>
            <span>{time || '--:--:--'}</span>
          </div>
        </div>
      )}
    </aside>
  )
}
