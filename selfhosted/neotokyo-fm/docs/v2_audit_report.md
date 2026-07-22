# NEOTOKYO FM — v2 Build Audit Report

> Generated: 2026-07-09
> Audit all phases 1–6 for release readiness.

---

## Executive Summary

v2 transformed NEOTOKYO FM from a functional admin-focused downloader into a polished, mobile-ready music streaming platform with multi-user support, a full Subsonic API, PWA capabilities, and production-grade infrastructure. Every required phase from the v2 plan is complete.

| Phase | Effort | Verdict |
|-------|--------|---------|
| 1 — UI Redesign | ~40 pts | ✅ Complete |
| 2 — Core Polish | ~30 pts | ✅ Complete |
| 3 — PWA/Mobile | ~10 pts | ✅ Complete |
| 4 — Multi-User | ~8 pts | ✅ Complete |
| 5 — Infra | ~8 pts | ✅ Complete |
| 6 — Subsonic | ~5 pts | ✅ Complete |

---

## Phase 1 — UI Redesign

### Achievements
- **Bottom Player Bar**: Compact 72px bar replaces fixed sidebar player. Slide-up overlay for full album art + controls.
- **Album Art Color Extraction**: `useAlbumColor` hook extracts dominant colors from `<canvas>` → ambient gradient on bar/overlay/home.
- **Color Token Audit**: All hardcoded hex colors replaced with CSS variables (`--color-surface-*`, `--color-text-*`, etc.).
- **Light Theme Rework**: Full `:root:not(.dark)` CSS variable set, Tailwind `darkMode: 'class'`, every component tested.
- **Animated Page Transitions**: `PageTransition.tsx` wrapping `<Outlet>` with `key=pathname` + `animate-fade-in`.
- **Scanline Toggle**: `Shift+S` keyboard shortcut, store boolean, default on.
- **Micro-interactions**: Heart bounce animation (`animate-heart-bounce`), range slider glow, `card-hover` elevation.

### Key files changed
`PlayerBar.tsx`, `NowPlayingOverlay.tsx`, `AppShell.tsx`, `index.css`, `PageTransition.tsx`, `ScanlineOverlay.tsx`, `useAlbumColor.ts`, 8 visualizer/player components, 20+ files for CSS variable migration.

### Audit checklist
- [x] Player bar renders on all pages
- [x] Click player bar → overlay opens with album art + controls
- [x] Light mode toggle works with no broken contrast
- [x] Scanline toggle (Shift+S) works
- [x] Page transitions are smooth
- [x] Album art color extraction works (check album art loaded → background gradient)

---

## Phase 2 — Core Feature Polish

### Achievements
- **Radio Reliability**: Graceful failure UI, connectivity test (green/red indicators), persistent now-playing cache, drag-reorder in admin, genre color badges, "Add custom station" on RadioPage.
- **YouTube Integration**: Thumbnails in search, Load More pagination, playlist import → download queue, download completion toasts.
- **Visualizer/Audio Engine**: Canvas DPR scaling (all 4 visualizers), frame rate governor (cancel RAF when hidden, 30fps cap), EQ curve SVG, crossfade slider (0–12s), VU Meter with gradient + peak hold.
- **Lyrics System**: localStorage cache (24h TTL), Shift+↑/↓ sync offset, LRC file upload, submit guide with char count.
- **Admin Polish**: Scanner SSE progress bar (600ms poll), inline click-to-edit metadata, ConfirmDialog for destructive actions, log level filter tabs, upload progress bar.
- **Metadata/Library**: Bulk tag editor, list/grid view toggle (persisted), album grouping.

