# v4 Plan — NEOTOKYO FM

**Target: v4.0** | Following the v3 phases (all complete).

---

## Phase 4.1 — Podcast Support ✓
*Sub-phases: a) Backend core, b) Subscriptions UI, c) Episode browsing & playback, d) Auto-download & OPML*

- RSS/Atom feed parsing via `feedparser`
- Podcast subscription management: `podcasts` table + `POST/GET/DELETE /api/podcasts/subscriptions`
- Episode discovery: `episodes` table synced from feeds, metadata (title, description, pubDate, duration, enclosure URL)
- Episode download: `POST /api/podcasts/{id}/download` → enqueues in download worker
- Played/unread tracking: `podcast_episode_progress` table
- OPML import/export: `POST /api/podcasts/opml` (upload), `GET /api/podcasts/opml` (download)
- Auto-download toggle per podcast (new episodes auto-enqueued via scheduler)
- Background feed refresh: periodic task or on-admin-trigger
- UI: `PodcastsPage` with subscription grid, episode list, mark played, download button, progress indicator
- Add Podcast form (URL input + feed preview)
- Admin podcast management (list all, delete, trigger refresh)
- Podcast categories/genre tags

## Phase 4.2 — ReplayGain / Loudness Normalization
*Sub-phases: a) Analysis backend, b) Storage & query, c) Client-side gain adjustment, d) UI controls*

- FFmpeg `loudnorm` (EBU R128) analysis for existing library (batch job + per-track on import)
- Store `track_gain` (dB), `track_peak` (dBFS), `album_gain`, `album_peak` in SQLite `tracks` table
- Album gain = logarithmic average of track gains
- AudioContext gain node adjustment in `audioEngine.ts` — applies `track_gain` (or `album_gain` if album mode) to reach reference level
- Player settings toggle: Loudness Normalization (on/off), Mode (track/album)
- Optional: Re-scan library command in AdminSettings for gain analysis
- UI: indicator in player showing gain adjustment (e.g. "-3.2 dB")
- Migration: Alembic revision to add gain columns

## Phase 4.3 — Subsonic API Completion
*Sub-phases: a) Playlist endpoints, b) Search endpoints, c) Browsing endpoints, d) Scrobble & utilities*

- `getPlaylists` / `createPlaylist` / `updatePlaylist` / `deletePlaylist` / `getPlaylist`
- `search2` / `search3` (cross-entity search: artists, albums, songs)
- `getSong` (single track detail)
- `getArtists` / `getArtist` / `getAlbum` (ID3-tagged browsing endpoints)
- `getIndexes` / `getMusicFolders`
- `getLicense` (always valid — open source)
- `getRandomSongs` / `getNowPlaying`
- `scrobble` (listen event → track plays table)
- `getCoverArt` / `getAvatar` (uses existing cover endpoint)
- `stream` / `download` (range-request compatible, existing)
- `ping` / `getMusicDirectory` (existing)
- JSON response format support (`f=json`) for modern clients (Sonixd, Feishin, etc.)
- Proper XML namespacing, consistent error codes, OpenSubsonic extensions

## Phase 4.4 — User Management
*Sub-phases: a) Password reset, b) Profile page, c) Admin user CRUD, d) Session management, e) OAuth*

- Password reset: email-based flow (token expiry, email templates via SMTP) OR admin-generated reset link
- Email verification: optional config flag, verify on registration
- Profile page (`/settings/profile`): avatar upload (canvas crop + resize), display name, change password, email
- Admin user management UI: list all users, create user (inline form), edit (roles, active status), deactivate/reactivate
- Account deletion: by user (self-service) or admin
- Session management: list active sessions per user, revoke session
- OAuth 2.0 social login: Discord, Google, GitHub (python-social-auth or custom implementation)
- Rate-limit admin endpoints (extend existing `@rate_limit`)
- Alembic migration: add `email`, `email_verified`, `display_name`, `avatar_path` columns to `users`

## Phase 4.5 — Music Video Mode
*Sub-phases: a) YouTube video resolution, b) Video player overlay, c) Sync engine, d) Mini-player*

- Resolve YouTube video ID for tracks that have existing YouTube links (`tracks.youtube_id` or via `youtube.py` search fallback)
- Fetch video metadata (title, thumbnail, duration) via yt-dlp or YouTube Data API
- Video player overlay: PiP-style resizable/draggable iframe or native `<video>` with YouTube embed
- Time sync engine: align YouTube playback position with audio player position (seek both, pause both)
- Mini-player mode: small floating video when navigating away from full player
- Background video loading: prefetch next track's video metadata
- UI toggle: enable/disable video mode
- Keyboard shortcuts for video (f for fullscreen, m for minimize)

## Phase 4.6 — Mobile PWA Enhancements
*Sub-phases: a) iOS fixes, b) Install prompting, c) Background sync, d) File system API, e) Share target*

- iOS WebAudio unlock: ensure AudioContext resumes on first touch event
- Install prompt heuristics: show after 3 plays or 2nd return visit (respect `beforeinstallprompt`)
- Background sync: register `sync` events in service worker for offline queue upload when online
- Haptic feedback on player buttons (vibrate pattern for play/pause, skip)
- Touch gesture refinements: swipe left/right to skip track, pull down to collapse player, long-press for context menu
- Standalone mode UX: safe-area-inset handling, status bar color, no overscroll
- Share target API: `share_target` in manifest → accept audio files → POST to `/api/upload`
- File System Access API: pick directory for bulk library upload from device storage
- Audio focus handling: pause when another app starts playback, resume when focus returns

---

## Implementation Order

| # | Phase | Effort | Impact |
|---|-------|--------|--------|
| 1 | 4.1 Podcast Support | Large | New user segment, fills audio content gap |
| 2 | 4.2 ReplayGain | Medium | Universal listening quality improvement |
| 3 | 4.3 Subsonic API | Medium | 3rd-party client ecosystem access |
| 4 | 4.4 User Management | Large | Production-ready multi-user experience |
| 5 | 4.5 Music Video | Medium | Unique visual differentiator |
| 6 | 4.6 Mobile PWA | Medium | Better mobile adoption rate |

---

*Started: 2026-07-10*
