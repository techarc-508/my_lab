# NEOTOKYO FM 🎵

A retro anime music player that lives in your homelab — stream radio, search YouTube, manage playlists, and vibe to a fully themed synthwave UI.

```
▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜
▌  █▄▄▄ █▄▄▄ █▄▄▄   ▄█▄ ▄▄▄ █   █ █ █▄▄▄   ▐
▌  █▄▄▄ █▄▄  █▄▄    █▄▄ █▄█ █▄▄▄█ █ █▄▄    ▐
▌  █   ▀▀▀▀▀ ▀▀▀    ▀   ▀ ▀ ▀   ▀ ▀ ▀▀▀    ▐
▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜
▌        87.5 FM  —  Midnight Arcade          ▐
▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟
```

---

## What is this?

Two services working together:

| Service | What it does | Port | Tech |
|---------|-------------|------|------|
| **Server** 🐍 | Backend API — downloads, metadata, radio proxy, auth | `:5050` | Flask + yt-dlp + FFmpeg + SQLite |
| **Client** ⚛️ | Frontend — the actual music player you see | `:3000` dev / `:80` prod | React + TypeScript + Zustand + Tailwind |

```
┌──────────┐    HTTP/JSON     ┌──────────┐
│  Client   │ ◄─────────────► │  Server   │
│ (React)   │   /api/*        │  (Flask)  │
└────┬─────┘                  └────┬──────┘
     │  Web Audio API               │  yt-dlp + FFmpeg
     ▼                              ▼
  Browser Audio                 Downloaded MP3s
```

---

## v1 → v5: What changed? 🚀

### v1 — "It works" (the prototype)

The first version was functional but rough. A Flask admin panel with basic CRUD, a vanilla JS player, and a lot of hardcoded everything. Think: CRT scanlines, neon CSS, but no real design system. You could play music and download stuff, but it looked like a 2005 forum theme having a fever dream.

**v1 highlights:**
- Flask backend with basic auth (random password per restart)
- Vanilla JS admin panel for batch downloads
- Simple music player with no state management
- Hardcoded styles, no reusable components
- No Docker support, manual setup only

### v5 — "It lives here now" (production-ready)

Everything rebuilt from scratch with a real frontend framework, a cohesive retro-neon design system, and production deployment. YouTube video streaming, dynamic news, and a full player experience.

**v5 highlights:**
- ⚛️ **React + TypeScript frontend** — Zustand state management, proper component architecture
- 🎨 **RetroWave Design System** — Hot pink, electric purple, neon cyan, glass morphism, neon glows, the works
- 🔐 **Session-based auth** — Login with CSRF tokens, rate limiting, 24h expiry
- 📦 **Docker Compose** — One command to run everything (`docker compose up --build`)
- 🌐 **Internet radio** — Stream stations with now-playing metadata polling
- 🔍 **YouTube search + video player** — Search, stream audio OR video directly in-browser with server-side proxy, batch download
- 🎵 **Synced lyrics** — Two-column overlay with LRCLIB fallback, karaoke-style highlighting
- ⚙️ **Full settings page** — Profile management, password changes, session control, emoji avatars
- 🎛️ **10-band equalizer** — With 6 presets and real-time visualization
- 📊 **VU meter** — 64-bin frequency visualizer
- 🌙 **Light/dark theme** — Full theme switching with CSS variables
- 🏠 **Admin panel** — RetroWave-themed with glowing buttons, gradient headers, and glass panels
- 🔧 **Proxmox LXC deployment** — Automated install scripts for container-based hosting
- 📱 **PWA support** — Installable with auto-update
- 📰 **Live City Pop news** — Dynamic trivia section pulling from Google News + Reddit RSS
- 🎬 **YouTube video mode** — Fullscreen overlay + mini-player with keyboard shortcuts (Space, M, F, arrows)

### v5.1 — "Production hardened" (deployment fixes + bulk import)

Hardened for real production use on Proxmox LXC. Fixed auth bugs, added bulk YouTube import, and made deploys safe (secrets and data survive rebuilds).

**v5.1 highlights:**
- 🔐 **Scanner auth fix** — Admin scanner page now sends Bearer token (was 401 on every poll)
- 🔑 **Password sync** — `ADMIN_PASSWORD` env var auto-syncs to SQLite DB on startup (fixes stale hash after deploy)
- 🗄️ **Secret key fix** — Empty `FLASK_SECRET_KEY` env var no longer bypasses auto-generation
- 📦 **Safe deploys** — `deploy-pve.sh` preserves `.env` and `server/downloads/` across rebuilds
- 🎵 **Bulk YouTube import** — Script to download from a list of URLs with dedup (`scripts/bulk-import-yt.py`)
- 🐛 **Deploy script rewrite** — Fixed sshpass quoting, added `pct_cmd`/`ssh_cmd` helpers, health check works

