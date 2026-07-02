# AGENTS.md — NEOTOKYO FM

**Repo**: `server/` (Flask) + `client/` (Vite + React). The README/docs refer to stale paths (`grabbar/retro-music-player/`, `player/neotokyo-fm/`) — ignore them, use `server/` and `client/`.

## Commands

| Context | Command | Notes |
|---------|---------|-------|
| Server dev | `cd server && python app.py` | Listens on `:5050` |
| Server prod | `gunicorn -c gunicorn.conf.py 'app:create_app()'` | gthread workers |
| Client dev | `cd client && npm run dev` | Listens on `:3000`, proxies `/api/` → `localhost:5050` |
| Client build | `cd client && npm run build` | Runs `tsc -b && vite build` |
| Client lint | `cd client && npm run lint` | ESLint (React hooks rules only) |
| Client typecheck | `cd client && npx tsc --noEmit` | CI uses this, not `tsc -b` |
| Docker Compose | `docker compose up --build` | Prod: client `:80`, server `:5050` |
| systemd | `./start.sh {start\|stop\|status\|restart\|logs}` | Watchdog with auto-restart |

## CI pipeline (`.github/workflows/ci.yml`)

1. Server: `pip install` → `python -m py_compile routes/*.py app.py config.py` → `python -c "from app import create_app; print('import OK')"`
2. Client: `npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm run build`

There are **no tests** in this repo. The CI only checks syntax, types, lint, and build.

## Architecture

- **Two services**, communicate via HTTP. Client proxies `/api/` to server.
- **Admin UI** is at `client/src/admin/` (auth-gated). User-facing pages at `client/src/pages/`.
- **Auth**: Session-based (cookies) + CSRF token (`GET /api/csrf-token` → `X-CSRF-Token` header on all POST/PUT/DELETE except `/api/login`).
- **State**: Server uses in-memory dicts + SQLite (WAL mode). Client uses Zustand + localStorage.

## Key gotchas

- **README version numbers are wrong**: Tailwind v3 (not v4), Vite 6 (not 8), TypeScript ~5.6 (not 6.0). Trust `package.json` over README.
- **Root Dockerfile is stale** — was deleted. The real images are `server/Dockerfile` and `client/Dockerfile`.
- **Server Dockerfile** uses a non-root `appuser`. Files in `downloads/` must be writable by that user.
- **No test framework** exists — don't run `pytest` or `jest`.
- **CSRF is enforced** on all POST/PUT/DELETE. Always fetch a CSRF token and send it as `X-CSRF-Token` header.
- **Admin password** is auto-generated (random 16-char) if `ADMIN_PASSWORD` env var not set. Check server logs on first start.
- **LRCLIB** can be disabled with `LRCLIB_SKIP=1`. Has a circuit breaker (disables after 3 consecutive failures).
- **Download status polling** at 600ms frontend. **Radio now-playing polling** at 5s frontend, 10s backend.

## Environment

Copy `.env.example` to `.env`. Key vars: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `FLASK_SECRET_KEY`, `CORS_ORIGIN`.

## Progress

