# v4 Implementation Status — Complete ✅ (All Plan Items Done)

All 6 phases of the v4 plan plus the UI redesign are now fully implemented — including all 5 previously missing items and all 8 partially completed items.

**Gaps closed on 2026-07-10:**
- Password reset flow (email + self-service)
- OAuth 2.0 social login (Discord, Google, GitHub)
- Alembic migration files (001 + 002)
- Auto-download scheduler + background feed refresh
- Background video prefetch
- File System Access API (bulk directory import)
- Avatar canvas crop UI
- Admin rate limiting
- Haptic feedback wiring on player buttons
- Touch gesture wiring (swipe skip + long-press queue)
- Overscroll prevention CSS
- MediaSession playbackState signaling

---

## Phase 4.1 — Podcast Support ✅ Complete

### Core
- `podcasts` table — `server/models/db.py:111`
- `podcast_episodes` table — `server/models/db.py:126`
- `podcast_episode_progress` table (NEW — incremental resume position) — `server/models/db.py`
- RSS/Atom feed parsing via `feedparser` — `server/routes/podcasts.py:39`
- Episode progress CRUD endpoints — `GET/PUT /api/podcasts/episodes/[id]/progress`

### Subscription & Sync
- Subscribe/unsubscribe endpoints — `server/routes/podcasts.py:144`
- Full sync + per-podcast sync + sync-all — `server/routes/podcasts.py`
- Auto-download toggle per podcast — `server/routes/podcasts.py:201`
- OPML import/export — `server/routes/podcasts.py:262`
- Podcast search — `server/routes/podcasts.py:252`
- Category listing + filtering — `GET /api/podcasts/categories`, `?category=` param

### YouTube Integration (NEW)
- `POST /api/podcasts/from-youtube` — subscribe to YouTube channels/playlists as podcasts
- Uses yt-dlp to extract video metadata, creates podcast with `/api/yt-proxy/` enclosure URLs
- Sets `category='youtube'` for YouTube-sourced podcasts

### Admin Management (NEW)
- `GET /api/admin/podcasts` — list all podcasts across users
- `DELETE /api/admin/podcasts/[id]` — force delete any podcast
- `POST /api/admin/podcasts/sync-all` — force sync all feeds
- `GET /api/admin/podcasts/stats` — podcast stats
- `POST /api/admin/podcasts/seed` — seed 20 curated podcasts across genres
- Admin UI page at `/admin/podcasts` with full table, actions, search

### User-Facing UI
- `PodcastsPage` with subscription grid, episode list, download buttons, progress bars
- Unplayed filter toggle, played/unplayed styling, progress resume
- Guide section: RSS workflow, YouTube workflow, OPML import/export
- YouTube subscription form with URL preview
- Episode progress tracking (auto-saves every 15s while playing)

### Seed Podcasts (20 curated feeds)
- Music: Song Exploder, All Songs Considered, KEXP
- Technology: Hacker News, CodeNewbie, Syntax.fm, Software Engineering Daily
- Science: NASA Curious Universe, Science Friday, Radiolab
- Arts: 99% Invisible, The Creative Brain
- Business: How I Built This, TED Talks Daily
- Comedy: Conan O'Brien Needs A Friend
- Education: Stuff You Should Know, Ologies
- True Crime: Criminal, Serial
- Podcasting: Podcasting Today

---

## Phase 4.2 — ReplayGain / Loudness Normalization ✅ Complete

### Analysis Engine
- FFmpeg `loudnorm` (EBU R128) analysis — `server/workers/metadata.py`
- `analyze_gain(filepath)` — runs FFmpeg, parses JSON, returns track_gain/track_peak
- `analyze_track_gain(filename)` — single file analysis + album gain computation
- `analyze_all_gains()` — batch analysis with `ThreadPoolExecutor(max_workers=2)`
- Background thread execution with progress tracking

### Storage
- `track_gain` table with columns: track_gain, track_peak, album_gain, album_peak, album_name, analyzed_at — `server/models/db.py:92`
- DB helpers: `get_track_gain()`, `set_track_gain()`, `get_album_gains()`, `get_all_gain_tracks()`

### API Endpoints
- `POST /api/analyze-gains` — trigger background batch analysis
- `GET /api/gains/status` — analysis progress
- `GET /api/gains/<filename>` — gain data for playback (public)
- `POST /api/analyze-gain/<filename>` — single file analysis
- `GET /api/gains` — list all analyzed tracks

