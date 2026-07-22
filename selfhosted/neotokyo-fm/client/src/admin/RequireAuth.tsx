import { useState, useEffect, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { checkAuth, getAuthToken } from '../services/grabberAPI'
import { usePlayerStore } from '../stores/playerStore'
import { PageSkeleton } from '../components/ui/Skeleton'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading')
  const navigate = useNavigate()
  const location = useLocation()
  const setUser = usePlayerStore(s => s.setUser)

  useEffect(() => {
    if (!getAuthToken()) { setStatus('invalid'); return }
    const timeout = setTimeout(() => setStatus('invalid'), 5000)
    checkAuth()
      .then(r => {
        clearTimeout(timeout)
        if (r.auth && r.username) setUser(r.username, r.role || 'user')
        setStatus(r.auth ? 'valid' : 'invalid')
      })
      .catch(() => { clearTimeout(timeout); setStatus('invalid') })
    return () => clearTimeout(timeout)
  }, [setUser])

  useEffect(() => {
    if (status === 'invalid') {
      navigate('/admin/login', { state: { from: location.pathname }, replace: true })
    }
  }, [status, navigate, location.pathname])

  if (status === 'loading') return <PageSkeleton />
  if (status === 'invalid') return null
  return <>{children}</>
}
