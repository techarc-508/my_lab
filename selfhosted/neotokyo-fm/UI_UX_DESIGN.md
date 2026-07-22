# NEOTOKYO FM — UI/UX Design & User Flow

**Version**: 4.0  
**Design System**: Tailwind CSS + CSS Custom Properties  
**Theme**: Retrowave / Synthwave aesthetic with glassmorphism

---

## 1. Design Language

### Color Palette

| Token | Dark Mode | Light Mode | Usage |
|-------|-----------|------------|-------|
| `hot-pink` | `#FF006E` | `#FF006E` | Primary accent, brand, CTAs |
| `purple` | `#8338EC` | `#8338EC` | Secondary accent, gradients |
| `electric-blue` | `#3A86FF` | `#3A86FF` | Info, links, storage |
| `brand` | `#8B5CF6` | `#8B5CF6` | Sliders, active states, EQ |
| `surface-base` | `#0F0E1A` | `#F7F7FB` | Page background |
| `surface-raised` | `#1D1E31` | `#FFFFFF` | Cards, panels |
| `surface-sunken` | `#141322` | `#EEEFF5` | Inputs, progress tracks |
| `success` | `#00F5A0` | `#00B876` | Online status, completions |
| `warning` | `#FFD700` | `#D4A800` | Active downloads |
| `error` | `#FF3366` | `#DC2626` | Destructive actions, offline |

### Typography

- **Font**: Inter (system-ui fallback)
- **Mono**: JetBrains Mono / Fira Mono
- **Sizes**: 11px (xs) → 13px (sm) → 15px (base) → 18px (lg) → 24px (xl) → 28px → 34px → 52px (hero)
- **Tracking**: Wide tracking on headings (`tracking-[2px]` to `tracking-[3px]`)

### Visual Effects

- **Glassmorphism**: `backdrop-filter: blur(24px)` + semi-transparent backgrounds + subtle borders
- **Scanlines**: Optional CRT overlay (toggle in player)
- **Glow**: `box-shadow` with brand colors (`glow-pink-sm`, `glow-purple-sm`, `glow-combo`)
- **Card hover**: `translateY(-2px)` + shadow elevation
- **Animations**: `fade-in`, `slide-up`, `pulse-glow`, `heart-bounce`, `slider-glow`
- **Reduced motion**: All animations disabled via `prefers-reduced-motion: reduce`

### Spacing & Radius

- **Spacing scale**: 4px → 8px → 12px → 16px → 20px → 24px → 32px → 40px → 48px
- **Border radius**: 8px (sm) → 12px (md) → 16px (lg) → 24px (xl) → 32px → full

---

## 2. App Shell & Navigation

### Layout Structure

```
┌──────────┬──────────────────────────────┐
│          │                              │
│ Sidebar  │       Main Content           │
│ (72px→   │       (scrollable)           │
│  200px)  │                              │
│          ├──────────────────────────────┤
│          │   BottomPlayerBar (72px)     │
└──────────┴──────────────────────────────┘
```

### Sidebar (`Sidebar.tsx`)

- **Collapsed**: 72px — icons only
- **Expanded**: 200px — icons + labels (on hover, CSS `group/sidebar`)
- **Top**: Brand logo (Disc3 icon in circle with pink ring)
- **Nav items** (top to bottom): Home, Radio, Library, YouTube, Playlists, Podcasts
- **Bottom**: Settings, Admin (pink hover)
- **Indicators**: Active route = brand color + `bg-white/10`; now-playing = 2px brand bar; queue count badge

### Header (not used in main layout — only in admin)

- 48px height, border-bottom
- Brand name + mini EQ canvas (5-bar visualizer)
- Theme toggle (Sun/Moon icon)

### BottomPlayerBar (`BottomPlayerBar.tsx`)

Fixed bottom, 72px height, z-50:

```
┌─────────────────────────────────────────────────┐
│ ████░░░░░░░░░░░░░░░░░░░░░░░░  (1px progress)   │
├─────────────────────────────────────────────────┤
│ [Art] Title/Artist    ⏮ ▶ ⏭   ♡ 📝 ≡ 🎛  🔊──  │
└─────────────────────────────────────────────────┘
```

