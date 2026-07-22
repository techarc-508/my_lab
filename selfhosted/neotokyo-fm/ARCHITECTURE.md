# NEOTOKYO FM — Architecture

**Version**: 4.0  
**Stack**: Flask (Python 3.11) + Vite/React/TypeScript + Tailwind CSS  
**Deploy**: Docker Compose (Nginx :80 → client, gthread → server :5050)

---

## Directory Layout

```
mini_radio/
├── server/                  # Flask API (port 5050)
│   ├── app.py               # Flask factory, background threads, error handlers
│   ├── config.py            # All env-var config, APP_VERSION
│   ├── models/
│   │   └── db.py            # SQLite (WAL), schema, migrations
│   ├── routes/              # 12 blueprints
│   │   ├── admin.py         # Admin CRUD, system, analytics
│   │   ├── auth.py          # Login/logout/password/CSRF
│   │   ├── downloads.py     # yt-dlp download manager
│   │   ├── files.py         # Browse/metadata for uploaded audio
│   │   ├── playlists.py     # JSON-file playlist CRUD
│   │   ├── podcasts.py      # RSS podcast engine
│   │   ├── radio.py         # Internet radio stations
│   │   ├── subsonic.py      # Subsonic/OpenSubsonic API
│   │   ├── updates.py       # OTA update checker
│   │   └── youtube.py       # Search + download via yt-dlp
│   ├── services/            # Business logic
│   │   ├── audio_engine.py  # FFprobe metadata, cover extraction, EQ
│   │   ├── lyrics.py        # LRCLIB fetcher with circuit breaker
│   │   └── radio_stations.py# Station JSON persistence (atomic save)
│   ├── utils/
│   │   ├── circuit_breaker.py # Generic circuit breaker (RLock)
│   │   ├── security.py      # Rate limiter, auth decorators, CSRF, bcrypt
│   │   ├── stream_proxy.py  # Range-request proxy for radio streams
│   │   └── tts.py           # pyttsx3 offline TTS
│   ├── workers/
│   │   ├── metadata.py      # FFmpeg cover extraction, album-art rename
│   │   └── podcast_scheduler.py # RSS sync scheduler
│   ├── downloads/           # User-uploaded + downloaded files
│   ├── playlists/           # JSON playlist files
│   ├── metadata/            # Extracted cover art cache
│   ├── migrations/          # Alembic (non-destructive, auto-skipped if missing)
│   └── gunicorn.conf.py     # gthread workers
├── client/                  # Vite + React 19 + TypeScript
│   ├── src/
│   │   ├── App.tsx          # Router (lazy-loaded routes)
│   │   ├── main.tsx         # Entry point
│   │   ├── index.css        # CSS variables, dark/light themes, animations
│   │   ├── stores/
│   │   │   └── playerStore.ts # Zustand — player state, queue, EQ, themes
│   │   ├── services/
│   │   │   ├── api.ts       # HTTP client + CSRF token management
│   │   │   ├── audioEngine.ts # HTMLAudioElement wrapper, visualizer node
│   │   │   ├── eventBus.ts  # Typed pub/sub
│   │   │   └── socketClient.ts # Socket.io client
│   │   ├── hooks/
│   │   │   ├── useVisualizer.ts # Canvas visualizer logic
│   │   │   ├── useCanvasVisualizer.ts # Raw canvas draw
│   │   │   ├── useKeyboardShortcuts.ts # Global hotkeys
│   │   │   ├── useTouchGestures.ts # Swipe/tap mobile
│   │   │   ├── useVideoMode.ts # Background video player
│   │   │   └── useAlbumColor.ts # Dominant color extraction
│   │   ├── components/
│   │   │   ├── layout/      # AppShell, Header, Sidebar
│   │   │   ├── player/      # BottomPlayerBar, EQPanel, Visualizer, Lyrics, etc.
│   │   │   └── ui/          # ScanlineOverlay, Skeleton, ConfirmDialog, etc.
│   │   ├── pages/           # Player, Playlists, Podcasts, Radio, Settings, etc.
│   │   ├── admin/           # 19 admin panels (Dashboard, Downloads, Users, etc.)
│   │   └── types/
│   │       └── audio.ts     # All TypeScript interfaces
│   ├── nginx.conf           # SPA routing + /api/ reverse proxy
│   └── Dockerfile           # Multi-stage: node build → nginx serve
├── docker-compose.yml       # Two services: client (:80) + server (:5050)
├── scripts/
│   ├── deploy.sh            # Universal deploy (rsync + Docker rebuild)
│   └── backup.sh            # Full backup (DB, playlists, stations, audio)
├── deploy/
│   └── proxmox-helper.sh    # Automated Proxmox LXC creation
└── docs/
    └── PROXMOX_DEPLOY.md    # Deployment guide
```

---

## Server Architecture

### 12 Flask Blueprints

