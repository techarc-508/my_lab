import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import RequireAuth from './RequireAuth'
import { logout } from '../services/grabberAPI'
import { usePlayerStore } from '../stores/playerStore'
import { BarChart3, Download, Radio, Rss, Shield, Settings, FileText, Globe, Music, LogOut, MicVocal, Image, FolderOpen, Headphones, Users } from 'lucide-react'

const navItems = [
  { to: '/admin', icon: BarChart3, label: 'Dashboard', end: true },
  { to: '/admin/import', icon: Download, label: 'Import' },
  { to: '/admin/radio', icon: Radio, label: 'Radio' },
  { to: '/admin/podcasts', icon: Rss, label: 'Podcasts' },
  { to: '/admin/songs', icon: Music, label: 'Songs' },
  { to: '/admin/lyrics', icon: MicVocal, label: 'Lyrics' },
  { to: '/admin/browse', icon: FolderOpen, label: 'Browse' },
  { to: '/admin/scanner', icon: Image, label: 'Album Art' },
  { to: '/admin/webhooks', icon: Globe, label: 'Webhooks' },
  { to: '/admin/backups', icon: Shield, label: 'Backups' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
  { to: '/admin/logs', icon: FileText, label: 'Logs' },
  { to: '/admin/users', icon: Users, label: 'Users' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const currentTrack = usePlayerStore(s => s.currentTrack)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const [showNowPlaying, setShowNowPlaying] = useState(false)

  const handleLogout = async () => {
    try { await logout() } catch {}
    navigate('/admin/login')
  }

  return (
    <RequireAuth>
      <div className="h-full flex bg-surface-deep">
        <aside className="w-56 bg-surface-base border-r border-border-default/50 flex flex-col shrink-0">
          <div className="p-5 border-b border-border-default/30">
            <h2 className="text-lg font-display tracking-[2px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple leading-none">
              NEOTOKYO
            </h2>
            <p className="text-[10px] font-body text-content-tertiary tracking-[3px] uppercase mt-0.5">Admin Panel</p>
          </div>
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navItems.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-body transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-hot-pink/20 to-purple/20 text-white border-l-2 border-hot-pink shadow-glow-pink-sm'
                      : 'text-content-tertiary hover:text-white hover:bg-white/[0.04] border-l-2 border-transparent'
                  }`
                }
              >
                <item.icon size={14} />
                <span className="tracking-[0.5px]">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="p-4 border-t border-border-default/30 space-y-2">
            <button onClick={handleLogout} className="flex items-center gap-2 text-[11px] font-body text-error/60 hover:text-error transition-colors w-full">
              <LogOut size={12} /> Logout
            </button>
            <NavLink to="/" className="block text-[10px] font-body text-content-tertiary hover:text-white transition-colors">
              ← Back to Player
            </NavLink>
          </div>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar with Now Playing hover */}
          <div className="h-10 border-b border-border-default/20 flex items-center justify-end px-4 gap-2 shrink-0">
            {currentTrack && (
              <div className="relative"
                onMouseEnter={() => setShowNowPlaying(true)}
                onMouseLeave={() => setShowNowPlaying(false)}
              >
                <button className="flex items-center gap-1.5 text-[10px] font-body text-content-tertiary hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/[0.04]">
                  <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-success animate-pulse' : 'bg-content-tertiary'}`} />
                  <Headphones size={11} />
                  <span className="max-w-[120px] truncate">{currentTrack.title}</span>
                </button>
                {showNowPlaying && (
                  <div className="absolute top-full right-0 mt-1 w-56 bg-surface-raised border border-border-default/50 rounded-lg shadow-xl p-3 z-50">
                    <div className="flex items-start gap-2">
                      {currentTrack.albumArt && (
                        <img src={currentTrack.albumArt} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-body text-content-primary truncate leading-tight">{currentTrack.title}</p>
                        {currentTrack.artist && <p className="text-[10px] font-body text-content-tertiary truncate mt-0.5">{currentTrack.artist}</p>}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-success animate-pulse' : 'bg-content-tertiary'}`} />
                          <span className="text-[9px] font-body text-content-tertiary">{isPlaying ? 'Playing' : 'Paused'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </RequireAuth>
  )
}
