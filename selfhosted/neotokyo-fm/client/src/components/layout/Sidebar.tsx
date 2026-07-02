import { NavLink } from 'react-router-dom'
import { Home, Radio, Music, Monitor, ListMusic, Settings, Disc3 } from 'lucide-react'

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/radio', icon: Radio, label: 'Radio' },
  { to: '/library', icon: Music, label: 'Library' },
  { to: '/youtube', icon: Monitor, label: 'YouTube' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists' },
]

export default function Sidebar() {
  return (
    <aside className="w-[72px] bg-surface-base flex flex-col items-center shrink-0 h-full border-r border-border-default/30">
      {/* Brand Logo */}
      <div className="pt-4 pb-3">
        <NavLink to="/" className="block" aria-label="Home">
          <div className="w-11 h-11 rounded-full bg-surface-sunken flex items-center justify-center border-2 border-brand-logo-ring">
            <Disc3 size={20} className="text-brand-light" />
          </div>
        </NavLink>
      </div>

      {/* Nav Icons */}
      <nav className="flex-1 flex flex-col items-center gap-1 px-2">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `w-11 h-11 rounded-md flex items-center justify-center transition-all ${
                isActive
                  ? 'text-brand bg-white/10'
                  : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
              }`
            }
            aria-label={item.label}
          >
            <item.icon size={18} />
          </NavLink>
        ))}
      </nav>

      {/* Settings at bottom */}
      <div className="pb-4">
        <NavLink
          to="/admin/settings"
          className={({ isActive }) =>
            `w-11 h-11 rounded-md flex items-center justify-center transition-all ${
              isActive ? 'text-brand bg-white/10' : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
            }`
          }
          aria-label="Settings"
        >
          <Settings size={18} />
        </NavLink>
      </div>
    </aside>
  )
}