- **Progress bar**: 1px at top, brand color, drag-to-seek, white dot on hover
- **Album art**: 40px rounded, click → opens NowPlayingOverlay
- **Track info**: Title (15px) + artist (13px), truncated
- **Controls**: Previous (desktop), Play/Pause (white circle), Next (desktop)
- **Actions** (desktop only): Like (heart), Lyrics toggle, EQ toggle, Queue toggle
- **Volume** (desktop only): Icon + 120px slider
- **Background**: Dynamic gradient from album art dominant color

### NowPlayingOverlay (`NowPlayingOverlay.tsx`)

Full-screen overlay (z-60), opened by clicking album art or track info:

```
┌─────────────────────────────────┐
│ ▼ Now Playing          [Sleep] ✕│
│                                 │
│      ┌───────────────────┐      │
│      │                   │      │
│      │    Album Art      │      │
│      │    (380px max)    │      │
│      │                   │      │
│      └───────────────────┘      │
│                                 │
│       Track Title               │
│       Artist Name               │
│                                 │
│         [ ♡ Like ]              │
│                                 │
│  ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁  (48 bars)   │
│  0:00              3:45         │
│                                 │
│    ⏮    ▶    ⏭                │
│   Shuffle  Play  Repeat         │
│                                 │
│  [📝 Lyrics] [≡ EQ] [🎛 Queue] │
│                                 │
│  Crossfade ────○──── 3s         │
│  [🔊 Loud] [Track ▾]           │
│  🔊 ────○────                   │
└─────────────────────────────────┘
```

- **Touch gestures**: Swipe down = close, swipe left/right = next/prev, long press = queue
- **Queue view**: Toggle replaces album art with draggable track list
- **Progress**: 48-bar waveform visualization (filled = played, glowing brand color)
- **Loudness normalization**: Toggle + track/album mode selector + dB gain display
- **Background**: Dynamic gradient from album art

### LyricsOverlay (`LyricsOverlay.tsx`)

- Slides up from bottom, z-[55]
- Synced lyrics with auto-scroll
- Close via X button or lyrics toggle

### EQPanel (`EQPanel.tsx`)

- Slide-out panel from right
- 10-band equalizer with slider controls
- Preset selector: Flat, Bass Boost, Treble Boost, Vocal, Electronic, Rock, Jazz, Classical, Podcast, Night Mode, Custom

### Visualizer (`Visualizer.tsx`)

- Canvas-based, 6 modes: Bars, Wave, Circular, Particles, Galaxy, Terrain
- Uses `AnalyserNode` from Web Audio API
- Rendered via `useVisualizer` + `useCanvasVisualizer` hooks

### Global Overlays

- **ScanlineOverlay**: Optional CRT scanline effect
- **StreamToast**: Non-intrusive toast notifications (bottom-right)
- **ShortcutCheatsheet**: `?` key shows keyboard shortcuts
- **InstallPrompt**: PWA install banner
- **PageTransition**: Fade-in animation on route change

---

## 3. User Pages — Flow & Functions

### HomePage (`/`)

**Purpose**: Dashboard / landing page

**Sections**:
1. **Hero Banner** — Auto-rotating (5s) 3-slide carousel:
   - "Retrowave Radio" → /radio
   - "YouTube Downloader" → /youtube
   - "Your Library" → /library
   - Dot indicators (right side, vertical)
2. **Recent Songs** — Last 8 played tracks (numbered, with album art, play button, like, more)
3. **Trending Stations** — First 8 radio stations (numbered, with genre, play button)
4. **Browse by Genre** — Pill links: Synthwave, Electronic, Pop, Chill, Jazz, Bollywood, Japanese, Hip Hop, 80s, Bengali, Rock, World

**User Flow**:
- Click hero → navigates to section page
- Click track → plays immediately, sets queue to recent songs
- Click station → plays via radio proxy
- "See all" / "Browse all" → navigates to Library / Radio

---

### RadioPage (`/radio`)

**Purpose**: Internet radio station browser

**Components**:
1. **Header**: "Radio" title + "Add Station" button
2. **Active Station Card**: Shown when a station is playing — live/offline status, now-playing info, genre
3. **Custom Station Form**: Name + URL + Genre inputs, "Add Station" submit
4. **Search + Genre Filter**: Text search + genre pill buttons (All, Jazz, Electronic, Rock, Pop, Classical, etc.)
5. **Stations Grid**: 2-4 columns, each card shows:
   - Online/offline indicator (green/red dot)
   - Genre badge (color-coded)
   - Station name
   - Now-playing text (if available)
   - Favorite star (hover reveal)

