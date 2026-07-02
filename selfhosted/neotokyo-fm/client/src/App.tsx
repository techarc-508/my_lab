import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import AdminLayout from './admin/AdminLayout'
import AdminLoginModal from './admin/AdminLoginModal'
import { PageSkeleton } from './components/ui/Skeleton'
import { usePlayerStore } from './stores/playerStore'

const HomePage = lazy(() => import('./pages/HomePage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const RadioPage = lazy(() => import('./pages/RadioPage'))
const YouTubePage = lazy(() => import('./pages/YouTubePage'))
const PlaylistsPage = lazy(() => import('./pages/PlaylistsPage'))
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'))
const AdminImport = lazy(() => import('./admin/AdminImport'))
const AdminRadio = lazy(() => import('./admin/AdminRadio'))
const AdminBackups = lazy(() => import('./admin/AdminBackups'))
const AdminSettings = lazy(() => import('./admin/AdminSettings'))
const AdminLogs = lazy(() => import('./admin/AdminLogs'))
const AdminWebhooks = lazy(() => import('./admin/AdminWebhooks'))
const AdminBrowse = lazy(() => import('./admin/AdminBrowse'))
const AdminSongs = lazy(() => import('./admin/AdminSongs'))
const AdminScanner = lazy(() => import('./admin/AdminScanner'))
const AdminLyrics = lazy(() => import('./admin/AdminLyrics'))

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
}

export default function App() {
  const theme = usePlayerStore(s => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Lazy><HomePage /></Lazy>} />
        <Route path="/library" element={<Lazy><LibraryPage /></Lazy>} />
        <Route path="/radio" element={<Lazy><RadioPage /></Lazy>} />
        <Route path="/youtube" element={<Lazy><YouTubePage /></Lazy>} />
        <Route path="/playlists" element={<Lazy><PlaylistsPage /></Lazy>} />
      </Route>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Lazy><AdminDashboard /></Lazy>} />
        <Route path="dashboard" element={<Lazy><AdminDashboard /></Lazy>} />
        <Route path="import" element={<Lazy><AdminImport /></Lazy>} />
        <Route path="radio" element={<Lazy><AdminRadio /></Lazy>} />
        <Route path="backups" element={<Lazy><AdminBackups /></Lazy>} />
        <Route path="settings" element={<Lazy><AdminSettings /></Lazy>} />
        <Route path="webhooks" element={<Lazy><AdminWebhooks /></Lazy>} />
        <Route path="browse" element={<Lazy><AdminBrowse /></Lazy>} />
        <Route path="songs" element={<Lazy><AdminSongs /></Lazy>} />
        <Route path="logs" element={<Lazy><AdminLogs /></Lazy>} />
        <Route path="scanner" element={<Lazy><AdminScanner /></Lazy>} />
        <Route path="lyrics" element={<Lazy><AdminLyrics /></Lazy>} />
      </Route>
      <Route path="/admin/login" element={<AdminLoginModal />} />
    </Routes>
  )
}