### The numbers

| | v1 | v5 |
|---|---|---|
| Frontend framework | Vanilla JS | React 19 + TypeScript |
| State management | None | Zustand 5 |
| CSS approach | Inline + scattered classes | Tailwind v3 + design tokens |
| Auth | Random password, no sessions | Session cookies + CSRF + rate limiting |
| Deployment | Manual `python app.py` | Docker Compose or systemd + watchdog |
| Components | ~3 flat files | 50+ components across pages, player, layout |
| Design | "It has color" | Full RetroWave system with neon glows, glass, gradients |
| Music features | Play a file | Radio, YouTube (audio + video), lyrics, EQ, VU, playlists, metadata |
| Admin | Flask + Jinja templates | React SPA with real-time batch progress |

---

## Features 🎧

### Player

- **Now Playing** — Album art with 6 gradient themes (sakura, neon, zen, retro, wave, cyber), synced karaoke lyrics, 64-bin VU meter, 10-band EQ with 6 presets
- **Library** — Browse local files with search, multi-select, metadata cache, add-to-playlist
- **Radio** — Internet radio stations with now-playing metadata, custom station management
- **YouTube** — Search with pagination, multi-select, direct in-browser play (audio + video via server proxy), batch download
- **Playlists** — Create/reorder/delete, play all, server backup/restore
- **Audio Engine** — Web Audio API with BiquadFilter chain, AnalyserNode, MediaElementSource
- **PWA** — Installable, standalone display, auto-update
- **Keyboard shortcuts** — Space (play/pause), arrows (seek/volume)

### Server

- **Download engine** — yt-dlp + FFmpeg for 320kbps MP3, format selection (MP3/FLAC/OPUS/Best)
- **Batch downloads** — Queue with progress, speed, ETA, pause/resume, cancel, retry
- **Concurrent workers** — Configurable 1–5 parallel downloads
- **Bandwidth limiting** — Per-batch speed cap
- **Tag templates** — Dynamic metadata via `{title}`/`{uploader}` placeholders
- **Webhook** — POST batch completion payload to any URL
- **Radio proxy** — Stream internet radio through the server
- **YouTube video proxy** — Stream YouTube videos server-side (up to 720p) with Range header support
- **File browser** — Browse downloads, view metadata (title, artist, genre, cover art, lyrics)
- **Sidecar metadata** — `cover.jpg`, `lyrics.lrc`, `info.json` stored alongside audio
- **LRCLIB lyrics** — Auto-fetch synced lyrics with circuit breaker
- **Backfill** — One-click metadata generation for all untagged files
- **SQLite persistence** — Download history survives restarts
- **Prometheus metrics** — Optional `/api/metrics` endpoint
- **Auto-backup** — Daily 18:30 UTC backup of radio stations + playlists

---

## Quick Start 🚀

### Docker (recommended)

```bash
docker compose up --build
# Client  → http://localhost
# Server  → http://localhost:5050
```

### Development

```bash
# Server
cd server
pip install -r requirements.txt
python app.py
# → http://localhost:5050

# Client (separate terminal)
cd client
npm install
npm run dev
# → http://localhost:3000 (proxies /api/* → :5050)
```

### Proxmox LXC

```bash
# From PVE host
bash deploy/install.sh
```

---

## Project Structure 📁

```
mini_radio/
├── server/                    # Flask backend
│   ├── app.py                 # App factory + create_app()
│   ├── config.py              # Config with env var overrides
│   ├── models/db.py           # SQLite helpers (WAL mode)
│   ├── routes/                # 12 blueprints: auth, files, youtube,
│   │   ├── auth.py            #   radio, downloads, playlists,
│   │   ├── files.py           #   admin, subsonic, update,
│   │   ├── youtube.py         #   analytics, podcasts, oauth, trivia
│   │   ├── radio.py
│   │   ├── downloads.py
│   │   ├── playlists.py
│   │   ├── admin.py
│   │   └── subsonic.py
│   ├── Dockerfile
│   └── requirements.txt
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # player/, layout/, ui/
│   │   ├── pages/             # Home, Library, Radio, YouTube,
│   │   │                      #   Playlists, Settings, Admin
│   │   ├── stores/            # Zustand stores
│   │   ├── services/          # Audio engine, API client
│   │   └── index.css          # Tailwind + CSS vars + animations
│   ├── tailwind.config.ts     # RetroWave design tokens
│   ├── Dockerfile
│   └── nginx.conf
├── design/                    # Design specs & AI prompts
├── deploy/                    # Proxmox, Cloudflare, install scripts
├── docker-compose.yml
└── README.md                  # ← You are here
```