### Done
- **Layout & routing**: Sidebar (72px), PlayerPanel (320px left), AppShell (three-column layout), PlayerBar (fullscreen bottom). HomePage with hero carousel + trending/recently played + genre quick links.
- **Radio**: 75 verified stations across 13 genres; LIVE indicator + disabled skip for streams; proxy filters Zeno FM/`.m3u8`/`.pls` and tests connectivity.
- **RadioPage local search**: Local search bar filtering stations by name/genre. Genre tabs + favorites toggle. Removed global "Discover Stations" search.
- **Systemd services**: `neotokyo-grabber.service` (gunicorn :5050) + `neotokyo-player.service` (Vite :3000) enabled for multi-user.target, auto-start.
- **ffmpeg resolution**: PATH includes `~/.opencode/bin` in module and systemd `ExecStart`.
- **Dashboard caching**: LRUCache (30s TTL) on `/api/stats`, `/api/health`, `/api/admin/system`; stop polling on page hidden.
- **Live logs**: SSE `/api/logs/stream`; pause/resume, filter, clear.
- **Lyrics Manager**: `GET /api/lyrics-status` per-file endpoint; summary stats, tabs, search, per-file fetch.
- **Backup & Restore**: Auto-backup 18:30 UTC; `POST /api/backups/<id>/restore`; includes playlists.
- **CSRF auto-load**: `req()` auto-fetches CSRF before non-GET; `FLASK_SECRET_KEY` persisted to `.flask_secret_key`.
- **LRCLIB service rewritten**: Multi-strategy search (LRCLIB, Genius, lyrics.ovh, AZLyrics, letras, bangla-lyrics), circuit breaker (5min cooldown), in-memory cache (30min TTL).
- **LyricsOverlay**: Full-viewport overlay, blurred album art bg, album art left + lyrics right, synced scrolling, accent bar on active line with pulse animation, gradient fade at top/bottom, past/future line dimming.
- **User submit lyrics**: `POST /api/lyrics/submit` — no auth required, CSRF-protected. Frontend form with textarea, guide overlay, Save/Cancel. `clear_lyrics_cache()` invalidates stale entries.
- **Volume slider**: Always visible in PlayerPanel; slide-out on hover in PlayerBar. Volume persists across reloads.
- **Persist last track + auto-resume**: `currentTrack`, `recentlyPlayed`, `volume` saved to localStorage. On load, AppShell restores last track and auto-plays. Falls back to random song.
- **Queue population**: LibraryPage/PlaylistsPage populate queue on play. `playNext()` loops back to first track on queue end.
- **Crossfade transitions**: `fadeTo()` interval method in `audioEngine.ts`. Fade-in (800ms), fade-out (1000ms) at track end, smooth skip/togglePlay/volume changes.
- **Favicon**: Custom cassette tape SVG (`client/public/favicon.svg`).
- **Library grid**: `grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5`.
- **HomePage play/pause fix**: `text-slate-800`, `fill="currentColor"`, click sets track if different before toggle.
- **Player polish**: 56px play button with hover ring, scale transitions on all controls, styled volume slider (`h-1.5 bg-white/10 rounded-full accent-brand`), 48-bar waveform with brand-color glow.
- **Custom SVG favicon**: Cassette tape with hot pink `#FF006E` and electric blue `#3A86FF`.
- **Auto-next-track playback fixed**: `onEnd` in `audioEngine.ts` now calls `this.playTrack()` after `playNext()` updates store.
- **Repeat-one fixed**: `repeat === 'one'` now replays current track instead of silently stopping.
- **Admin password**: Now generates random 16-char password when `ADMIN_PASSWORD` not set (was hardcoded `'changeme'`).
- **Root Dockerfile removed**: Was stale (referenced deleted paths). Real images at `server/Dockerfile` and `client/Dockerfile`.

### Known remaining issues (not blocking)
- **ESLint broken**: Missing `typescript-eslint` parser → all `.tsx` files fail parsing. CI step `npm run lint` will fail. Only type/bug impact: none — `tsc --noEmit` catches type errors and build succeeds. Fix: add `typescript-eslint` to `eslint.config.js`.
- **`scripts/install-proxmox.sh`**: References old `grabbar/retro-music-player/` and `player/neotokyo-fm/` paths. Needs update to `server/` and `client/`.
- **`README.md`**: References stale directory structure and paths. Needs rewrite.
- **`docker-compose.yml`**: Should be verified to work with new `server/` and `client/` paths.
- **Git state**: Massive restructure (old `grabbar/`/`player/` dirs deleted, new `client/`/`server/` dirs added) is all uncommitted.

## Key Decisions
- `showLyrics` default is `false` — lyrics overlay does not auto-open on page load.
- `POST /api/lyrics/submit` does not require auth — any local network user can submit lyrics.
- CSRF token stored in module-level variable (not localStorage).
- Queue loops on end regardless of repeat mode (unless `repeat === 'one'`).
- Crossfade uses `setInterval` (16 steps) rather than Web Audio API `linearRampToValueAtTime`.
- `playNext()` in store is state-only — `audioEngine.ts`'s `onEnd` handler calls `playTrack()` after it.

## Relevant Files
- `client/src/services/audioEngine.ts`: `onEnd` now handles repeat-one replay and auto-next via `playTrack()`.
- `client/src/stores/playerStore.ts`: `playNext()` sets state only; `playPrev()` wraps to end.
- `server/config.py`: Admin password generates random 16-char hex via `uuid.uuid4().hex[:16]`.