**User Flow**:
- Browse stations → click card → plays via `/api/radio-proxy`
- Search/filter → instant local filtering
- Toggle favorite → persisted to localStorage
- Add custom station → form submit → saved to server JSON
- Now-playing updates every 15s via polling
- Offline stations shown with red styling, 60% opacity

---

### LibraryPage (`/library`)

**Purpose**: Browse and play uploaded/downloaded audio files

**Components**:
1. **Header**: File count + controls row:
   - Folder tree toggle
   - Bulk upload button
   - Search input
   - Selection actions (Play, Queue, Clear)
   - View mode toggle (Grid / List)
   - Group by Albums toggle
   - Sort options (Name ↑↓, Artist ↑, Newest, Size ↓)
2. **Folder Sidebar** (optional): Tree view of directory structure
3. **Grid View**: Album-art cards (3-7 columns), hover overlay with title/artist, selection ring
4. **List View**: Compact rows with art thumbnail, title, artist, album, download badge
5. **Album Grouping**: Tracks grouped by album with album header

**User Flow**:
- Scroll → infinite scroll (IntersectionObserver, 50 files per batch)
- Click → selects (ring indicator)
- Double-click → plays track, sets queue to all sorted files
- Search → instant local filter + server search for 2+ char queries
- Bulk select → Play/Queue/Clear actions
- Download icon → caches track for offline playback
- Sort/view/group preferences → persisted to localStorage

---

### YouTubePage (`/youtube`)

**Purpose**: Search YouTube and download audio

**Components**:
1. **Header**: "YouTube" + "Import Playlist" button
2. **Playlist Import Form**: URL input + Import button
3. **Search Bar**: Text input + search button
4. **Results List**: Rows with thumbnail, title, uploader, duration, download button (hover reveal)
5. **Load More**: Pagination button

**User Flow**:
- Search → results appear with thumbnails
- Click result → plays via `/api/yt-proxy/{videoId}` (streaming, no download)
- Click download → starts background download → polls status → toast on complete/fail
- Import playlist → expands playlist → batch download all tracks
- Download progress → shown in admin downloads panel

---

### PlaylistsPage (`/playlists`)

**Purpose**: Create and manage playlists

