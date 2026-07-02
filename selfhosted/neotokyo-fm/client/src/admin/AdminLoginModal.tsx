import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { login, ensureCsrfToken } from '../services/grabberAPI'
import { LogIn, Shield } from 'lucide-react'

export default function AdminLoginModal() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as any)?.from || '/admin'

  useEffect(() => {
    ensureCsrfToken().then(() => setLoading(false))
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(username, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
    setLoading(false)
  }

  return (
    <div className="h-full flex items-center justify-center" style={{ background: '#0A0A2E' }}>
      <form onSubmit={handleLogin} className="w-80 bg-surface-raised border border-border-default/50 rounded-lg p-6 space-y-4 shadow-glow-combo">
        <div className="flex flex-col items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-hot-pink to-purple flex items-center justify-center shadow-glow-pink-md">
            <Shield size={22} className="text-white" />
          </div>
          <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple leading-none">
            NEOTOKYO
          </h2>
          <p className="text-[10px] font-body text-content-tertiary tracking-[2px] uppercase">Admin Access</p>
        </div>
        {error && <p className="text-error text-[11px] font-body text-center bg-error/10 border border-error/20 rounded px-2 py-1">{error}</p>}
        <div className="space-y-3">
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username"
            className="w-full px-3 py-2.5 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password"
            className="w-full px-3 py-2.5 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2.5 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white text-xs font-body font-medium tracking-[1px] uppercase hover:brightness-110 active:brightness-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-glow-pink-sm flex items-center justify-center gap-2">
          <LogIn size={14} /> {loading ? 'Loading...' : 'Login'}
        </button>
        <button type="button" onClick={() => navigate('/')} className="w-full text-[10px] font-body text-content-tertiary hover:text-white transition-colors">
          ← Back to Player
        </button>
      </form>
    </div>
  )
}