### Key files changed
`RadioPage.tsx`, `AdminRadio.tsx`, `YouTubePage.tsx`, `VUMeter.tsx`, `LyricsOverlay.tsx`, `AdminLyrics.tsx`, `AdminLogs.tsx`, `AdminSongs.tsx`, `AdminScanner.tsx`, `ConfirmDialog.tsx`, visualizers/*, `LibraryPage.tsx`.

### Audit checklist
- [x] Radio station shows red/green connectivity
- [x] YouTube search loads thumbnails
- [x] Visualizer runs at correct DPR
- [x] Crossfade slider updates audio fade-in
- [x] Lyrics sync offset works (Shift+↑/↓)
- [x] Scanner shows per-file progress
- [x] Inline metadata edit (click cell → edit)
- [x] ConfirmDialog appears on delete
- [x] List/grid toggle persists state
- [x] Album grouping works

---

## Phase 3 — PWA / Mobile Experience

### Achievements
- **Media Session API**: `navigator.mediaSession.metadata` set with title, artist, album, artwork (multi-size). `updatePositionState()` on each timeupdate.
- **Background Audio**: `crossOrigin='anonymous'` on `<audio>`. `visibilitychange` → resume AudioContext on foreground. Screen wake lock on play.
- **Install Prompt**: `InstallPrompt.tsx` listens for `beforeinstallprompt`, shows install banner. Wired in `AppShell.tsx`.
- **Touch Gestures**: `useTouchGestures.ts` — swipe up/down/left/right, long-press, pinch, tap. Swipe-down dismiss on NowPlayingOverlay. Touch seek on progress bar.
- **Service Worker + Manifest**: `public/manifest.json` with SVG cassette icons. `public/sw.js` (cache-first, API excluded). Registered in `main.tsx`. PWA meta tags in `index.html`.

### Key files
`audioEngine.ts`, `InstallPrompt.tsx`, `useTouchGestures.ts`, `public/manifest.json`, `public/sw.js`, `main.tsx`, `index.html`, `AppShell.tsx`.

### Audit checklist
- [x] Install prompt appears in browser that supports it
- [x] Audio continues when tab is backgrounded (mobile)
- [x] Swipe-down dismisses now-playing overlay
- [x] Progress bar responds to touch drag
- [x] Media Session shows track info in notification center
- [x] Manifest loads (check DevTools → Application → Manifest)
- [x] Service worker registered (check DevTools → Application → Service Workers)

---

## Phase 4 — Multi-User Support

### Achievements
- **Users table**: `users` table in SQLite with `id`, `username`, `password_hash`, `role` (`admin`/`user`), `created_at`. Auto-seeded from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars.
- **Auth against DB**: `POST /api/login` now queries `get_user_by_username()` and verifies with `check_password_hash()`. Session stores `user_id`, `username`, `role`.
- **Role-based decorators**: `admin_required` decorator, `get_current_user()` helper. `auth_required` now sets `g.current_user`.
- **User management API**: `GET /api/users` (admin list), `POST /api/users` (admin create).
- **Admin Users UI**: `/admin/users` page — user list with role badges, create form (username/password/role).
- **Zustand scoping**: Store holds `username` + `role`. `setUser()` action. Login modal and `RequireAuth` both sync user info.
- **Foreign keys**: `user_id INTEGER DEFAULT 1 REFERENCES users(id)` on `play_log`, `visit_log`, `batches`, `playlist_backups`, `scheduled_backups`.
- **DB functions**: `get_user_by_username()`, `get_user_by_id()`, `list_users()`, `create_user()`, `update_user_password()`, `delete_user()`.

### Key files
`server/models/db.py`, `server/routes/auth.py`, `server/utils/security.py`, `client/src/admin/AdminUsers.tsx`, `client/src/admin/AdminLoginModal.tsx`, `client/src/admin/RequireAuth.tsx`, `client/src/stores/playerStore.ts`, `client/src/services/grabberAPI.ts`, `client/src/App.tsx`, `client/src/admin/AdminLayout.tsx`.

### Audit checklist
- [x] Login with admin/admin works (or whatever ADMIN_USERNAME/ADMIN_PASSWORD is set to)
- [x] Login response includes `username` and `role`
- [x] Admin can list and create users via `/admin/users`
- [x] Non-admin users cannot access `/api/users`
- [x] Play/log and visit_log record user_id
- [x] Settings page password change works against DB
- [x] Logout clears session
- [x] New user can't access admin-only endpoints

---

## Phase 5 — Performance & Infrastructure

### Achievements
- **5a DB indexes**: 8 new indexes on frequently queried columns (`play_log.title`, `play_log.artist`, `play_log.played_at`, `visit_log.visited_at`, `batches.status`, `batches.created`, `batch_files.batch_id`, `playlist_backups.version`). Created by `ensure_indexes()` called from `init_db()`.
- **5b ESLint fixed**: `typescript-eslint` parser added. `npm run lint` now correctly parses `.ts`/`.tsx` files.
- **5c Docker CI/CD**: `.github/workflows/docker.yml` — builds + pushes `server` and `client` images to `ghcr.io/techarc-508/` on push to main/master and `v*` tags. Tags: `latest`, `sha-<git-sha>`, semver. Uses Docker layer caching.
- **5d Client HEALTHCHECK**: `HEALTHCHECK` instruction in `client/Dockerfile` — tests nginx on port 80 every 30s.
- **5e Nginx gzip**: `gzip on` with types for JSON, audio (`audio/mpeg`, `audio/flac`, etc.), images (`image/jpeg`, `image/png`, `image/svg+xml`), text, CSS, JS. `gzip_vary on`, `gzip_proxied any`.
- **5f Deploy patches reconciled**: `install.sh` gained media-preservation logic; `proxmox-helper.sh` had `awk` template path bug fixed. All `.fixed` files deleted.
- **5g Stale doc references fixed**: 5 `anomalyco` → `techarc-508` replacements across `docs/PROXMOX_DEPLOY.md`, `docs/ARCHITECTURE.md`, `scripts/install-proxmox.sh`.

### Key files
`server/models/db.py`, `client/eslint.config.js`, `.github/workflows/docker.yml`, `client/Dockerfile`, `client/nginx.conf`, `deploy/install.sh`, `deploy/proxmox-helper.sh`, `docs/PROXMOX_DEPLOY.md`, `docs/ARCHITECTURE.md`, `scripts/install-proxmox.sh`.

### Audit checklist
- [x] `npm run lint` passes clean (was broken before)
- [x] `npx tsc --noEmit` passes clean
- [x] Docker build workflow exists at `.github/workflows/docker.yml`
- [x] Client Docker image has HEALTHCHECK
- [x] Nginx serves gzipped content (check `Content-Encoding: gzip`)
- [x] `deploy/` has no `.fixed` files remaining
- [x] No stale `anomalyco` URLs remain in docs or scripts
- [x] DB indexes are created (check SQLite with `PRAGMA index_list(table_name)`)

---

## Phase 6 — Subsonic API

### Achievements
7 OpenSubsonic-compatible endpoints:

| Endpoint | Route | Methods | Description |
|----------|-------|---------|-------------|
| ping | `/api/subsonic/ping` | GET | Returns status ok |
| getMusicFolders | `/api/subsonic/getMusicFolders` | GET | Single "Library" folder |
| getArtists | `/api/subsonic/getArtists` | GET | Alphabetical artist index from sidecars |
| getAlbumList | `/api/subsonic/getAlbumList` | GET | Album listing (alphabetical/newest/recent/random) |
| stream | `/api/subsonic/stream` | GET | Audio streaming with Range support |
| getCoverArt | `/api/subsonic/getCoverArt` | GET | Cover image from `.metadata/<basename>/` |
| scrobble | `/api/subsonic/scrobble` | POST | Log plays to play_log |

**Auth**: Subsonic token-auth (`u`+`t`+`s`) and password auth (`u`+`p`, plaintext or `enc:` hex). Validates against `users` DB table.

**Response format**: Standard Subsonic XML with `status`, `version="1.16.1"`, proper error codes (40, 41, 70, 0).

**CSRF exempt**: `/api/subsonic/` paths skip CSRF check in `app.py`.

### Key files
`server/routes/subsonic.py` (new), `server/routes/__init__.py` (modified), `server/app.py` (modified).

### Audit checklist
- [x] `GET /api/subsonic/ping` returns valid XML
- [x] `GET /api/subsonic/getMusicFolders` returns folder with downloads path
- [x] `GET /api/subsonic/getArtists` returns indexed artists
- [x] `GET /api/subsonic/getAlbumList?type=random&size=5` returns albums
- [x] `GET /api/subsonic/stream?id=track.mp3` streams audio with Range support
- [x] `GET /api/subsonic/getCoverArt?id=track` serves cover image or 404
- [x] `POST /api/subsonic/scrobble?id=track.mp3` logs to play_log
- [x] Bad credentials return error code 40
- [x] Works with Sonixd / DSub / Tempo (test with any)

---

## Database Schema Changes (v2)

Tables added:
```
users (id, username, password_hash, role, created_at)
```

Columns added (via defaults):
```
play_log.user_id          → DEFAULT 1 REFERENCES users(id)
visit_log.user_id         → DEFAULT 1 REFERENCES users(id)
batches.user_id           → DEFAULT 1 REFERENCES users(id)
playlist_backups.user_id  → DEFAULT 1 REFERENCES users(id)
scheduled_backups.user_id → DEFAULT 1 REFERENCES users(id)
```

Indexes added:
```
idx_play_log_title, idx_play_log_artist, idx_play_log_played_at
idx_visit_log_visited_at
idx_batches_status, idx_batches_created
idx_batch_files_batch_id
idx_playlist_backups_version
```

---

## Build Verification

| Check | Command | Status |
|-------|---------|--------|
| Server imports | `python3 -c "from app import create_app; app = create_app()"` | ✅ |
| Client TypeScript | `cd client && npx tsc --noEmit` | ✅ |
| Client built | `cd client && npm run build` | ✅ |
| Client lint | `cd client && npm run lint` | ✅ (formerly broken) |
| Server routes | All blueprints registered | ✅ (8 blueprints, ~75 routes) |
| Subsonic endpoints | 7 endpoints | ✅ |
| CSRF exempt | `/api/subsonic/` excluded | ✅ |

---

## v2 Benefits Summary

| Benefit | Before v2 | After v2 |
|---------|-----------|----------|
| **UI quality** | Functional, fragmented | Premium, cohesive retrowave design |
| **Mobile experience** | Desktop-only | PWA with install, background audio, touch gestures |
| **Audio engine** | Basic playback | Crossfade, DPR-scaled visualizers, VU peak hold, EQ presets |
| **Radio** | Static station list | Live connectivity check, genre colors, add-from-player |
| **YouTube** | Text links | Thumbnails, pagination, playlist import, download toasts |
| **Lyrics** | Manual only | Auto-LRCLIB, cache, sync offset, LRC upload |
| **Admin** | Basic CRUD | Scanner progress, inline edit, confirm dialogs, log filters |
| **Auth** | Single admin | Multi-user with roles, user management UI |
| **Infra** | Minimal | DB indexes, ESLint, Docker CI/CD, HEALTHCHECK, gzip, deploy patches |
| **Interop** | None | Subsonic API → any mobile/desktop Subsonic client |
| **Security** | Basic | Rate limiting, SSRF guard, CSRF, session auth, user roles |
| **Docs** | Stale refs | All `anomalyco` → `techarc-508`, fixed install scripts |

---

## Recommended Post-Release Items

1. **Add more Subsonic endpoints** — `getPlaylists`, `search2`, `getSong` if mobile clients need them
2. **User password reset** — currently admin must recreate user via admin panel
3. **Per-user playlists** — playlists.json is shared; could be per-user via user_id prefix
4. **Rate-limit all admin endpoints** — currently only login is rate-limited
5. **End-to-end encryption** — Subsonic Basic-Auth over TLS in production
6. **Metrics monitoring** — Prometheus optional; consider alerting rules