| Blueprint | Prefix | Purpose |
|-----------|--------|---------|
| `auth` | `/api/` | Login, logout, session, CSRF, password reset |
| `admin` | `/api/admin/` | Dashboard metrics, user CRUD, backups, webhooks, logs |
| `files` | `/api/files/` | Browse/upload/metadata for audio files |
| `youtube` | `/api/youtube/` | Search, download, progress tracking via yt-dlp |
| `radio` | `/api/radio/` | Station CRUD, now-playing metadata, connectivity test |
| `playlists` | `/api/playlists/` | JSON-file playlist CRUD |
| `downloads` | `/api/downloads/` | Background download manager |
| `podcasts` | `/api/podcasts/` | RSS feed sync, episode management |
| `subsonic` | `/api/subsonic/` | Subsonic/OpenSubsonic API (XML) |
| `updates` | `/api/updates/` | OTA version check + update |
| `metrics` | `/api/metrics` | Prometheus-compatible metrics |
| (root) | `/` | Health check, version info |

### Background Threads (app.py)

- **WAL checkpoint**: SQLite WAL compaction every 60s
- **Auto-backup**: Daily at 18:30 UTC → `downloads/.auto_backups/`
- **Podcast scheduler**: RSS feed sync interval
- **Maintenance**: Hourly — visit_log cap (500 rows), expired token cleanup

### Services

- **`audio_engine.py`**: FFprobe metadata extraction, cover art extraction, sample rate/bit depth detection
- **`lyrics.py`**: LRCLIB API with circuit breaker (3 failures → disable, resets after cooldown)
- **`radio_stations.py`**: JSON-file persistence with atomic save (`tempfile` + `os.replace`)

### Workers

- **`metadata.py`**: FFmpeg cover art extraction, album-art rename for existing files, background `_recording_processes` dict for stop
- **`podcast_scheduler.py`**: Periodic RSS feed sync

### Key Patterns

- **Session auth**: Flask sessions + CSRF token (`GET /api/csrf-token` → `X-CSRF-Token` header)
- **Rate limiting**: 5 login attempts / 5 min per IP (in-memory, no Redis)
- **Circuit breaker**: Generic `CircuitBreaker` class with configurable thresholds
- **Connection pooling**: `HTTP_SESSION` (requests.Session) for external API calls
- **Atomic writes**: Radio stations use `tempfile.NamedTemporaryFile` + `os.replace`

---

## Client Architecture

### State Management

**Zustand** (`playerStore.ts`) — single store, localStorage persistence (`neotokyo-` prefix):

- **Playback**: `currentTrack`, `isPlaying`, `volume`, `muted`, `shuffle`, `repeat`
- **Queue**: `queue`, `queueIndex`
- **EQ**: 10-band `equalizer` preset selector + `customEqBands`
- **UI state**: `theme`, `sidebarOpen`, `scanlineEnabled`, `showLyrics`
- **Visualizer**: `visualizerMode` (6 modes), `videoMode`

### Visualizer Modes

1. **Bars** — Classic frequency bars
2. **Wave** — Oscilloscope waveform
3. **Circular** — Radial frequency display
4. **Particles** — Particle system
5. **Galaxy** — Spiral galaxy
6. **Terrain** — 3D terrain mesh

### EQ Presets

Flat, Bass Boost, Treble Boost, Vocal, Electronic, Rock, Jazz, Classical, Podcast, Night Mode + Custom

### Theme System

- **Dark mode** (default): CSS custom properties on `:root.dark`
- **Light mode**: `:root:not(.dark)` overrides
- **Retrowave palette**: Hot pink `#FF006E`, purple `#8338EC`, electric blue `#3A86FF`
- **Glassmorphism**: `.glass`, `.glass-card`, `.glass-subtle` utility classes (backdrop-filter blur)
- **Scanlines**: Optional CRT overlay (`ScanlineOverlay.tsx`)
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` kills all animations

### Key Hooks

| Hook | Purpose |
|------|---------|
| `useVisualizer` | Canvas rendering for all 6 visualizer modes |
| `useCanvasVisualizer` | Low-level canvas draw loop |
| `useKeyboardShortcuts` | Global hotkeys (space=play, arrows=seek, etc.) |
| `useTouchGestures` | Mobile swipe/tap gestures |
| `useVideoMode` | Background video playback |
| `useAlbumColor` | Extract dominant color from album art |

### Audio Engine

`audioEngine.ts` wraps `HTMLAudioElement`:
- Creates `AnalyserNode` for visualizer data
- Handles track loading, play/pause, seek, volume
- Fires events via `eventBus` for UI updates
- Manages `MediaSession` API for OS-level controls

### PWA Support

- Service worker with offline caching (45 precache entries)
- `InstallPrompt.tsx` for install banner
- Manifest with app icons

---

## API Surface

### Auth Flow

1. `GET /api/csrf-token` → returns token in JSON
2. All `POST/PUT/DELETE` require `X-CSRF-Token` header (except `/api/login` and `/api/subsonic/`)
3. `POST /api/login` → sets session cookie
4. 24h session expiry, rate-limited (5 attempts / 5 min)

### Subsonic API (`/api/subsonic/`)

XML-based, limited compatibility. Supports:
- `getArtists`, `getAlbumList`, `getAlbum`, `getSong`
- `stream`, `download`, `getCoverArt`
- Auth via `u`+`p` (MD5) params or `Authorization: Bearer` header
- **MD5 token auth disabled** — bcrypt-hashed passwords can't be verified via MD5

### Key Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/files/browse` | Session | List audio files |
| GET | `/api/files/metadata-batch` | Session | Bulk metadata |
| GET | `/api/radio/stations` | Public | List radio stations |
| GET | `/api/radio/now-playing/<id>` | Public | Station metadata |
| GET | `/api/youtube/search` | Session | YouTube search |
| POST | `/api/youtube/download` | Session | Start download |
| GET | `/api/downloads` | Session | List active downloads |
| GET | `/api/podcasts` | Session | List podcasts |
| GET | `/api/admin/dashboard` | Admin | System metrics |
| GET | `/api/subsonic/rest/*` | API key | Subsonic protocol |