**Components**:
1. **Header**: "Playlists" + create input
2. **Playlist Cards**: Each shows:
   - Cover art (first track's cover)
   - Name + track count
   - Delete button
   - Track list with drag-to-reorder, play, queue (+Q), remove

**User Flow**:
- Create playlist → type name + Enter/click +
- Play playlist → sets queue to all tracks, plays first
- Drag to reorder → persisted to server
- Add to queue → individual track added to player queue
- Remove track → persisted to server

---

### PodcastsPage (`/podcasts`)

**Purpose**: Subscribe and listen to podcasts

**Components**:
1. **Header**: "Podcasts" + help guide + Sync All + OPML Export/Import + Subscribe + From YouTube
2. **Subscribe Form**: RSS feed URL input
3. **YouTube Form**: YouTube URL input + Preview → Subscribe
4. **Help Guide**: How-to for RSS, YouTube, OPML
5. **Podcast Grid**: Cover art cards with:
   - Unplayed count badge
   - Sync, auto-download, unsubscribe (hover reveal)
6. **Episode View** (when podcast selected):
   - Podcast header with cover, title, author, description
   - Refresh + OPML buttons
   - Unplayed filter toggle
   - Episode list: title, date, duration, played status, progress bar, download, resume

**User Flow**:
- Subscribe via RSS → auto-syncs → episodes appear
- Subscribe via YouTube → preview → confirm → episodes appear
- Import OPML → bulk subscribe
- Click podcast → opens episode view
- Click episode → plays (streaming or downloaded)
- Resume → starts from last saved position
- Progress tracking → saved every 15s during playback
- Download episode → background download → available offline

---

### SettingsPage (`/settings`)

**Purpose**: User profile and account management

**Sections**:
1. **Profile**: Avatar (128px circle) + change photo button + username + role
2. **Edit Profile**: Display name + email inputs → Save
3. **Change Password**: Current + new password (min 12 chars) → Change
4. **Active Sessions**: List with IP, created, expires, revoke button
5. **Danger Zone**: Delete account (two-step confirmation)

**User Flow**:
- Upload avatar → crop dialog → upload → preview updates
- Update profile → toast success
- Change password → validation → toast success
- Revoke session → removed from list
- Delete account → confirm dialog → redirect to home

---

## 4. Admin Pages — Flow & Functions

### Admin Layout (`AdminLayout.tsx`)

Separate layout from player:
- **Left sidebar** (224px): Gradient brand header + 13 nav items + logout + back to player
- **Top bar**: Now-playing indicator (hover for detail popup)
- **Main area**: Scrollable content

**Nav Items**:
| # | Route | Icon | Label |
|---|-------|------|-------|
| 1 | `/admin` | BarChart3 | Dashboard |
| 2 | `/admin/import` | Download | Import |
| 3 | `/admin/radio` | Radio | Radio |
| 4 | `/admin/podcasts` | Rss | Podcasts |
| 5 | `/admin/songs` | Music | Songs |
| 6 | `/admin/lyrics` | MicVocal | Lyrics |
| 7 | `/admin/browse` | FolderOpen | Browse |
| 8 | `/admin/scanner` | Image | Album Art |
| 9 | `/admin/webhooks` | Globe | Webhooks |
| 10 | `/admin/backups` | Shield | Backups |
| 11 | `/admin/settings` | Settings | Settings |
| 12 | `/admin/logs` | FileText | Logs |
| 13 | `/admin/users` | Users | Users |

### AdminDashboard (`/admin`)

**Purpose**: System overview with real-time stats

**Auto-refresh**: Every 10s (only when tab visible)

**Sections**:
1. **Stat Tiles** (6 columns):
   - Files (count), Size (formatted), Batches, Active Downloads, Uptime, FFmpeg status
   - Animated count-up on load

2. **Charts Row** (3 columns):
   - **Genre Donut**: Donut chart + genre breakdown list (color-coded)
   - **Lyrics Coverage**: Donut chart + with/missing/total counts
   - **Storage Breakdown**: Mini bar chart + format distribution (mp3, flac, m4a, etc.)

3. **Disk + Sparkline Row** (2 columns):
   - **Disk Usage**: Gradient progress bar (used/free/total)
   - **Plays (24h)**: Sparkline chart of hourly play counts

4. **Backup Countdown**: Time until next auto-backup

5. **Active Downloads**: List with filename, speed, progress %

6. **User Stats** (tabbed):
   - **Top Songs**: Ranked list with play counts
   - **Top Artists**: Ranked list with play counts
   - **Recent**: Recent plays with timestamps
   - **Visits**: IP, username, path, timestamp

7. **Server Health**: Status, Python version, FFmpeg, LRCLib, download dir

8. **Recent Batches**: Last 10 batch operations with status

---

### AdminImport (`/admin/import`)

**Purpose**: Import music from YouTube

**Functions**:
- Single URL download
- Playlist/batch import
- Download queue with progress
- File upload (drag & drop or file picker)
- Batch record history

---

### AdminRadio (`/admin/radio`)

**Purpose**: Manage radio stations

**Functions**:
- List all stations with name, URL, genre
- Add new station (name, URL, genre)
- Edit existing stations
- Delete stations
- Test connectivity
- Bulk import/export

---

### AdminPodcasts (`/admin/podcasts`)

**Purpose**: Manage podcast subscriptions

**Functions**:
- List subscribed podcasts
- Add/remove subscriptions
- Sync individual or all feeds
- View episodes with download status
- Auto-download toggle per podcast

---

### AdminSongs (`/admin/songs`)

**Purpose**: Manage audio library

**Functions**:
- List all files with metadata
- Edit metadata (title, artist, album, genre)
- Delete files
- Bulk metadata operations
- Search/filter

---

### AdminLyrics (`/admin/lyrics`)

**Purpose**: Manage lyrics

**Functions**:
- Lyrics status per file
- Bulk fetch from LRCLIB
- Manual lyrics edit
- Lyrics coverage stats

---

### AdminBrowse (`/admin/browse`)

**Purpose**: File system browser

**Functions**:
- Navigate directory tree
- View file details
- Move/rename files
- Storage usage per directory

---

### AdminScanner (`/admin/scanner`)

**Purpose**: Album art management

**Functions**:
- Scan library for missing cover art
- Extract cover art from audio files
- Batch extraction
- Preview extracted art
- Rename files based on metadata

---

### AdminWebhooks (`/admin/webhooks`)

**Purpose**: Manage webhook integrations

**Functions**:
- List configured webhooks
- Add/edit/delete webhooks
- Test webhook delivery
- Event type selection
- Enable/disable per webhook

---

### AdminBackups (`/admin/backups`)

**Purpose**: Backup management

**Functions**:
- Manual backup trigger
- List existing backups (auto + manual)
- Restore from backup
- Download backup files
- Backup schedule info

---

### AdminSettings (`/admin/settings`)

**Purpose**: Server configuration

**Functions**:
- Server version info
- Configuration display
- Download directory settings
- LRCLIB settings
- Gunicorn worker config
- Environment variables (sanitized)

---

### AdminLogs (`/admin/logs`)

**Purpose**: View server logs

**Functions**:
- Live log tail
- Log level filter
- Search within logs
- Download log files

---

### AdminUsers (`/admin/users`)

**Purpose**: User management

**Functions**:
- List all users with roles
- Create new user
- Edit user profile
- Change user role (admin/user)
- Activate/deactivate users
- View user sessions
- Force logout

---

### AdminAnalytics (`/admin/analytics`)

**Purpose**: Detailed usage analytics

**Functions**:
- Play count over time
- Top tracks/artists/albums
- User activity patterns
- Storage growth
- Genre distribution

---

## 5. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` / `→` | Seek backward / forward 10s |
| `Shift+←` / `Shift+→` | Previous / Next track |
| `↑` / `↓` | Volume up / down 5% |
| `M` | Toggle mute |
| `S` | Toggle shuffle |
| `R` | Cycle repeat (off → all → one) |
| `L` | Toggle lyrics overlay |
| `E` | Toggle equalizer |
| `Q` | Toggle queue |
| `N` | Toggle now-playing overlay |
| `F` | Toggle fullscreen visualizer |
| `?` | Show shortcut cheatsheet |
| `Esc` | Close any overlay |

---

## 6. Mobile / Touch

- **Safe area insets**: Respected for notch devices
- **Touch gestures**:
  - Swipe left/right on now-playing → next/prev track
  - Swipe down → close overlay
  - Long press → toggle queue
- **Responsive breakpoints**: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- **Bottom player**: Always visible, compact on mobile
- **Sidebar**: Collapsed to icons only on mobile
- **Grid columns**: Adapt from 2 (mobile) to 7 (desktop)

---

## 7. Accessibility

- **Focus visible**: 2px pink outline with 2px offset
- **ARIA labels**: All interactive elements labeled
- **Keyboard navigation**: Full keyboard support via `useKeyboardShortcuts`
- **Reduced motion**: All animations disabled when `prefers-reduced-motion: reduce`
- **Color contrast**: WCAG AA compliant text on surfaces
- **Screen reader**: Semantic HTML, proper heading hierarchy

---

## 8. State Persistence

| Key | Storage | Purpose |
|-----|---------|---------|
| `neotokyo-player` | localStorage | Player state (current track, volume, queue, etc.) |
| `neotokyo-auth-token` | localStorage | Auth token |
| `neotokyo-library-sort` | localStorage | Library sort preference |
| `neotokyo-library-view` | localStorage | Grid/list view mode |
| `neotokyo-library-group` | localStorage | Album grouping |
| `neotokyo-radio-favorites` | localStorage | Favorited station IDs |
| `neotokyo-radio-nowplaying` | localStorage | Cached now-playing (30s TTL) |
| `neotokyo-theme` | localStorage | Dark/light mode |

---

## 9. Real-Time Features

- **Socket.io**: WebSocket connection for:
  - Download progress updates
  - New file notifications
  - Admin system events
- **Polling**: 
  - Radio now-playing: 15s intervals
  - Admin dashboard: 10s intervals
  - Download status: 2s intervals (per download)
- **Event Bus**: Internal pub/sub for component communication (audio engine → UI updates)
