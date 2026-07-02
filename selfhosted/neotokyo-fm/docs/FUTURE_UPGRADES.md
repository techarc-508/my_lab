# NEOTOKYO FM — Future Upgrades & Roadmap

## Short-Term (v2.1)

- [ ] **Admin scanner progress bar** — show live per-file progress during backfill scan instead of a simple spinner
- [ ] **Batch cover fix progress** — per-job real-time status in the admin overlay (already done in AdminScanner)
- [ ] **Metadata editor in AdminSongs** — inline edit of title/artist/genre/album with save to sidecar + ID3 tags
- [ ] **Dark mode toggle for player** — the "Midnight Arcade" player theme already works; add a toggle to switch between it and RetroWave admin theme
- [ ] **Radio station genres** — add genre tags, filter by genre, per-station color badges
- [ ] **Drag-reorder in AdminRadio** — drag handles for station ordering
- [ ] **Log level filter** — in AdminLogs, filter by INFO/WARN/ERROR using tabs or dropdown
- [ ] **Confirm dialogs** — add confirm modals for destructive actions (delete song, cancel download, remove station)

## Medium-Term (v2.2–v2.3)

- [ ] **Multi-user admin accounts** — role-based access (admin/operator/viewer), per-user sessions
- [ ] **WebSocket real-time updates** — replace polling in downloads, logs, and scanner with WebSocket push via Flask-SocketIO
- [ ] **Playlist folders** — organize playlists into folders on disk, browse by folder in the player
- [ ] **Auto-download from YouTube playlists** — enter a playlist URL, auto-download all tracks with one click
- [ ] **Bulk metadata tag editing** — select multiple songs, set artist/genre/album in batch
- [ ] **iTunes / MusicBrainz metadata lookup** — enrich songs with tags from external APIs during backfill
- [ ] **FFmpeg audio conversion presets** — auto-convert uploaded files to standard format on import
- [ ] **Admin audit log** — log all admin actions (login, download, delete, settings change) to a separate audit trail
- [ ] **Scheduled downloads** — set a future time for a download batch to start
- [ ] **Radio recording scheduler** — schedule recordings of radio streams (cron-style)

## Long-Term (v3.0+)

- [ ] **Mobile app** — React Native wrapper around the web app with offline playback
- [ ] **Media server integration** — expose library via Subsonic/OpenSubsonic API (compatible with Sonixd, DSub, etc.)
- [ ] **CDN streaming** — serve audio from S3-compatible storage instead of local disk
- [ ] **MusicBrainz Picard integration** — batch fingerprint songs and fetch high-quality metadata
- [ ] **ReplayGain / loudness normalization** — scan and apply EBU R128 / ReplayGain tags
- [ ] **Music video mode** — sync album art / visualizer with downloaded music videos from YouTube
- [ ] **Podcast support** — RSS feed reader, episode download, auto-cleanup
- [ ] **AI playlist generation** — recommend tracks based on listening history via simple collaborative filtering
- [ ] **Federated sharing** — share playlists between NEOTOKYO instances (ActivityPub-style)
- [ ] **Graceful degradation without yt-dlp** — flag system dependencies and disable features gracefully if missing

## Infrastructure

- [ ] **Prometheus + Grafana dashboard** — expose metrics for downloads, active streams, errors, uptime
- [ ] **Docker healthchecks** — add healthcheck endpoints for Docker orchestration
- [ ] **Automated CI/CD** — GitHub Actions for lint, test, build, deploy
- [ ] **Load-balanced multi-node** — horizontal scale with shared NFS for audio files and Redis for session/download state
- [ ] **TLS by default** — auto-provision Let's Encrypt via Caddy reverse proxy in Docker Compose
- [ ] **Database migration framework** — Alembic or similar for schema versioning instead of raw SQLite
