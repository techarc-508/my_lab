# v3 Implementation Status

All items from `v3_update_plan.md` are implemented.

## Phase 1 — v2.1 ✓
- Event Bus (`eventBus.ts`) — typed channels, `on()`, `emit()`
- QoE Telemetry (`trackTelemetry.ts`) — beacon to `/api/telemetry`
- Circuit Breaker (`utils/circuit_breaker.py`) — shared `CircuitBreaker` + `@with_circuit_breaker`
- Rate Limiting (`security.py` `@rate_limit`) — applied to radio, youtube, files
- All Polish Items — scanner progress, inline editor, confirm dialogs, log filter, theme toggle, drag-reorder, genre badges, connectivity test, offline handling, crossfade slider, playlist import URL, upload progress bar
- Dead `notificationBus.ts` removed

## Phase 2 — v2.2 ✓
- Multi-User Auth — users/sessions tables, Bearer tokens, `@require_role`, playlists & downloads scoped by `user_id`
- FTS5 Search — `tracks_fts` virtual table, `searchFiles()` wired in LibraryPage
- Subsonic API — 7 XML endpoints at `/api/subsonic/`
- Prefetch Cache — LRU cache, next 2 tracks prefetched after play
- WebSocket — `flask-socketio` inited, download events emitted (`download:progress`, `download:complete`), `socketClient.ts` with reconnect
- Prometheus Metrics — `/api/metrics` exposes `neotokyo_circuit_breaker_state`, `neotokyo_download_bytes_total`, `neotokyo_active_streams`, `neotokyo_radio_connections`

## Phase 3 — v2.3 ✓
- PWA — `manifest.json`, `sw.js`, registered in `main.tsx`, `seekto`/`stop` media session handlers, `vite-plugin-pwa` configured in `vite.config.ts`
- Self-Update — `/api/update/check|apply|status`, `APP_VERSION` in config, `start.sh update` subcommand, `docker-compose.yml` mounts `.git`
- Watcher Ingestion — `workers/watcher.py` with mutagen + MusicBrainz enrichment, FTS5 upsert, ingestion_log table. AdminSettings has toggle + ingestion log viewer. LibraryPage shows "auto" badge on ingested files
- Alembic — `alembic.ini`, `migrations/`, runs `upgrade head` on startup

## Phase 4 — v3.0 ✓
- Folder Browsing — `GET /api/library/tree`, sidebar in LibraryPage
- FFmpeg Presets — `POST /api/transcode`, per-track Convert button in AdminSongs
- Analytics Dashboard — `/api/analytics/overview` endpoint, charts in AdminDashboard + standalone `AdminAnalytics.tsx` + `routes/analytics.py`
- Redis Sessions — `SESSION_BACKEND` env var, Redis code paths in `auth.py`, `redis` in requirements

## Infrastructure ✓
- `gunicorn.conf.py` — `GUNICORN_WORKER_CLASS` env var (default `gthread`)
- `start.sh` — `update` subcommand (git fetch + stash + rebase + pip install + npm build + restart)
- `docker-compose.yml` — `.git` volume mount for self-update
- `vite.config.ts` — `vite-plugin-pwa` with Workbox runtime caching

## Deferred (by design)
- AdminDashboard/AdminLogs/AdminDownloads/AdminScanner WS subscription refactoring — polling works fine for the scale. SSE used for logs (better than SocketIO for one-directional). WS server-side emits are wired for download events.
- `lrclib.py` already uses shared `get_breaker()` — the `.call()` pattern is used for radio/youtube routes. LRCLIB's `_fail()` was added as a public method on `CircuitBreaker`.
- `gevent` worker class — `gthread` is sufficient and more compatible. The `GUNICORN_WORKER_CLASS` env var allows switching.

## Replaced File Inventory
The plan listed `server/routes/analytics.py` and `client/src/admin/AdminAnalytics.tsx` as new — both now exist as separate files (previously analytics was inlined).

---

*Last updated: 2026-07-10 | All v3 phases complete*