---

## Tech Stack 💻

| Layer | Tech |
|-------|------|
| Backend | Python 3.12, Flask 3, yt-dlp, FFmpeg, mutagen, SQLite (WAL) |
| Frontend | React 19, TypeScript, Vite 6, Zustand 5, Tailwind v4, Lucide React |
| Fonts | Space Grotesk (sans), JetBrains Mono (mono), Playfair Display (serif) |
| Auth | Session cookies + CSRF tokens, rate limiting (5 attempts/5 min) |
| Audio | Web Audio API with 10-band peaking EQ, AnalyserNode |
| Deploy | Docker Compose, systemd + watchdog, Proxmox LXC |

---

## Environment Variables 🔧

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5050` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `ADMIN_USERNAME` | `admin` | Admin login username |
| `ADMIN_PASSWORD` | random | Admin password (printed to logs if unset) |
| `FLASK_SECRET_KEY` | auto-generated | Session signing key (persisted to `.flask_secret_key`) |
| `LRCLIB_TIMEOUT` | `15` | LRCLIB request timeout (seconds) |
| `LRCLIB_SKIP` | `0` | Set `1` to disable lyrics fetching |
| `GUNICORN_WORKERS` | `4` | Gunicorn worker count |
| `GUNICORN_THREADS` | `4` | Threads per worker |

---

## Security 🔒

- 🔑 Session cookies with CSRF token protection
- 🚫 Rate limiting: 5 login attempts per 5 minutes per IP
- ⏰ Auth tokens expire after 24 hours
- 🎲 Random admin password generated if none set
- 🛡️ All credential defaults removed from frontend code
- 📁 Server Dockerfile runs as non-root `appuser`
- 🔄 `FLASK_SECRET_KEY` auto-persisted on first start

---

## What's Next? 🔮

Some ideas for the road ahead:

- 🎛️ **Custom Dashboard** — A configurable homelab dashboard with real-time stats, weather, and system monitors
- 🎤 **Voice Control** — "Hey Neo, play lo-fi hip hop" via local speech recognition
- 📡 **Radio Analytics** — Track listening history, genre preferences, time-of-day patterns
- 🎨 **Theme Marketplace** — Community-contributed themes beyond RetroWave
- 🔌 **Plugin System** — Let users add their own backends (Spotify, Tidal, local MPD)
- 📺 **Media Server Integration** — Connect to Jellyfin/Plex for unified media browsing
- 🤖 **AI DJ Mode** — Auto-curate playlists based on mood, time of day, and listening history

---

## Production Health Report (ct-104) 📊

Current allocation and status on `192.168.0.104`:

| Resource | Allocated | Used | Status |
|----------|-----------|------|--------|
| RAM | 2 GB | 338 MB (17%) | Healthy — headroom for growth |
| CPU | 2 cores | ~9% idle | Healthy — load avg ~4.5 (I/O wait from disk, not CPU) |
| Storage | 20 GB | 9.6 GB (52%) | OK — consider expanding if downloads grow |
| Swap | 512 MB | 0 B | Not needed |
| Docker | 2 containers | client (11 MB), server (308 MB) | Healthy |

### Recommendations

| Item | Current | Suggested | Why |
|------|---------|-----------|-----|
| RAM | 2 GB | 2 GB (no change needed) | Server uses 308 MB, plenty of headroom |
| CPU | 2 cores | 2 cores (no change needed) | yt-dlp/FFmpeg bursty but short-lived; no sustained load |
| Storage | 20 GB | **30 GB** if downloads accumulate | At 52% now; YouTube + radio downloads grow over time |
| Client health check | `wget` on port 80 | **Fix healthcheck** | Shows "unhealthy" but actually serves fine — nginx binds to 0.0.0.0 but wget inside container may have IPv6 resolution issue |

**Bottom line**: Current allocation is fine for a single-user homelab setup. No RAM or CPU upgrade needed. Only action item: expand storage to 30 GB if you plan to download a lot of music, and fix the client Docker healthcheck.

---

## License

MIT — do whatever you want with it. Just don't blame us if you end up building a custom homelab dashboard at 3am.

---

<p align="center">
  <i>Built with neon dreams and too much caffeine ☕</i><br>
  <b>NEOTOKYO FM</b> — <i>87.5 FM — Midnight Arcade</i>
</p>