---

## Deployment

### Docker Compose (production)

- **Client**: `client/Dockerfile` → multi-stage Node build → Nginx serve on `:80`
  - Nginx serves static files + reverse proxies `/api/` → `server:5050`
- **Server**: `server/Dockerfile` → Python 3.11 → gunicorn (gthread workers)
  - Configurable via `GUNICORN_*` env vars
  - FFmpeg installed in image for audio processing
- **Volumes**: `server/downloads/` mounted for persistent audio
- **Health checks**: Both services have `/health` endpoints

### Proxmox LXC (current deploy)

- Container 104 at `192.168.0.104`
- Created via `deploy/proxmox-helper.sh`
- Docker runs inside LXC
- SSH via Proxmox host `192.168.0.113` → `pct exec 104 -- <cmd>`
- Deploy via `scripts/deploy.sh` (rsync + Docker rebuild)

### Systemd (alternative)

- `start.sh` wrapper with watchdog auto-restart
- `neotokyo-grabber.service` + `neotokyo-player.service`
- Hardcoded paths to `server/` and `client/`

### Environment Variables

See `.env.example` for full list. Key vars:

| Var | Default | Purpose |
|-----|---------|---------|
| `ADMIN_PASSWORD` | Random 16-char hex | Admin login |
| `FLASK_SECRET_KEY` | Auto-generated + persisted | Session signing |
| `LRCLIB_SKIP` | `0` | Disable lyrics fetching |
| `LRCLIB_TIMEOUT` | `15` | Lyrics API timeout (seconds) |
| `GUNICORN_WORKERS` | CPU-based | Worker count |
| `VITE_API_BASE` | empty (same-origin) | Client API base URL |

---

## V4 Changes vs Container 104

### Fixes Applied

| Category | Change |
|----------|--------|
| **Deadlock** | `CircuitBreaker` lock `Lock` → `RLock` |
| **Path traversal** | `subsonic.py` stream/download/getSong/getCoverArt now use `safe_path()` |
| **Auth gap** | `files.py` `/metadata-batch` now requires `@auth_required` |
| **Request size** | `MAX_CONTENT_LENGTH` enforced on Flask app config |
| **Side effects** | `security.py` no longer calls `socket.setdefaulttimeout` globally |
| **Credential leak** | Admin password no longer logged to stdout |
| **Broken auth** | Subsonic MD5 token auth disabled (can't verify bcrypt hashes) |
| **Connection leak** | `youtube.py` uses `HTTP_SESSION` instead of `requests.get` |
| **Timeout** | Radio connectivity test 5s → 3s |
| **Password validation** | Standardized to 12 chars across all auth paths |
| **Atomic writes** | Radio stations use temp file + `os.replace` |
| **Process leak** | `metadata.py` `stop_recording()` kills FFmpeg via `_recording_processes` dict |
| **Admin auth** | `play/log` endpoint requires authentication |
| **DB cleanup** | `visit_log` capped at 500 rows hourly, expired tokens cleaned |
| **Dependencies** | Removed unused `beautifulsoup4` and `watchdog` |
| **Version** | `APP_VERSION` → `4.0` |

### What Container 104 Has That Local Doesn't

- `watcher.py` (file watcher — unused, dependency removed)
- `gspread` pip dependency (unused, removed from local)

### What Local Has That Container 104 Doesn't

- `subsonic.py`, `podcasts.py`, `oauth.py`, `analytics.py`, `update.py`
- `circuit_breaker.py`, `podcast_scheduler.py`
- PWA support (service worker, manifest)
- 157 routes vs 80
- 19 admin panels
- 6 visualizer modes
- Lyrics overlay + LRCLIB integration
- TTS support
- WebSocket real-time updates