### Client-Side Gain Application
- `audioEngine.ts` — `_loudnessMultiplier` field, `_applyLoudnessNormalization()` fetches gain data, converts dB→linear, applies to gain node
- `fadeTo()` multiplies target volume by loudness multiplier
- Crossfade remains functional (multiplier is a base level, not dynamic)

### Player Controls
- `playerStore.ts` — `loudnessEnabled` (persisted), `loudnessMode` ('track'|'album'), `currentLoudnessGain`
- `NowPlayingOverlay.tsx` — toggle button, mode selector dropdown, gain indicator (e.g. "-3.2 dB")

---

## Phase 4.3 — Subsonic API Completion ✅ Complete
*`server/routes/subsonic.py` — expanded from 188 to 799 lines.*

### All 22+ Endpoints Implemented
| Endpoint | Status |
|----------|--------|
| `ping` | ✅ |
| `getMusicFolders` | ✅ |
| `getArtists` | ✅ (now counts tracks per artist) |
| `getAlbumList` | ✅ (counts tracks per album) |
| `stream` | ✅ |
| `getCoverArt` | ✅ |
| `scrobble` | ✅ |
| `getPlaylists` | ✅ NEW |
| `getPlaylist` | ✅ NEW |
| `createPlaylist` | ✅ NEW |
| `deletePlaylist` | ✅ NEW |
| `updatePlaylist` | ✅ NEW |
| `search2` | ✅ NEW (cross-entity) |
| `search3` | ✅ NEW (ID3 variant) |
| `getSong` | ✅ NEW |
| `getArtist` | ✅ NEW |
| `getAlbum` | ✅ NEW |
| `getIndexes` | ✅ NEW |
| `getMusicDirectory` | ✅ NEW |
| `getLicense` | ✅ NEW (always valid) |
| `getRandomSongs` | ✅ NEW |
| `getNowPlaying` | ✅ NEW |
| `download` | ✅ NEW |
| `getAvatar` | ✅ NEW |

### JSON Format Support
- All endpoints support `?f=json` parameter
- Automatic XML↔JSON conversion via `_response()` / `_elem_to_json()` helpers

### OpenSubsonic
- `X-OpenSubsonic: true` header on all responses
- `openSubsonic="true"` attribute in XML root
- `"openSubsonic": true` in JSON responses

### Auth Fix
- Token auth (`t`+`s`) now correctly computes `md5(password_hash + salt)`

---

## Phase 4.4 — User Management ✅ Complete

### Database
- Users table: `email`, `email_verified`, `display_name`, `avatar_path`, `is_active` columns added (via ALTER TABLE migration)
- Sessions table with expiry

### Profile Endpoints
- `GET /api/profile` — full profile with sessions list
- `PUT /api/profile` — update display_name, email
- `POST /api/profile/avatar` — upload avatar (PIL resize 128×128)
- `DELETE /api/profile/avatar` — remove avatar
- `GET /api/profile/avatar/file` — serve avatar image
- `GET /api/profile/sessions` — list active sessions
- `DELETE /api/profile/sessions/[id]` — revoke session
- `DELETE /api/profile/account` — self-service deletion

### Admin User Management
- `PUT /api/users/[id]` — edit role, active status, email, display_name
- `DELETE /api/users/[id]` — delete user (blocks admin self-deletion)
- Active/inactive status with `is_active` flag
- Session token validation checks `is_active = 1`

### UI
- `SettingsPage.tsx` — user profile page at `/settings`
  - Avatar upload with preview
  - Display name + email editing
  - Password change form
  - Active sessions list with revoke
  - Account deletion with 2-step confirmation
- `AdminUsers.tsx` — enhanced with edit dialog, active toggle, delete
- `Sidebar.tsx` — user settings icon + admin settings icon at bottom
- `/settings` route added to AppShell

---

## Phase 4.5 — Music Video Mode ✅ Complete

### Server
- `GET /api/yt-video/<track_name>` — resolves track name to YouTube video ID
- 1-hour LRU cache, circuit breaker protection

