import { useState, useEffect, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { checkAuth, ensureCsrfToken } from '../services/grabberAPI'
import { PageSkeleton } from '../components/ui/Skeleton'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading')
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const timeout = setTimeout(() => setStatus('invalid'), 5000)
    ensureCsrfToken().then(() =>
      checkAuth()
        .then(r => { clearTimeout(timeout); setStatus(r.auth ? 'valid' : 'invalid') })
        .catch(() => { clearTimeout(timeout); setStatus('invalid') })
    )
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (status === 'invalid') {
      navigate('/admin/login', { state: { from: location.pathname }, replace: true })
    }
  }, [status, navigate, location.pathname])

  if (status === 'loading') return <PageSkeleton />
  if (status === 'invalid') return null
  return <>{children}</>
}
