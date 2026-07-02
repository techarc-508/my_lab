# NEOTOKYO FM — Complete Architecture & Reference

> A self-contained 1980s Japanese anime music player with local library browsing, internet radio streaming, YouTube search/download, playlist management, and a password-gated admin panel for batch audio downloading.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Project Structure](#2-project-structure)
3. [API Reference](#3-api-reference)
4. [User Flow](#4-user-flow)
5. [Admin Flow](#5-admin-flow)
6. [Frontend Component Tree](#6-frontend-component-tree)
7. [Design System](#7-design-system)
8. [Security Model](#8-security-model)
9. [Deployment Guide](#9-deployment-guide)
10. [Remote Access](#10-remote-access)
11. [Contributing](#11-contributing)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. System Architecture

Two independent services communicating via HTTP:

| Service | Role | Port | Stack |
|---------|------|------|-------|
| **Grabber** | Backend API — download engine, metadata, radio proxy, admin | `:5050` | Flask 3 + gunicorn + yt-dlp + FFmpeg + mutagen + SQLite |
| **Player** | Frontend — web music player UI | `:3000` (dev) / `:80` (Docker) | Vite + React 19 + TypeScript + Zustand + Tailwind v4 |

```
┌─────────────┐    HTTP/JSON     ┌──────────────┐
│   Player     │ ◄─────────────► │   Grabber     │
│  (React)     │   localhost:5050 │   (Flask)     │
└──────┬──────┘                  └──────┬───────┘
       │                                │
       │  Web Audio API                 │  yt-dlp + FFmpeg
       ▼                                ▼
   Browser Audio                    Downloaded MP3s
```

### Data Flow: Audio Playback

```
User clicks track
       │
       ▼
playerStore.setTrack(track)
       │
       ▼
audioEngine.play(track)
       │
       ├── source === 'local'
       │      fetch http://localhost:5050/api/audio/<filename>
       │      → HTMLAudioElement → MediaElementSource
       │
       ├── source === 'youtube'
       │      fetch http://localhost:5050/api/yt-proxy/<video_id>
       │      → Response stream → MediaSource → Audio element
       │
       └── source === 'radio'
              fetch http://localhost:5050/api/radio-proxy?url=<encoded>
              → HTMLAudioElement → MediaElementSource
                      │
                      ▼
              GainNode → [10× BiquadFilter peaks] → AnalyserNode
                      │                              │
                      ▼                              ▼
               AudioContext.destination          useVisualizer hook
                                                 → 64-bin frequency data
                                                 → VUMeter.tsx
```

### Data Flow: Download

```
User pastes URLs / searches YouTube
       │
       ▼
POST /api/parse-urls or /api/yt-search
       │
       ▼
POST /api/preview → yt-dlp extract_info(download=False)
       │
       ▼
User confirms in modal (format, save_dir, concurrency, etc.)
       │
       ▼
POST /api/start-download
       │
       ▼
download_batch_worker() thread starts
       │
       ├── Sequential mode (concurrency=1)
       │      for each URL: download_worker_ytdlp() or download_worker_url_requests()
       │      → yt-dlp progress hooks update download[dl_id]['files'][idx]
       │      → FFmpeg post-processing (if streaming)
       │      → extract_sidecars_for() (cover, lyrics, info.json)
       │
       └── Concurrent mode (concurrency > 1)
              ThreadPoolExecutor(max_workers=N) → as_completed() updates batch counters
       │
       ▼
Frontend polls GET /api/status/<id> every 600ms
       │
       ▼
DownloadProgress.tsx displays per-file progress
```

### Data Flow: Sidecar Metadata

```
Audio file downloaded (e.g. track.mp3)
       │
       ▼
extract_sidecars_for(audio_path, basename, title_hint, artist_hint, url)
       │
       ├── 1. Extract cover from embedded ID3 tags (APIC frame)
       │      → downloads/.metadata/<basename>/cover.jpg
       │
       ├── 2. If no cover, fetch thumbnail via yt-dlp
       │      → downloads/.metadata/<basename>/cover.jpg
       │
       ├── 3. Fetch synced lyrics from LRCLIB (if enabled)
       │      → GET https://lrclib.net/api/get?track_name=...
       │      → downloads/.metadata/<basename>/lyrics.lrc
       │      (Circuit breaker: disable after 3 consecutive failures)
       │
       └── 4. Write info.json with title, artist, genre, cover/lyrics paths
              → downloads/.metadata/<basename>/info.json
```

### Threading Model

**Grabber (Flask):**
- Flask runs with `threaded=True` (Werkzeug) or gunicorn `gthread` worker
- Each batch download spawns one daemon thread (`download_batch_worker`)
- `downloads_lock` (threading.Lock) protects batch-level counters
- LRCLIB circuit breaker with thread lock
- Background threads: ICY metadata poller (10s interval), periodic DB maintenance (1h), daily auto-backup (9PM)

**Player (React):**
- Web Audio API on its own audio thread in the browser
- UI updates batched by React 19 concurrent rendering
- `requestAnimationFrame` in `useVisualizer` hook for 60fps frequency data
- Zustand store updates trigger selective re-renders via selector equality

### State Management

**Grabber:**

| Store | Location | Type | Persistence |
|-------|----------|------|-------------|
| `downloads` | In-memory dict | `dict[str, DownloadBatch]` | SQLite (checkpointed on status change) |
| Login sessions | Flask session (signed cookies) | Server-side session | 24h expiry |
| `YT_SEARCH_CACHE` | In-memory LRU cache | `LRUCache` with TTL | None (5-minute TTL) |
| `_lrclib_disabled` | Module global | `bool` with lock | None (resets on restart) |
| `LOG_BUFFER` | In-memory deque | `deque(maxlen=500)` | None |
| `batch_history.db` | SQLite file | batches, batch_files, playlist_backups | Persistent |

**Player:**

| Store | Technology | Key State | Persistence |
|-------|-----------|-----------|-------------|
| `playerStore` | Zustand | currentTrack, queue, isPlaying, volume, eqBands, repeatMode, shuffle | volume/shuffle/repeat via persist middleware |
| Playlists | localStorage | `Playlist[]` as JSON | `neotokyo-playlists` key |
| Auth state | localStorage | CSRF token | `neotokyo-csrf-token` key |
| Lyrics cache | localStorage | `{title|artist → LRC text}` | LRU-style (no eviction) |
| Metadata cache | localStorage | `{filename → {title, artist, genre}}` | Per-file |

### State Synchronization

- `grabbar-auth-changed` custom event coordinates auth state between Sidebar and Header
- `playlistBackup.ts` overrides `localStorage.setItem` to detect playlist mutations
- Auto-sync to server via debounced (2s) `POST /api/playlists/backup`
- Auto-restore from server on init if local playlists are empty and token exists

---

## 2. Project Structure

```
mini_radio/
├── client/                              # React SPA (Vite + TypeScript)
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── main.tsx                     # Entry point
│   │   ├── App.tsx                      # Router (user + admin routes)
│   │   ├── index.css                    # Tailwind v4 + custom animations + Retrowave theme
│   │   ├── config.ts                    # API_BASE, constants
│   │   │
│   │   ├── pages/                       # User-facing pages (no auth)
│   │   │   ├── HomePage.tsx             # Now Playing — album art, progress, VU meter, lyrics
│   │   │   ├── LibraryPage.tsx          # Local music files — browse, search, play
│   │   │   ├── RadioPage.tsx            # Internet radio — station list, play
│   │   │   ├── YouTubePage.tsx          # YouTube search, play, download
│   │   │   └── PlaylistsPage.tsx        # CRUD playlists, backup/restore
│   │   │
│   │   ├── admin/                       # Admin pages (auth required)
│   │   │   ├── AdminLayout.tsx          # Retrowave admin shell with sidebar
│   │   │   ├── RequireAuth.tsx          # Auth guard component
│   │   │   ├── AdminLoginModal.tsx      # Login modal
│   │   │   ├── AdminDashboard.tsx       # Stats tiles, health, active downloads
│   │   │   ├── AdminSongs.tsx           # Song management, metadata viewer
│   │   │   ├── AdminDownloads.tsx       # Download batch management + history
│   │   │   ├── AdminUploads.tsx         # File + CSV + GSheet import with format options
│   │   │   ├── AdminRadio.tsx           # Radio station CRUD
│   │   │   ├── AdminBackups.tsx         # Playlist backup/restore
│   │   │   ├── AdminSettings.tsx        # Password, config, backfill
│   │   │   ├── AdminLogs.tsx            # Server log viewer
│   │   │   ├── AdminBrowse.tsx          # File browser for download directory
│   │   │   ├── AdminWebhooks.tsx        # Webhook management
│   │   │   ├── AdminScanner.tsx         # Metadata scanner + cover fixer
│   │   │   └── AdminImport.tsx          # Import/download workflow
│   │   │
│   │   ├── components/
│   │   │   ├── layout/                  # User app shell
│   │   │   │   ├── AppShell.tsx         # Keyboard shortcuts, scanlines, download tracker
│   │   │   │   ├── Header.tsx           # Top bar with clock, admin button
│   │   │   │   └── Sidebar.tsx          # Nav + BottomNav (mobile)
│   │   │   ├── player/                  # Player components
│   │   │   │   ├── PlayerBar.tsx        # Bottom controls (play/pause, volume, etc.)
│   │   │   │   ├── ProgressBar.tsx      # Seekable progress bar with gradient fill
│   │   │   │   ├── AlbumArt.tsx         # Gradient album art with 6 themes
│   │   │   │   ├── TrackInfo.tsx        # Source badge + title display
│   │   │   │   ├── VUMeter.tsx          # 64-bin frequency visualizer
│   │   │   │   ├── Equalizer.tsx        # 10-band graphic EQ with presets
│   │   │   │   ├── LyricsPanel.tsx      # Synced karaoke lyrics + EQ
│   │   │   │   ├── QueuePanel.tsx       # Queue management UI
│   │   │   │   ├── RecentlyPlayed.tsx   # Recently played tracks
│   │   │   │   ├── SleepTimer.tsx       # Sleep timer countdown
│   │   │   │   └── visualizers/         # Visualizer modes (spectrum, waveform, circular, particle)
│   │   │   │       ├── SpectrumVisualizer.tsx
│   │   │   │       ├── WaveformVisualizer.tsx
│   │   │   │       ├── CircularVisualizer.tsx
│   │   │   │       └── ParticleVisualizer.tsx
│   │   │   └── ui/                      # Shared UI kit
│   │   │       ├── ScanlineOverlay.tsx   # CRT scanline effect
│   │   │       ├── StreamToast.tsx       # Error notifications
│   │   │       ├── DownloadProgress.tsx  # Active download tracker
│   │   │       ├── ShortcutCheatsheet.tsx
│   │   │       ├── Skeleton.tsx          # Loading placeholders
│   │   │       └── ErrorBoundary.tsx
│   │   │
│   │   ├── services/
│   │   │   ├── audioEngine.ts            # Web Audio API singleton
│   │   │   ├── grabberAPI.ts             # All backend API calls
│   │   │   ├── playlistBackup.ts         # Backup/restore + auth
│   │   │   └── playlistUtils.ts          # localStorage CRUD
│   │   │
│   │   ├── stores/
│   │   │   └── playerStore.ts            # Zustand state (track, queue, EQ, etc.)
│   │   │
│   │   ├── hooks/
│   │   │   └── useVisualizer.ts          # 64-bin frequency data hook
│   │   │
│   │   └── types/
│   │       └── audio.ts                  # TypeScript interfaces
│   │
│   ├── index.html                        # Vite HTML entry
│   ├── vite.config.ts                    # Vite config with React plugin
│   ├── tailwind.config.ts                # Tailwind with Retrowave palette
│   ├── postcss.config.js
│   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│   ├── eslint.config.js
│   ├── nginx.conf                        # SPA + /api/ proxy
│   ├── Dockerfile
│   └── package.json
│
├── server/                               # Python Flask backend
│   ├── app.py                            # Flask app factory (~175 lines)
│   ├── config.py                         # Env vars, constants, HTTP session (~98 lines)
│   ├── requirements.txt                  # Flask, requests, yt-dlp, mutagen, etc.
│   ├── gunicorn.conf.py                  # gunicorn config (4 workers, 2 threads)
│   ├── Dockerfile
│   ├── batch_history.db                  # SQLite (download history, playlists)
│   ├── radio_stations.json               # Persistent radio station list
│   │
│   ├── routes/
│   │   ├── __init__.py                   # Blueprint registration (7 blueprints)
│   │   ├── auth.py                       # /api/login, /api/check-auth, /api/change-password
│   │   ├── files.py                      # /api/files, /api/audio, /api/metadata, /api/cover, /api/lyrics
│   │   ├── youtube.py                    # /api/yt-search, /api/yt-proxy, /api/expand-playlist, /api/preview
│   │   ├── radio.py                      # /api/radio-stations, /api/radio-proxy, /api/radio-now-playing
│   │   ├── downloads.py                  # /api/start-download, /api/status, /api/pause/resume/retry/cancel
│   │   ├── playlists.py                  # /api/playlists/backup, restore, list
│   │   └── admin.py                      # /api/health, /api/backfill, /api/upload, /api/settings, /api/logs
│   │
│   ├── workers/
│   │   ├── download.py                   # Batch worker, yt-dlp worker, requests worker
│   │   └── metadata.py                   # Sidecar extraction, metadata scan
│   │
│   ├── models/
│   │   ├── db.py                         # SQLite init, CRUD, WAL checkpoint
│   │   ├── batch.py                      # DownloadBatch dataclass
│   │   └── cache.py                      # LRUCache with TTL
│   │
│   ├── services/
│   │   ├── lrclib.py                     # Lyrics API client + circuit breaker
│   │   ├── icy.py                        # ICY/SHOUTcast metadata parser + background poller
│   │   └── radio_stations.py             # Default stations + JSON file storage
│   │
│   ├── utils/
│   │   ├── security.py                   # auth_required decorator, rate limiter, SSRF guard
│   │   ├── file_utils.py                 # safe_path, is_audio_file, sidecar helpers
│   │   └── svg.py                        # generate_fallback_svg() with genre themes
│   │
│   └── downloads/                        # Audio files + .metadata/ sidecars
│       ├── track1.mp3
│       ├── track2.mp3
│       └── .metadata/
│           └── track_name/
│               ├── cover.jpg
│               ├── lyrics.lrc
│               └── info.json
│
├── docs/
│   ├── ARCHITECTURE.md                   # ← This file
│   ├── FUTURE_UPGRADES.md                # Roadmap & future ideas
│   ├── PROXMOX_DEPLOY.md                 # 1-click Proxmox deployment
│   ├── CLEAN_SONGS.md                    # Existing songs cleanup method
│   └── retrowave-DESIGN.md               # RetroWave design system spec
│
├── scripts/
│   ├── deploy.sh                         # Universal deploy (detects Docker/native/Codespaces)
│   └── install-proxmox.sh               # 1-click Proxmox LXC/VM installer
│
├── .devcontainer/
│   ├── devcontainer.json                 # GitHub Codespaces config
│   └── setup.sh                          # Codespaces auto-setup
│
├── .env.example                          # Environment variable template
├── .gitignore
├── docker-compose.yml                    # Production orchestration (server + client)
├── Dockerfile                            # Root Dockerfile (multi-stage)
├── neotokyo-grabber.service              # systemd unit for backend
├── neotokyo-player.service               # systemd unit for frontend
├── start.sh                              # Watchdog: auto-restarts both services
├── start-prod.sh                         # Production build + serve
└── README.md
```

---

## 3. API Reference

Base URL: `http://localhost:5050`

**Authentication:** Session-based (cookies). CSRF token required via `X-CSRF-Token` header for state-changing requests. Fetch token via `GET /api/csrf-token`.

**CORS:** Controlled by `CORS_ORIGIN` env var (default `http://localhost:3000`). Credentials enabled. `Vary: Origin` header set.

### Player Endpoints (No Auth Required)

#### `GET /api/files`
List audio files in the downloads directory.
- Query: `?sort=name|date&order=asc|desc&limit=N&offset=M`
- Response: `{ files: [{ name, path, size, modified }], count, total }`

#### `GET /api/audio/<path:filename>`
Stream an audio file. Supports `Range` headers for seeking.

#### `GET /api/metadata/<filename>`
Get metadata for a single audio file (sidecar `info.json` + mutagen tags).
- Response: `{ title, artist, genre, album, duration, has_cover, has_lyrics, filename }`

#### `POST /api/metadata-batch`
Get metadata for multiple files at once.
- Body: `{ files: ["track1.mp3", ...] }`
- Response: `{ metadata: { "track1.mp3": {...}, ... } }`

#### `GET /api/cover/<filename>`
Serve cover art for an audio file (from `.metadata/<basename>/cover.*`). Returns image or fallback SVG.

#### `GET /api/lyrics/<filename>`
Serve lyrics file (LRC format) from `.metadata/<basename>/lyrics.lrc`.

#### `POST /api/yt-search`
Search YouTube via yt-dlp.
- Body: `{ query, page?, per_page? }`
- Response: `{ results: [{ url, title, uploader, duration, thumbnail }], count, total, has_more }`

#### `GET /api/yt-proxy/<video_id>`
Proxy YouTube audio stream (avoids CORS). Returns audio stream with `X-YT-Duration`, `X-YT-Title` headers.

#### `GET /api/radio-stations`
Get list of radio stations. Response: `{ stations: [{ name, url, genre }] }`

#### `GET /api/radio-now-playing`
Get now-playing metadata for active radio stream (ICY metadata polling).

#### `GET /api/radio-proxy?url=<encoded>`
Proxy radio stream (avoids CORS). Returns audio stream.

#### `GET /api/playlists/backup/latest`
Get most recent playlist backup (public read).

### Grabber Endpoints (Auth Required + CSRF)

#### `POST /api/login`
Authenticate as admin. Body: `{ username, password }`. Response: sets session cookie.

#### `GET /api/check-auth`
Check if session is valid.

#### `POST /api/change-password`
Change admin password. Body: `{ current_password, password }`.

#### `POST /api/parse-urls`
Extract URLs from raw text. Body: `{ text }`.

#### `POST /api/parse-csv`
Extract URLs from uploaded CSV file (multipart).

#### `POST /api/parse-gsheet`
Extract URLs from published Google Sheet. Body: `{ url }`.

#### `POST /api/preview`
Fetch yt-dlp metadata for each URL. Body: `{ files: [{ url, filename }] }`.

#### `POST /api/start-download`
Begin a batch download.
- Body: `{ files, label, save_dir, format_opt, concurrency, bandwidth_limit, tag_title, tag_artist, webhook }`
- Format options: `mp3_128`, `mp3_320`, `flac`, `opus`, `best`, `original`
- Response: `{ download_id, entry }`

#### `GET /api/download-status/<id>`
Poll batch download progress. Returns per-file status, speed, ETA.

#### `GET /api/downloads`
List all download history. Falls back to SQLite.

#### `GET /api/active-downloads`
List only active/queued downloads.

#### `POST /api/pause/<id>` / `POST /api/resume/<id>` / `POST /api/cancel/<id>` / `POST /api/retry/<id>`
Control download batches.

#### `POST /api/backfill`
Scan all files and generate missing sidecar metadata.

#### `GET /api/csrf-token`
Get CSRF token (stored in session).

#### `GET /api/logs?lines=N`
Fetch recent log lines. Default 200.

#### `GET /api/health`
Server health: status, ffmpeg, lrclib, python version, download dir.

#### `GET /api/metrics`
Prometheus metrics (or basic text format if prometheus_client not installed).

#### `GET /api/filesystem/list?path=...`
List directories/files at a path.

#### `POST /api/filesystem/mkdir`
Create directory. Body: `{ path }`.

#### `POST /api/save-dir`
Persist last-used save directory.

#### `POST /api/expand-playlist`
Expand YouTube/SoundCloud playlist URL. Body: `{ url }`.

#### `POST /api/playlists/backup`
Save playlists to server (auto-sync). Body: `{ data, version, device }`.

#### `GET /api/playlists/backup?limit=N`
List playlist backups (auth required).

#### `POST /api/upload`
Upload audio file (multipart).

#### `POST /api/find-cover`
Search for cover art via YouTube/ iTunes. Body: `{ title, artist }`.

#### `POST /api/files/cover/<path:filename>` / `DELETE /api/files/cover/<path:filename>`
Upload/delete cover art for a file.

### Status Values

**Batch status:** `queued`, `running`, `paused`, `done`, `cancelled`
**Per-file status:** `queued`, `downloading`, `processing`, `complete`, `error`, `cancelled`

---

## 4. User Flow

### Landing / Now Playing
```
Open http://localhost:3000
  │
  ▼
HomePage renders:
  ├── Left: AlbumArt (gradient or cover) + spin animation when playing
  ├── Center: TrackInfo (title/artist/source badge) + ProgressBar + VUMeter
  ├── Right (lg+): LyricsPanel with synced lyrics + Equalizer
  └── Bottom: PlayerBar (persistent across all pages)
        ├── Progress bar (top edge, clickable)
        ├── Track info + source badge
        ├── Shuffle / Prev / Play-Pause / Next / Repeat buttons
        └── Volume slider + mute toggle
```

### Library Browsing
```
Navigate to /library
  │
  ▼
LibraryPage:
  ├── Fetches file list from GET /api/files
  ├── Loads metadata batch from POST /api/metadata-batch
  ├── Caches in localStorage
  ├── Search bar filters by title/artist
  ├── Sort by name/date asc/desc
  ├── Multi-select mode with checkboxes
  ├── Click to play immediately
  └── "Add to Playlist" → modal with playlist picker
```

### Radio Streaming
```
Navigate to /radio
  │
  ▼
RadioPage:
  ├── Fetches stations from GET /api/radio-stations
  ├── Click station → audioEngine.play() via radio proxy
  ├── Polls now-playing every 5s: GET /api/radio-now-playing
  ├── Add custom station form (name, URL, genre)
  └── Remove custom station
```

### YouTube Search & Play
```
Navigate to /youtube
  │
  ▼
YouTubePage:
  ├── Search box → POST /api/yt-search (pagination: Load More)
  ├── Results: thumbnail, title, uploader, duration
  ├── Click to play via yt-proxy (GET /api/yt-proxy/<id>)
  ├── Multi-select → download batch (maps YT ID to local filename)
  └── Add to Playlist with auto-download option
```

### Playlists
```
Navigate to /playlists
  │
  ▼
PlaylistsPage:
  ├── List all playlists with track count
  ├── Create new playlist (name input)
  ├── Delete playlist
  ├── Play all (respects repeat/shuffle)
  ├── Remove tracks from playlist
  ├── Drag-to-reorder tracks
  ├── "Add from Library" modal
  └── Admin section (with grabbar auth):
        ├── List backups from server
        ├── Restore from backup
        ├── Backup Now button
        └── Auto-restore on init if no local playlists
```

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| Space | Play/Pause |
| Left/Right | Seek ±10s (accelerates on hold) |
| Up/Down | Volume ±0.05 |
| M | Toggle mute |
| N | Next track |
| P | Previous track |
| F | Toggle fullscreen |
| ? | Toggle shortcut cheatsheet |

**OSD overlays:** Seek shows `+10s` / `-10s` centered overlay. Volume shows bar. Mute shows "Muted".

### Sleep Timer
- Quick presets: 15min, 30min, 60min, End of Playlist, End of Track
- Active countdown in Header next to clock
- Circular SVG progress ring around timer icon in PlayerBar
- 30-second warning toast with "Cancel Sleep" button

### Audio Engine Pipeline
```
HTMLAudioElement / MediaStream
  │
  ▼
GainNode (volume control)
  │
  ▼
10× BiquadFilterNode (peaking EQ: 32Hz–16kHz)
  │
  ▼
AnalyserNode (FFT 256, frequencyBinCount 128)
  │
  ▼
AudioContext.destination (speakers)
```

---

## 5. Admin Flow

### Authentication
```
User clicks "Admin" in Sidebar or Header
  │
  ▼
GET /api/csrf-token → stores token in session
  │
  ▼
Is user logged in? (Flask session)
  ├── No → Show AdminLoginModal
  │         │
  │         ▼
  │      Enter username + password
  │         │
  │         ▼
  │      POST /api/login → sets session cookie
  │         │
  │         ├── 200: navigate to /admin/dashboard
  │         └── 401: show error
  │
  └── Yes → RequireAuth checks session
            │
            ├── Valid → render AdminLayout
            └── Invalid → redirect to home
```

### Admin Layout
```
AdminLayout (Retrowave-themed)
  ├── Sidebar (56px wide, dark navy)
  │   ├── NEOTOKYO ADMIN logo (gradient)
  │   ├── Dashboard      (BarChart3 icon)
  │   ├── Songs          (Music icon)
  │   ├── Import         (Upload icon)
  │   ├── Uploads        (FileUp icon)
  │   ├── Downloads      (Download icon)
  │   ├── Radio          (Radio icon)
  │   ├── Backups        (Shield icon)
  │   ├── Webhooks       (Globe icon)
  │   ├── Settings       (Settings icon)
  │   ├── Logs           (FileText icon)
  │   ├── Browse         (FolderOpen icon)
  │   ├── Scanner        (Scan icon)
  │   └── ← Back to Player link
  │
  ├── Main Content (scrollable)
  │   └── <Outlet /> (active admin page)
  │
  └── Each page has:
        ├── Section header with icon + Bebas Neue title
        ├── Gradient action buttons (pink→purple)
        └── Dark navy cards/panels with neon borders
```

### Admin Pages

**Dashboard** — `/admin`
- Stat tiles: Total Songs (Music icon), Library Size (Download icon), Active Downloads (BarChart3 icon), Server Uptime (Activity icon), Last Backup (Clock icon), Radio Stations (Radio icon)
- Each tile color-coded (green=ok, yellow=warning, pink=highlight)
- Server health info (ffmpeg, lrclib, python version)
- Auto-refresh every 10s

**Songs** — `/admin/songs`
- Table of all audio files with metadata (title, artist, genre)
- Search/filter, play preview, view/edit metadata
- Cover art display, delete file

**Import** — `/admin/import`
- URL paste, CSV drag-drop, Google Sheets import
- YouTube search built-in
- Format selector: MP3 128/320, FLAC, OPUS, Best Audio, Original
- Concurrency slider (1–5), bandwidth limit
- Tag templates: `{title}`, `{uploader}`, `{artist}`, `{album}`
- Webhook URL field

**Uploads** — `/admin/uploads`
- Drag-and-drop local file upload
- Uploaded file list with status
- Extract URL button

**Downloads** — `/admin/downloads`
- Download history table with batch label, status, progress
- Per-file progress bars with speed/ETA (neon gradient)
- Pause/resume/cancel/retry controls
- Status sections: Running, Queued, Completed, Failed
- Gradient color-coded progress bars (electric-blue → hot-pink)

**Radio** — `/admin/radio`
- Station list with hover glow effect
- Add new station (name, URL, genre)
- Remove station
- Test connection button

**Backups** — `/admin/backups`
- List playlist backups from server
- Restore from backup
- Backup Now button
- Scheduled backups section

**Webhooks** — `/admin/webhooks`
- List configured webhook URLs
- Add/remove webhooks
- Webhook guide panel

**Settings** — `/admin/settings`
- Admin password change (current + new password confirmation)
- LRCLIB enable/disable toggle
- Server configuration display
- Backfill covers button
- Server info

**Logs** — `/admin/logs`
- Real-time log viewer with auto-refresh (every 5s)
- Dark terminal-style pre block with neon accent
- Copy to clipboard
- Filter by log level

**Browse** — `/admin/browse`
- Directory listing of download folder
- Navigate folders, view files
- Electric-blue folder icons

**Scanner** — `/admin/scanner`
- Scan all files for missing metadata
- Fix covers for files without album art
- Per-job status rows with source badges

---

## 6. Frontend Component Tree

```
<App>
  <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/radio" element={<RadioPage />} />
          <Route path="/youtube" element={<YouTubePage />} />
          <Route path="/playlists" element={<PlaylistsPage />} />
        </Route>
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<AdminDashboard />} />
          <Route path="songs" element={<AdminSongs />} />
          <Route path="import" element={<AdminImport />} />
          <Route path="uploads" element={<AdminUploads />} />
          <Route path="downloads" element={<AdminDownloads />} />
          <Route path="radio" element={<AdminRadio />} />
          <Route path="backups" element={<AdminBackups />} />
          <Route path="webhooks" element={<AdminWebhooks />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="browse" element={<AdminBrowse />} />
          <Route path="scanner" element={<AdminScanner />} />
        </Route>
      </Routes>
      <PlayerBar />              ← Fixed bottom, always visible
    </BrowserRouter>
  </ErrorBoundary>
</App>
```

### Player Components

| Component | Description |
|-----------|-------------|
| `AppShell` | Wraps all pages with sidebar, header, scanlines, download tracker, toasts. Registers global keyboard shortcuts |
| `Header` | Top bar: clock, admin button, station ID. Polls time every 1s |
| `Sidebar` | Desktop nav + BottomNav (mobile). Playlist browser, admin button |
| `PlayerBar` | Fixed bottom: progress bar, track info, shuffle/prev/play/next/repeat, volume/mute, mobile lyrics toggle |
| `AlbumArt` | Square album art with 6 gradient themes (sakura/neon/zen/retro/wave/cyber), spin animation, kanji overlay |
| `ProgressBar` | Seekable gradient bar (pink→yellow→cyan), hover tooltip, radio LIVE indicator |
| `VUMeter` | 64-bin canvas frequency visualizer, color stops cyan→green→orange→pink |
| `Equalizer` | 10-band peaking EQ (32Hz–16kHz), 6 presets, per-band gain sliders |
| `LyricsPanel` | Synced karaoke lyrics with active line glow, time counters, signal indicator |
| `QueuePanel` | Slide-out queue with drag reorder, remove, play next, now-playing indicator |
| `SleepTimer` | Countdown with SVG progress ring, presets, 30s warning |
| `RecentlyPlayed` | Horizontal scrollable section on HomePage |
| `TrackInfo` | Source badge + title/artist display, truncated with ellipsis |
| `ScanlineOverlay` | Fixed z-40 CRT scanline effect, 3% opacity, pointer-events none |
| `StreamToast` | Red-themed error notification, auto-dismiss 5s |
| `DownloadProgress` | Tracks active downloads, polls every 1s, per-file progress |
| `ShortcutCheatsheet` | Keyboard shortcut reference modal |
| `Skeleton` | Loading placeholders |

### Pages

| Page | Description |
|------|-------------|
| `HomePage` | Album art + progress + VU + lyrics (desktop: sidebar layout, mobile: bottom drawer) |
| `LibraryPage` | File list with metadata, search, sort, multi-select, play, add-to-playlist |
| `RadioPage` | Station grid, now-playing polling, add custom station |
| `YouTubePage` | Search with pagination, play, download, add-to-playlist |
| `PlaylistsPage` | CRUD, reorder tracks, backup/restore admin section |

### TypeScript Interfaces (`types/audio.ts`)

```typescript
interface AudioTrack {
  id: string; title: string; artist?: string; duration: number;
  src: string; albumArt?: string; filename?: string;
  source?: PlayerSource; videoId?: string; localEntry?: string;
}
interface RadioStation { name: string; url: string; genre?: string; }
interface YouTubeResult { url: string; title: string; uploader?: string; duration: number; thumbnail?: string; }
interface Playlist { id: string; name: string; tracks: PlaylistItem[]; created: number; }
interface PlaylistItem { title: string; artist?: string; duration: number; src: string; albumArt?: string; filename?: string; videoId?: string; localEntry?: string; }
type PlayerSource = 'local' | 'youtube' | 'radio';
type RepeatMode = 'none' | 'all' | 'one';
```

### EQ Presets
```
Normal:     [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
Deep Bass:  [6, 5, 3, 1, 0, -1, -2, -3, -4, -5]
Vocals:     [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2]
Treble:     [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6]
Full Bass:  [5, 4, 3, 2, 1, 0, -1, -2, -3, -4]
Soft:       [-2, -1, 0, 1, 2, 2, 1, 0, -1, -2]
```

---

## 7. Design System

### RetroWave Theme (Current)

The admin panel uses the **RetroWave** design system (see `docs/retrowave-DESIGN.md` for full spec):

**Colors:** Hot Pink `#FF006E`, Purple `#8338EC`, Electric Blue `#3A86FF` over deep navy `#0A0A2E`
**Fonts:** Bebas Neue (display), Poppins (body), IBM Plex Mono (code)
**Effects:** Neon glow shadows, pink-to-purple gradient buttons, dark navy card surfaces
**Admin:** Section headers with Lucide icons, Bebas Neue `tracking-[2px]`, gradient primary buttons `from-hot-pink to-purple` with `shadow-glow-pink-sm`

### Midnight Arcade Theme (Legacy Player)

The player frontend uses the **Midnight Arcade** design system:

**Colors:**
```
Surface         #111224  │  Deep Midnight
Primary         #ffb1c3  │  Neon Pink
Primary Cont.   #ff4b89  │  Bright Pink
Secondary       #bdf4ff  │  Electric Blue
Secondary Cont. #00e3fd  │  Cyan
Tertiary        #ffb77f  │  Sunset Orange
```

**Typography:** Anybody (display), Syne (body), Space Mono (labels), Noto Sans JP (decorative)

**Icons:** Lucide React (player), Material Symbols (legacy grabbar)

**Animations:** `spin-slow` (4s), `fade-in` (0.6s), `slide-up` (0.3s), `pulse-dot` (1.2s), `vu-flicker` (1s)

**Elevation:** Inner shadows for "wells", beveled edges, glow tiers, scanline overlay

**Breakpoints:** `xs: 420px`, `sm: 640px`, `md: 768px`, `lg: 1024px`

**Album Art Themes (6):** Sakura (pink), Neon (cyan), Zen (green), Retro (magenta), Wave (orange), Cyber (pink)

---

## 8. Security Model

### Authentication

- **Login:** `POST /api/login` validates username/password against hashed credentials (werkzeug `generate_password_hash` / `check_password_hash`)
- **Session:** Flask signed cookies with httpOnly, SameSite=Strict, 24h expiry
- **CSRF:** Token generated via `secrets.token_hex(32)`, stored in session, validated on all POST/PUT/DELETE via `X-CSRF-Token` header (except `/api/login`)
- **Rate limiting:** 5 failed login attempts per 5 minutes per IP (429 response)
- **Password change:** Requires `current_password` validation, min 12 chars
- **Default credentials:** Random password generated on startup if `ADMIN_PASSWORD` env var not set

### Access Control

| Route Category | Auth Required | Description |
|----------------|--------------|-------------|
| Player routes (`/api/files`, `/api/audio/*`, `/api/metadata/*`, `/api/yt-search`, `/api/radio-*`) | No | Read-only |
| Grabber routes (downloads, admin, settings) | Yes (session) | Write operations |
| Auth routes (`/api/login`, `/api/check-auth`, `/api/csrf-token`) | No | Authentication |
| Playlist backup read (`GET /api/playlists/backup/latest`) | No | Public read |

### Security Headers (set on all responses)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Input Validation
- `safe_path()` prevents path traversal
- `validate_external_url()` checks SSRF via private IP detection
- Webhook URLs validated against SSRF guard
- Playlist name capped at 128 chars, device name at 64 chars
- `lines` log parameter capped at 500
- Error responses sanitized in production (log_id returned, full error logged server-side)

### SSRF Protection
- DNS resolution timeout (5s) via `socket.setdefaulttimeout()`
- Private IP range check (`_is_private_ip()`) on all external URLs
- All redirect hops validated in `resolve_redirect()`
- `requests` session with empty proxy settings

### Recommendations for Production
1. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `FLASK_SECRET_KEY` env vars
2. Add TLS via reverse proxy (Caddy, nginx, Cloudflare Tunnel)
3. Restrict CORS to specific origin in production
4. Run behind gunicorn (not Flask dev server)
5. Use non-root user in Docker

---

## 9. Deployment Guide

### Prerequisites
- Python 3.12+
- Node.js 24+
- FFmpeg
- yt-dlp

### Development

```bash
# Server
cd server && pip install -r requirements.txt && python app.py
# → http://localhost:5050

# Client (separate terminal)
cd client && npm install && npm run dev
# → http://localhost:3000
```

### Docker Compose (Production)

```bash
docker compose up --build -d
```

| Service | Container | Internal | External |
|---------|-----------|----------|----------|
| Server | `neotokyo-server` | 5050 | 5050 |
| Client | `neotokyo-client` | 80 | 80 |

Client nginx reverse-proxies `/api/` to `http://server:5050`.

### systemd (Native)

```bash
sudo cp neotokyo-grabber.service /etc/systemd/system/
sudo cp neotokyo-player.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now neotokyo-grabber neotokyo-player
```

### Watchdog Script

```bash
./start.sh           # Start both with auto-restart
./start.sh status    # Check status
./start.sh logs      # View logs
./start.sh stop      # Stop
./start.sh restart   # Full restart
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5050` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `ADMIN_USERNAME` | `admin` (auto-generated random) | Admin login username |
| `ADMIN_PASSWORD` | random 16-char | Admin login password |
| `FLASK_SECRET_KEY` | random UUID hex | Session signing key |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `LRCLIB_TIMEOUT` | `4` | LRCLIB request timeout (seconds) |
| `LRCLIB_SKIP` | `0` | Set to `1` to disable lyrics fetching |
| `GUNICORN_WORKERS` | `4` | Number of gunicorn worker processes |
| `GUNICORN_THREADS` | `2` | Threads per worker |
| `MAX_CONCURRENCY` | `5` | Max concurrent downloads |
| `MAX_UPLOAD_MB` | `32` | Max upload file size in MB |

### Docker Compose Environment

For Docker, use a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
# Edit .env with your credentials
docker compose up
```

### Backup

| Path | Description | Frequency |
|------|-------------|-----------|
| `server/batch_history.db` | Download history | Daily |
| `server/downloads/` | Audio files + metadata | Weekly |
| Player playlists | Auto-backed up to server via API | On change |

---

## 10. Remote Access

### Option 1: Local Network
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# Then access from any device on WiFi:
# http://192.168.x.x:3000  (Player)
# http://192.168.x.x:5050  (API)
```

### Option 2: Tailscale (Recommended)
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# Stable IP like 100.x.x.x — access from any device with Tailscale
```

### Option 3: Cloudflare Tunnel (Domain Required)
1. Point DNS to Cloudflare
2. Install cloudflared and create tunnel
3. Route `player.your.domain` → `localhost:3000`, `api.your.domain` → `localhost:5050`

### Option 4: Proxmox LXC
See `docs/PROXMOX_DEPLOY.md` for full 1-click deployment guide.

---

## 11. Contributing

### Code Style

**Python (Server):**
- PEP 8, type hints encouraged, `snake_case` for functions/vars
- Use module-level `logger`, not `print()`
- Keep routes in their respective modules under `routes/`

**TypeScript/React (Client):**
- `npm run lint` and `npm run build` before committing
- `verbatimModuleSyntax` (explicit `import type`)
- Components: PascalCase, hooks: `use*`, services: camelCase, stores: camelCase
- Tailwind v4 classes — no CSS modules or styled-components

### Commit Messages
```
feat: add YouTube playlist expansion
fix: handle missing cover art gracefully
docs: update API reference
refactor: extract EQ logic into separate hook
chore: bump yt-dlp to 2026.06.09
```

### Adding a New Page
1. Create page in `client/src/pages/`
2. Add route in `App.tsx`
3. Add sidebar link in `Sidebar.tsx` and `BottomNav` (mobile)
4. Add API endpoint to `grabberAPI.ts` if needed

### Adding a New API Route
1. Add handler in appropriate `server/routes/` module
2. Use `@require_auth` decorator if auth-required
3. Register in `client/src/services/grabberAPI.ts`
4. Update this doc's API reference in [Section 3](#3-api-reference)

### Adding a New Component
1. Place in `components/player/`, `components/layout/`, or `components/ui/`
2. Check existing components for patterns
3. Import types from `types/audio.ts`

---

## 12. Troubleshooting

### Common Issues

**Server won't start:**
- Check Python 3.12+: `python3 --version`
- Install deps: `pip install -r requirements.txt`
- Check FFmpeg: `ffmpeg -version`
- Port 5050 already in use: `lsof -i :5050`

**Client won't start:**
- Check Node.js 24+: `node --version`
- Install deps: `npm install`
- Port 3000 already in use: `lsof -i :3000`

**No audio on first play (Chrome):**
- Chrome requires user gesture for AudioContext. Click Play button — the `audioEngine.resume()` call needs a direct user gesture.

**Download fails with "No output file":**
- Some SoundCloud/streaming URLs fail conversion. Try different format or direct URL mode.

**"CSRF token missing or invalid":**
- Refresh the admin page to get a new token
- Check browser cookies aren't blocked

**Server crash with UnicodeEncodeError on cover endpoint:**
- Filenames with non-Latin-1 characters in headers (ETag). Server now URL-encodes ETag values — should be fixed. If you see this, update the header encoding.

### Getting Help
Open a GitHub issue at https://github.com/anomalyco/mini_radio/issues

---

*Generated: 2026-06-28 | NEOTOKYO FM v2.0*
