# AGENTS.md — NEOTOKYO FM

## Quick Reference

| Item | Value |
|------|-------|
| Local project root | `/mnt/data/projects/mini_radio/selfhosted/neotokyo-fm/` |
| Git repo root | `/mnt/data/projects/mini_radio/` |
| GitHub remote | `https://github.com/techarc-508/my_lab` |
| Production server | ct-104 on PVE `192.168.0.113` → IP `192.168.0.104` |
| Frontend dev | `http://192.168.0.200:5173/` (Vite, `--host 0.0.0.0 --port 5173`) |
| Backend dev | `http://192.168.0.200:5050` (`python3 app.py`) |
| Production URL | `http://192.168.0.104:5050` |
| Current version | client `5.1.0`, server `5.1` |

## Project Layout

```
selfhosted/neotokyo-fm/
├── client/          # React + Vite + Tailwind
├── server/          # Flask + SQLite (WAL) + Alembic
├── scripts/         # deploy-pve.sh, bulk-import-yt.py
├── deploy/          # Proxmox + Cloudflare helpers
├── design/          # RetroWave design system, CSS reference
├── docs/            # v2–v5 plans, audit reports
├── .github/         # CI (ci.yml) + Docker build (docker.yml)
└── .devcontainer/   # Dev container setup
```

README/docs reference stale `grabbar/retro-music-player/` and `player/neotokyo-fm/` paths — ignore those.

## Commands

| Context | Command | Notes |
|---------|---------|-------|
| Client dev | `cd client && npm run dev` | Port :5173, `--host 0.0.0.0`, proxies `/api/` → `localhost:5050` |
| Client typecheck | `cd client && npx tsc --noEmit` | CI uses this, not `tsc -b` |
| Client lint | `cd client && npm run lint` | ESLint (typescript-eslint) |
| Client build | `cd client && npm run build` | Runs `tsc -b && vite build` |
| Client preview (prod) | `cd client && npx vite preview --host --port 4173` | `start-prod.sh` does this after build |
| Server dev | `cd server && python app.py` | Port :5050 |
| Server prod | `gunicorn -c gunicorn.conf.py 'app:create_app()'` | gthread workers |
| Docker | `docker compose up --build` | Client `:80`, server `:5050` |
| systemd | `./start.sh {start\|stop\|status\|restart\|logs}` | Watchdog with auto-restart |
| Deploy to PVE | `bash scripts/deploy-pve.sh <pve_host> <ct_id> <pve_password>` | Preserves `.env` + downloads |
| Bulk import YT | `python3 scripts/bulk-import-yt.py [api_url] [user] [pass]` | Reads URLs from script, submits in batches of 10 |

## Production Environment

### PVE Access

| Item | Value |
|------|-------|
| PVE host | `192.168.0.113` |
| Container | ct-104, IP `192.168.0.104` |
| SSH to PVE | `ssh root@192.168.0.113` (pw: `wIldvs550Z10lg*!`) |
| Container commands | `pct exec 104 -- <cmd>` |
| Install dir | `/opt/neotokyo-fm` |
| Docker compose | `cd /opt/neotokyo-fm && docker compose up --build -d` |

### Production .env

Located at `/opt/neotokyo-fm/.env` inside ct-104. Generated on first deploy if missing:

```
ADMIN_PASSWORD=<random 16-char hex>
FLASK_SECRET_KEY=<random 32-char hex>
```

Current production admin credentials: `admin` / `95c1daa850174232`

### Deploy Script (`scripts/deploy-pve.sh`)

Safe PVE deploy with state preservation:

1. rsync code to PVE host (`/tmp/neotokyo-deploy/`)
2. Save `.env` + `server/downloads/` to `/tmp/nt-backup/`
3. Wipe old install, tar+extract new code
4. Restore `.env` (or generate new if missing)
5. Restore downloads
6. Fix UID: `chown -R 999:999` on downloads, playlists, logs, DB, stations (container `appuser` uid 999)
7. `docker compose down && docker compose up --build --force-recreate -d`

**Critical**: Container `appuser` has uid 999, host files are uid 1000. Deploy script fixes this automatically.

### Deploy to Production

```bash
cd /mnt/data/projects/mini_radio
bash scripts/deploy-pve.sh 192.168.0.113 104 'wIldvs550Z10lg*!'
```

## Architecture

- **Two services**: Flask HTTP server + Vite React client. Vite dev server proxies `/api/`; Docker Nginx does same in prod.
- **12 Flask blueprints**: auth, files, youtube, radio, downloads, playlists, admin, subsonic, update, analytics, podcasts, oauth. Trivia reuses `analytics_bp`.
- **State**: Server = in-memory dicts + SQLite (WAL mode, hourly WAL checkpoint+VACUUM). Client = Zustand + localStorage (prefix `neotokyo-`).
- **YouTube video proxy**: `/api/yt-stream/<video_id>` streams video server-side via yt-dlp (up to 720p), Range header support.
- **City Pop trivia**: `/api/trivia/citypop` fetches live news from Google News RSS + Reddit, cached 1 hour.
- **Subsonic API** at `/api/subsonic/` — XML-based, limited compatibility.
- **Admin UI** at `client/src/admin/`, user pages at `client/src/pages/`.

