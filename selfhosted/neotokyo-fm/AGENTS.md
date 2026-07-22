# AGENTS.md — NEOTOKYO FM

**Layout**: `server/` (Flask) + `client/` (Vite + React). README/docs reference stale `grabbar/retro-music-player/` and `player/neotokyo-fm/` paths — ignore those.

## Commands

| Context | Command | Notes |
|---------|---------|-------|
| Server dev | `cd server && python app.py` | Port :5050 |
| Server prod | `gunicorn -c gunicorn.conf.py 'app:create_app()'` | gthread workers, configurable via env vars |
| Client dev | `cd client && npm run dev` | Port :3000, proxies `/api/` → `localhost:5050` |
| Client typecheck | `cd client && npx tsc --noEmit` | CI uses this, not `tsc -b` |
| Client lint | `cd client && npm run lint` | ESLint (works now with typescript-eslint) |
| Client build | `cd client && npm run build` | Runs `tsc -b && vite build` |
| Client preview (prod) | `cd client && npx vite preview --host --port 4173` | `start-prod.sh` does this after build |
| Docker | `docker compose up --build` | Client `:80`, server `:5050`, health checks on both |
| systemd | `./start.sh {start\|stop\|status\|restart\|logs}` | Watchdog with auto-restart |

## CI (`.github/workflows/ci.yml`)

1. Server: `pip install` → `py_compile routes/*.py app.py config.py` → verify `create_app()` imports
2. Client: `npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm run build`

Docker build & push to GHCR on `main`/`master` and `v*` tags (`docker.yml`).

**No tests** in this repo. No test framework exists — don't run `pytest` or `jest`.

## Architecture

- **Two services**, HTTP. Vite dev server proxies `/api/`; Docker Nginx (`nginx.conf`) does the same.
- **12 Flask blueprints**: auth, files, youtube, radio, downloads, playlists, admin, subsonic, update, analytics, podcasts, oauth. Trivia endpoint reuses `analytics_bp`.
- **Auth**: Session cookies + CSRF. `GET /api/csrf-token` → send `X-CSRF-Token` header on all POST/PUT/DELETE (except `/api/login` and `/api/subsonic/`). Token stored in module-level variable (`grabberAPI.ts`).
- **State**: Server = in-memory dicts + SQLite (WAL mode, hourly WAL checkpoint+VACUUM). Client = Zustand + localStorage (prefix `neotokyo-`).
- **Subsonic API** at `/api/subsonic/` — XML-based, limited compatibility.
- **Admin UI** at `client/src/admin/`, user pages at `client/src/pages/`.
- **YouTube video proxy**: `/api/yt-stream/<video_id>` streams video server-side via yt-dlp (up to 720p), Range header support.
- **City Pop trivia**: `/api/trivia/citypop` fetches live news from Google News RSS + Reddit, cached 1 hour.

## Gotchas

- **README version numbers are wrong**: Tailwind v3 (not v4), Vite 6 (not 8), TypeScript ~5.6 (not 6.0). Trust `package.json`.
- **No root Dockerfile**. Real images: `server/Dockerfile`, `client/Dockerfile`.
- **Server Dockerfile** uses non-root `appuser` — files in `downloads/` must be writable.
- **FFmpeg required** on the server for audio processing and streaming. Health endpoint reports FFmpeg presence.
- **ESLint now works** (typescript-eslint ^8.63 installed). CI runs it, but `tsc --noEmit` is the main gate.
- **Admin password**: Random 16-char hex if `ADMIN_PASSWORD` unset. Printed to server logs at startup.
- **`FLASK_SECRET_KEY`**: Persisted to `server/.flask_secret_key` after first start if not set via env.
- **LRCLIB**: Disable with `LRCLIB_SKIP=1`. Circuit breaker (3 consecutive failures → disable). `LRCLIB_TIMEOUT` defaults to 15 in code (`.env.example` says 4).
- **Rate limit**: 5 login attempts / 5 min per IP. **Session**: 24h expiry.
- **Auto-backup**: 18:30 UTC to `server/downloads/.auto_backups/` (radio stations + playlists).
- **Gunicorn**: Uses `gthread` worker class (not sync). Configurable via `GUNICORN_*` env vars.
- **Prometheus metrics** at `/api/metrics` (optional `prometheus-client` pip package; falls back to plain-text).
- **`VITE_API_BASE`** env var overrides client API base URL (defaults to empty/same-origin).
- **Systemd units** (`neotokyo-grabber.service`, `neotokyo-player.service`) hardcode paths to `server/` and `client/`.
- **Deploy helpers** in `deploy/` and `scripts/` (Proxmox, Cloudflare Tunnel, tarball packaging).
