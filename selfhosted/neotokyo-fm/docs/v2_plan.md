# NEOTOKYO FM — v2 Stable Release Plan

> Timeline: Step Zero (Dashboard) → UI Redesign → Core Polish → PWA/Mobile → Multi-User → Infra → Subsonic

---

## Table of Contents

1. [Step Zero — VM Service Dashboard](#step-zero--vm-service-dashboard)
2. [Priority 1 — UI Redesign](#priority-1--ui-redesign)
3. [Priority 2 — Core Feature Polish](#priority-2--core-feature-polish)
4. [Priority 3 — PWA / Mobile Experience](#priority-3--pwa--mobile-experience)
5. [Priority 4 — Multi-User Support](#priority-4--multi-user-support)
6. [Priority 5 — Performance & Infrastructure](#priority-5--performance--infrastructure)
7. [Priority 6 — Subsonic API](#priority-6--subsonic-api)
8. [Tech Stack Assessment](#tech-stack-assessment)

---

## Step Zero — VM Service Dashboard

**Goal**: A lightweight web app (like Windows Task Manager) showing every custom and system service running on this VM — status, resource usage, logs, and start/stop controls.

### Scope

| Feature | Detail |
|---------|--------|
| **Service list** | systemd units + custom services (neotokyo-grabber, neotokyo-player, dashboard itself, nginx, docker, etc.) |
| **Status indicators** | Running / Stopped / Failed / Enabled / Disabled |
| **Resource usage** | PID, CPU%, MEM%, uptime, port |
| **Log viewer** | Live tail of each service's log via SSE |
| **Controls** | Start / Stop / Restart / Enable / Disable per service |
| **System health** | VM CPU, memory, disk, network, uptime |
| **Quick links** | Open player (:3000), open admin (:5050/admin), open API (:5050/health) |
| **Auto-start** | Own systemd unit on port 9099 |

### Implementation

- **Stack**: Python Flask + plain HTML/JS/CSS (zero npm, no build step)
- **Location**: `/mnt/data/projects/dashboard/` (separate project, not published to GitHub unless it grows)
- **Port**: 9099
- **Systemd**: `vm-dashboard.service`
- **Key integration**: reads systemd status via `systemctl`, reads `/proc` for resource data, SSE for live logs

---

## Priority 1 — UI Redesign

**Goal**: Premium, polished UI on par with modern music players (Spotify, YouTube Music).

### 1.1 Bottom Player Bar

- Replace fixed 320px left player panel with a compact bottom bar (~72px)
- Controls: album art thumb, track title, artist, play/pause, prev/next, progress bar, volume, queue toggle, like, EQ toggle, lyrics toggle
- Click bar → slide-up overlay with full album art + controls + queue + EQ + lyrics
- Mobile: same bar with larger touch targets, full-screen bottom sheet on tap
- **Files**: `PlayerPanel.tsx`, `AppShell.tsx`

### 1.2 Album Art Color Extraction

- New hook: `hooks/useAlbumColor.ts`
- On image load, extract dominant colors via `<canvas>` + `getImageData`
- Apply as ambient background gradient on player bar, overlay, and home page hero
- Fallback to brand colors when no art loaded
- **New file**: `hooks/useAlbumColor.ts`

### 1.3 Color Token Audit

- Replace all hardcoded hex colors (`#1d1e31`, `#0A0A2E`, `#5c3f45`, `#2a2a4a`, `#0b0c1f`) with CSS variables
- New variables: `--color-surface-card`, `--color-surface-deep`, `--color-text-muted`, `--color-border-subtle`, `--color-surface-dropdown`
- Affected files: 20+ component files in `components/`, `pages/`, `admin/`

### 1.4 Light Theme Rework

- Audit all surfaces for light-mode contrast
- Ensure `.dark` class toggling works uniformly
- Fix any remaining hardcoded dark colors that break light mode

### 1.5 Animated Page Transitions

- Add `framer-motion` or pure CSS `@keyframes` transitions
- Page enters: fade-up + scale (300ms)
- Player state toggles: icon rotations, panel slide-in/out
- Library grid: stagger children on appear

### 1.6 Mobile Bottom Sheet

- <768px: thicker bar (64px), full-screen now-playing overlay
- Swipe-down to dismiss
- Queue accessible via button, slides up as panel

### 1.7 Sidebar Enhancement

- Keep 72px icons but add hover tooltips
- Add queue count badge, now-playing indicator dot
- Optionally expandable sidebar (collapsed/expanded modes)

### 1.8 Scanline Overlay Toggle

- Add `scanlines: boolean` to player store
- Toggle from settings or keyboard shortcut
- Default: on (preserves retro aesthetic)

### 1.9 Micro-interactions

- Play/pause: smooth scale bounce on click
- Sliders: glow effect on drag
- Cards: elevation on hover, subtle border glow
- Like button: heart fill animation + bounce

---

## Priority 2 — Core Feature Polish

### 2.1 Radio Reliability

| Sub-step | Files |
|----------|-------|
| 2.1a Graceful failure: show "Station offline" state when stream fails | `RadioPage.tsx` |
| 2.1b Station connectivity test with green/red indicator | `AdminRadio.tsx`, `routes/radio.py` |
| 2.1c Persistent now-playing cache in localStorage | `RadioPage.tsx` |
| 2.1d Drag-reorder in AdminRadio, save order | `AdminRadio.tsx` |
| 2.1e Genre color badges (per-genre Tailwind color) | `RadioPage.tsx` |
| 2.1f "Add custom station" on RadioPage (not just admin) | `RadioPage.tsx` |

### 2.2 YouTube Integration

| Sub-step | Files |
|----------|-------|
| 2.2a Display video thumbnails in search results | `YouTubePage.tsx` |
| 2.2b Search pagination with "Load More" | `YouTubePage.tsx` |
| 2.2c Playlist import from URL → download queue | `YouTubePage.tsx` |
| 2.2d Download completion toast notifications | `YouTubePage.tsx`, `StreamToast.tsx` |

### 2.3 Visualizer & Audio Engine

| Sub-step | Files |
|----------|-------|
| 2.3a Canvas resolution scaling for `devicePixelRatio` | `Visualizer.tsx`, all `visualizers/*` |
| 2.3b Frame rate governor (cancel RAF when hidden, cap at 30fps idle) | `Visualizer.tsx` |
| 2.3c EQ Panel polish: curve connecting sliders | `EQPanel.tsx` |
| 2.3d Crossfade duration slider in settings | `playerStore.ts`, new UI |
| 2.3e VU Meter: brand gradient, peak hold, smoother decay | `VUMeter.tsx` |

### 2.4 Lyrics System

| Sub-step | Files |
|----------|-------|
| 2.4a LocalStorage cache (key: `neotokyo-lyrics-<basename>`, 24h TTL) | `LyricsOverlay.tsx` |
| 2.4b Manual sync offset via Shift+↑/↓ (±0.5s), offset indicator | `LyricsOverlay.tsx` |
| 2.4c LRC file upload button | `LyricsOverlay.tsx`, `AdminLyrics.tsx` |
| 2.4d Submit form UX: guide overlay, character count | `LyricsOverlay.tsx` |

### 2.5 Admin Panel Polish

| Sub-step | Files |
|----------|-------|
| 2.5a Scanner progress bar with per-file status (SSE endpoint) | `AdminScanner.tsx`, `routes/admin.py` |
| 2.5b Inline click-to-edit for metadata cells | `AdminSongs.tsx` |
| 2.5c ConfirmDialog component for destructive actions | New component, all admin pages |
| 2.5d Log level filter tabs (INFO/WARN/ERROR) | `AdminLogs.tsx` |
| 2.5e Upload progress bar (XHR `upload.onprogress`) | `AdminUploads.tsx` |

### 2.6 Metadata & Library

| Sub-step | Files |
|----------|-------|
| 2.6a End-to-end bulk tag editor | `AdminSongs.tsx` |
| 2.6b List/Grid view toggle in LibraryPage | `LibraryPage.tsx` |
| 2.6c Album grouping for navigation | `LibraryPage.tsx` |

---

## Priority 3 — PWA / Mobile Experience

| Sub-step | Files |
|----------|-------|
| 3a Media Session API (`navigator.mediaSession`) | `audioEngine.ts` |
| 3b Background audio verification | Manual test |
| 3c Install prompt (`beforeinstallprompt`) | New component |
| 3d Touch gestures (swipe, long-press, pinch) | Player bar, library |
| 3e Service worker + manifest.json | `public/manifest.json`, new SW |

---

## Priority 4 — Multi-User Support

| Sub-step | Effort | Files |
|----------|--------|-------|
| 4a Users table in SQLite | 1 day | `models/db.py` |
| 4b `user_id` foreign keys on playlists, play_log, batches | 1 day | `models/db.py` |
| 4c Scope all 7 route files by user | 3-4 days | `routes/*.py` |
| 4d Registration UI + admin invite | 2 days | Frontend |
| 4e Scope Zustand store by user | 2 days | `playerStore.ts` |

---

## Priority 5 — Performance & Infrastructure

| Sub-step | Files |
|----------|-------|
| 5a Database indexes on frequently queried columns | `models/db.py` |
| 5b ESLint fix (add `typescript-eslint` parser) | `eslint.config.js` |
| 5c CI/CD: build + push Docker images to ghcr.io | `.github/workflows/` |
| 5d Client Docker HEALTHCHECK | `client/Dockerfile` |
| 5e Nginx gzip for JSON/audio/image types | `client/nginx.conf` |
| 5f Reconcile `deploy/*.fixed` patches | `deploy/` |
| 5g Fix stale doc references (`anomalyco` → `techarc-508`) | `docs/PROXMOX_DEPLOY.md` |

---

## Priority 6 — Subsonic API

Implement enough OpenSubsonic endpoints for one mobile client (Sonixd/DSub/Tempo):

| Endpoint | Route |
|----------|-------|
| `GET /rest/ping` | `GET /api/subsonic/ping` |
| `GET /rest/getMusicFolders` | `GET /api/subsonic/getMusicFolders` |
| `GET /rest/getArtists` | `GET /api/subsonic/getArtists` |
| `GET /rest/getAlbumList` | `GET /api/subsonic/getAlbumList` |
| `GET /rest/stream` | `GET /api/subsonic/stream` |
| `GET /rest/getCoverArt` | `GET /api/subsonic/getCoverArt` |
| `POST /rest/scrobble` | `POST /api/subsonic/scrobble` |

---

## Tech Stack Assessment

**Recommendation: Keep current stack (Flask + React). Do not rebuild.**

| Factor | Assessment |
|--------|------------|
| **75 API endpoints** across 7 route files | Migration to FastAPI/Go would take weeks |
| **Bottlenecks** | yt-dlp + ffmpeg I/O, not Python sync overhead |
| **Concurrent streaming** | gunicorn gthread (4 workers × 2 threads) handles single-user/family |
| **Frontend** | React 19 + Vite 6 + TypeScript 5.6 — modern and fast |
| **Database** | SQLite handles thousands of tracks fine |
| **Performance gains** | Indexes + caching + WebSocket > full rewrite |

If an upgrade path is ever needed:
1. Flask → FastAPI (same Python, async, auto-docs, ~2 week migration)
2. SQLite → PostgreSQL (for multi-user horizontal scale)
3. Frontend: keep React, optimize bundle splitting