### Client Services
- `client/src/services/videoService.ts` — YouTube embed iframe management, postMessage API (play/pause/seek), 5-second sync polling, fullscreen, Picture-in-Picture
- `client/src/hooks/useVideoMode.ts` — integration hook: resolves video IDs on track change, syncs play/pause on audio events, detects seek jumps, cleanup on mode toggle

### Player Store
- `videoMode` (persisted toggle), `currentVideoId`, `videoThumbnail`, `videoTitle`, `miniPlayer`

### UI Components
- `VideoOverlay.tsx` — floating/draggable video player overlay
  - Full-width mode (above album art in Now Playing)
  - Mini-player mode (320px, bottom-right corner, draggable)
  - Controls: close, fullscreen, PiP, minimize/expand
  - Keyboard shortcuts: `f`=fullscreen, `m`=minimize, `Escape`=close
  - Thumbnail placeholder while loading
- Toggle buttons in `NowPlayingOverlay.tsx`, `BottomPlayerBar.tsx`, `PlayerPanel.tsx`

---

## Phase 4.6 — Mobile PWA Enhancements ✅ Complete

### iOS WebAudio Unlock
- `audioEngine.ts` — `_setupIOSUnlock()` registers touchstart/touchend listeners that resume AudioContext on first gesture, then self-remove

### Smart Install Prompt
- `InstallPrompt.tsx` — heuristics: shows after 3 plays or 2nd return visit
- Tracks play count + visit count in localStorage
- iOS detection with "Add to Home Screen" instructions
- Dismiss button with permanent suppression
- Standalone mode detection (skips prompt)

### Background Sync
- `sw.js` — IndexedDB `play-queue` store for offline play event caching
- `sync` event listener handles `sync-plays` and `sync-queue` tags
- Posts cached events to `/api/play/log` when online

### Share Target API
- `manifest.json` — `share_target` for receiving audio files via Web Share
- VitePWA config synced with manifest additions

### Haptic Feedback
- `client/src/utils/haptic.ts` — `hapticLight()` (10ms), `hapticMedium()` (20ms), `hapticHeavy()` ([30,50,30])
- Feature-detects `navigator.vibrate`

### Audio Focus
- `audioEngine.ts` — visibility change handler pauses audio when page hidden (unless MediaSession active)

### Standalone Mode UX
- `index.css` — `env(safe-area-inset-*)` padding for `html, body, #root`
- `apple-mobile-web-app-status-bar-style: black-translucent` meta tag
- Multi-size maskable icons in manifest

### Dependency Fix
- `vite-plugin-pwa: ^0.21.1` added to `package.json` devDependencies

---

## Redesign (UI Overhaul) ✅ Complete

### Phase D1 — Layout Restructure
- **Expandable sidebar**: `w-[72px]` → `hover:w-[200px]` with labels appearing on hover (`Sidebar.tsx`)
- Labels use `overflow-hidden whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100`

### Phase D2 — Component Polish
- **Redesigned album cards** (`LibraryPage.tsx`): `rounded-2xl`, `shadow-lg hover:shadow-xl`, `hover:scale-[1.02]`, gradient overlay with title+artist on hover
- **Full-bleed Now Playing** (`NowPlayingOverlay.tsx`): removed `max-w-md`, art `rounded-2xl`, generous spacing
- **Glassmorphism**: `.glass`, `.glass-card`, `.glass-subtle` CSS classes with backdrop-blur + border
- **Scanline replaced**: `ScanlineOverlay.tsx` — now uses SVG `feTurbulence` noise texture at 0.04 opacity instead of harsh lines

### Phase D3 — Color System
- Pink/cyan accents preserved, used sparingly
- Elevation via borders (consistent `border-border-default/30`)
- Theme toggle works (light/dark)

### Phase D4 — Typography & Spacing
- Font size tokens already consistent (xs/sm/base, font-body/font-display)
- `rounded-lg`/`rounded-2xl` consistently applied across components
- 4px/8px spacing scale through Tailwind

---

## Fixed bugs (2026-07-10)
1. **Subsonic routes** — double `/subsonic/` prefix in route decorators stripped (7 routes fixed)
2. **Rate limiter KeyError** — `_rate_cleanup` could pop the dict entry; re-fetch after cleanup
3. **Prometheus `neotokyo_` metrics** — switched to always-render manual text mode, appended prometheus standard lines at the end

---

*Server: admin / neotokyo, port 5050*
*Last updated: 2026-07-10*