## Auth System

### How it works

- **Session cookies + CSRF** for browser sessions
- **Bearer tokens** for API clients (scanner, mobile)
- `GET /api/csrf-token` → send `X-CSRF-Token` header on all POST/PUT/DELETE (except `/api/login` and `/api/subsonic/`)
- Token stored in module-level variable (`grabberAPI.ts`)

### Auth resolution (`_resolve_user()` in `server/utils/security.py`)

1. Check `g.current_user` (set by middleware)
2. Check `Authorization: Bearer <token>` header → lookup in DB sessions
3. Check session cookie
4. Return `None` if unauthenticated

### Rate limiting

- 5 login attempts / 5 min per IP
- Session: 24h expiry

### Admin password

- If `ADMIN_PASSWORD` env var is set → synced to DB on startup (`app.py main()`)
- If not set → random 16-char hex generated and printed to logs
- Login: `POST /api/login` with `{username, password}`

### FLASK_SECRET_KEY

- Priority: env var > `.flask_secret_key` file > auto-generated
- **Fix applied (v5.1)**: Empty env var no longer bypasses auto-gen — uses `.strip()` truthy check

## Important Fixes (v5.1)

### AdminScanner Bearer token auth

`AdminScanner.tsx` used raw `fetch()` for `/api/scanner-status` without Bearer token → 401.
Fixed: now uses `getScannerStatus()` from `grabberAPI.ts` which includes auth headers.

### FLASK_SECRET_KEY empty env var

`config.py` key-existence check (`'FLASK_SECRET_KEY' in os.environ`) passed even when env var was empty string, bypassing auto-gen.
Fixed: `os.environ.get('FLASK_SECRET_KEY', '').strip()` truthy check.

### ADMIN_PASSWORD env→DB sync

On startup, `app.py main()` now syncs `ADMIN_PASSWORD` env var to SQLite DB.
Fixes stale hash mismatch after deploys when `.env` has different password than DB.

### Scanner retry-metadata auth

`POST /api/retry-metadata` in `admin.py` uses `@auth_required` — requires Bearer token or session.

## Gotchas

- **README version numbers are wrong**: Tailwind v3 (not v4), Vite 6 (not 8), TypeScript ~5.6 (not 6.0). Trust `package.json`.
- **No root Dockerfile**. Real images: `server/Dockerfile`, `client/Dockerfile`.
- **Server Dockerfile** uses non-root `appuser` — files in `downloads/` must be writable (uid 999).
- **FFmpeg required** on server for audio processing/streaming. Health endpoint reports FFmpeg presence.
- **LRCLIB**: Disable with `LRCLIB_SKIP=1`. Circuit breaker (3 consecutive failures → disable). `LRCLIB_TIMEOUT` defaults to 15 in code (`.env.example` says 4).
- **Auto-backup**: 18:30 UTC to `server/downloads/.auto_backups/` (radio stations + playlists).
- **Gunicorn**: Uses `gthread` worker class (not sync). Configurable via `GUNICORN_*` env vars.
- **Prometheus metrics** at `/api/metrics` (optional `prometheus-client`; falls back to plain-text).
- **`VITE_API_BASE`** env var overrides client API base URL (defaults to empty/same-origin).
- **Systemd units** (`neotokyo-grabber.service`, `neotokyo-player.service`) hardcode paths.
- **No tests** in this repo. No test framework exists — don't run `pytest` or `jest`.
- **UID mismatch**: Container `appuser` uid 999, host files uid 1000. Deploy script fixes automatically. Manual fix: `chown -R 999:999 /opt/neotokyo-fm/server/{downloads,playlists,logs}/`

## Git History

| Tag | Commit | Description |
|-----|--------|-------------|
| `neotokyo-fm-v1` | `926f8ba` | Original repo (correct structure, v2.0.0) |
| `v5.0` | `6c5e541` | YouTube video player + admin redesign (5.0.0) |
| `v5.1` | `014cb0c` | **Current main** — production hardened (5.1.0) |

### v5.1 Changelog

- AdminScanner Bearer token auth fix (scanner-status was 401)
- FLASK_SECRET_KEY empty env var bypass fix
- ADMIN_PASSWORD auto-sync env→DB on startup
- `scripts/deploy-pve.sh`: Safe PVE deploy with .env + download preservation
- `scripts/bulk-import-yt.py`: Bulk YouTube URL import with dedup
- Repo restructured: files moved from root to `selfhosted/neotokyo-fm/`
- `.env` excluded from git, rsync, tarball

## CI (`.github/workflows/ci.yml`)

1. Server: `pip install` → `py_compile routes/*.py app.py config.py` → verify `create_app()` imports
2. Client: `npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm run build`

Docker build & push to GHCR on `main`/`master` and `v*` tags (`docker.yml`).

## Design System

RetroWave / Cyberpunk aesthetic:
- **Fonts**: Space Grotesk (sans), JetBrains Mono (mono), Playfair Display (serif)
- **Neon palette**: `#ff007f` (pink), `#00f3ff` (cyan), `#7a00ff` (purple), `#ffb703` (yellow)
- **No Framer Motion** — all animations use pure CSS
- Reference: `design/admin_panel_design.md`
