# Webplayer — Design Specification

> **Reference:** Derived from screen recording analysis (14s, 2000×1500, 6 key frames extracted).  
> **Stack hint:** React + TypeScript + Tailwind CSS v4 (or CSS custom properties). Framer Motion for animations. No framework-specific routing implied — adapt to your router of choice.

---

## 1. App Overview

A full-featured music streaming web player presented in a **tablet-first**, landscape layout. The UI has three primary zones that can be seen simultaneously:

| Zone | Theme | Visibility |
|------|-------|-----------|
| **Left Sidebar** — icon nav + brand | Dark navy | Always |
| **Player Panel** — now playing, queue | Dark navy/charcoal | Persistent left panel |
| **Content Panel** — Home, Browse, Library | White / light | Main right area, overlaps player |

A fourth **Full-Screen Immersive Mode** takes over the whole viewport when the user focuses on the currently playing track.

---

## 2. Design Tokens

### 2.1 Color Palette

```css
:root {
  /* App shell */
  --color-bg-shell:        #9B8EC4;  /* outer lavender background (device frame) */
  --color-bg-sidebar:      #1B1A30;  /* leftmost nav column */
  --color-bg-player:       #211F38;  /* player panel background */
  --color-bg-player-card:  #2A2847;  /* inner card surfaces in player */
  --color-bg-queue-card:   #2E2C4A;  /* next-composition track cards */

  /* Content panel (light) */
  --color-bg-content:      #FFFFFF;
  --color-bg-content-alt:  #F7F7FB;  /* subtle row hover */

  /* Brand / Accent */
  --color-brand:           #8B5CF6;  /* primary purple */
  --color-brand-logo-ring: #C026D3;  /* magenta ring on vinyl logo */
  --color-accent-link:     #7C3AED;  /* "See all" links, interactive purple */
  --color-accent-like:     #EF4444;  /* heart filled / liked state */

  /* Text — dark surfaces */
  --color-text-primary-dark:   #FFFFFF;
  --color-text-secondary-dark: #A09DC0;  /* artist names, sub-labels */
  --color-text-muted-dark:     #6B6887;  /* timestamps, play counts */

  /* Text — light surfaces */
  --color-text-primary-light:   #111028;
  --color-text-secondary-light: #6B6887;
  --color-text-muted-light:     #B0AEBF;

  /* Track list rank numbers */
  --color-rank:            #C4C0D8;

  /* Playback bar (fullscreen) */
  --color-bar-bg:          rgba(24, 23, 40, 0.88);  /* frosted dark bar */
  --color-bar-border:      rgba(255,255,255,0.08);

  /* Progress / waveform */
  --color-waveform-filled: #FFFFFF;
  --color-waveform-empty:  rgba(255,255,255,0.22);
  --color-progress-thumb:  #FFFFFF;
}
```

### 2.2 Typography

```css
/* Display + Headings */
--font-display: 'Inter', system-ui, sans-serif;  /* bold, tight tracking */

/* Body / UI */
--font-body: 'Inter', system-ui, sans-serif;

/* Data / timestamps / play counts */
--font-mono: 'JetBrains Mono', 'Fira Mono', monospace;

/* Scale */
--text-xs:   11px;   /* play counts, timestamps */
--text-sm:   13px;   /* artist names, sub-labels */
--text-base: 15px;   /* track titles, body */
--text-lg:   18px;   /* section headers in player */
--text-xl:   24px;   /* "Next composition" label */
--text-2xl:  28px;   /* "Home" page title */
--text-3xl:  34px;   /* track title in player (large) */
--text-hero: 52px;   /* hero banner headline */
```

### 2.3 Spacing

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
```

### 2.4 Border Radius

```css
--radius-sm:   8px;    /* small chips, badges */
--radius-md:   12px;   /* track list items, buttons */
--radius-lg:   16px;   /* queue cards, panel sections */
--radius-xl:   24px;   /* player panel inner card */
--radius-2xl:  32px;   /* app outer shell */
--radius-full: 9999px; /* circle controls, logo */
```

### 2.5 Shadows

```css
--shadow-card:   0 4px 24px rgba(0,0,0,0.32);
--shadow-panel:  0 8px 48px rgba(0,0,0,0.48);
--shadow-shell:  0 24px 64px rgba(0,0,0,0.60);
--shadow-btn:    0 2px 8px rgba(0,0,0,0.24);
```

---

## 3. Layout Structure

```
┌──────────────────────────────────────────────────────────────────┐
│  App Shell  (bg: --color-bg-shell, border-radius: --radius-2xl) │
│                                                                  │
│  ┌──┐  ┌──────────────────────┐  ┌────────────────────────────┐ │
│  │  │  │   Player Panel        │  │  Content Panel (white)     │ │
│  │S │  │                      │  │                            │ │
│  │I │  │  [Queue Cards row]   │  │  Home / Browse / Library   │ │
│  │D │  │                      │  │                            │ │
│  │E │  │  [Album Art large]   │  │  [Hero Banner]             │ │
│  │B │  │                      │  │  [Trending List]           │ │
│  │A │  │  [Track title]       │  │  [Top Artists]             │ │
│  │R │  │  [Controls]          │  │  [Recent Favourites Grid]  │ │
│  │  │  │  [Waveform bar]      │  │                            │ │
│  └──┘  └──────────────────────┘  └────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘

Fullscreen Mode (overlays everything except sidebar):
┌──┐  ┌───────────────────────────────────────────────────────────┐
│  │  │  [Animated music video / album art zoomed fullscreen]     │
│S │  │                                                           │
│I │  │                                                           │
│D │  │                                                           │
│E │  │  ┌─────────────────────────────────────────────────────┐ │
│B │  │  │ Persistent Playback Bar (frosted glass, bottom)     │ │
│A │  │  └─────────────────────────────────────────────────────┘ │
│R │  └───────────────────────────────────────────────────────────┘
└──┘
```

### Column Widths

| Zone | Width |
|------|-------|
| Sidebar | `72px` (icon-only) |
| Player Panel | `320px` |
| Content Panel | `flex: 1` (fills remaining) |

---

## 4. Components

### 4.1 `<Sidebar>`

**Background:** `--color-bg-sidebar`  
**Width:** `72px`, full height  
**Layout:** `flex-col`, `align-items: center`, `padding: 16px 0`

#### Sub-elements

| Element | Details |
|---------|---------|
| **Brand Logo** | 44×44px circle button. Inner: vinyl disc SVG icon. Outer ring: 2px solid `--color-brand-logo-ring` (magenta). Background: dark. Positioned at top. |
| **Nav Icons** | 7 icons stacked with `gap: 4px`. Each: 44×44px icon button, `border-radius: --radius-md`. Icons: Home, MusicNote, FolderLibrary, Person, Heart, Sparkle/AI, FolderOpen. Active state: icon uses `--color-brand`. Inactive: `--color-text-secondary-dark`. Hover: subtle light overlay `rgba(255,255,255,0.08)`. |
| **Spacer** | `flex: 1` pushes settings icon to bottom. |
| **Settings Icon** | Same button spec as nav icons. Gear/settings icon. |

#### Nav Groups (with visual gap between them)

```
[Logo]
───
[Home]
[Music]
[Library]
[Profile]
───
[Favorites]
[Discover/AI]
[Playlist]
───
[Settings]
```

---

### 4.2 `<PlayerPanel>`

**Background:** `--color-bg-player`  
**Width:** `320px`, full height  
**Layout:** `flex-col`, `gap: 16px`, `padding: 20px 16px`

#### 4.2.1 Queue Header

```
"Next composition"          [+]
```

- Label: `--text-xl`, `font-weight: 600`, color `--color-text-primary-dark`
- `[+]` button: 32px circle, `background: rgba(255,255,255,0.12)`, icon color white

#### 4.2.2 Queue Cards (Horizontal Scroll Row)

Horizontal scroll container, `gap: 12px`, `overflow-x: auto`, hide scrollbar.

**Each QueueCard:**
- Size: `~150×120px`, `border-radius: --radius-lg`
- Background: image fill (album art) with dark gradient overlay at bottom
- Bottom overlay shows:
  - Track title (`--text-sm`, bold, white)
  - Artist — Album (`--text-xs`, `--color-text-secondary-dark`)
  - Small vinyl disc icon (left of text)
- Three-dots `⋯` menu button in top-right corner

#### 4.2.3 NowPlaying Card

Large card, fills remaining vertical space. `border-radius: --radius-xl`, `background: --color-bg-player-card`, `padding: 16px`.

**Album Art:**
- Fills full card width, aspect ratio 1:1
- `border-radius: --radius-lg`
- Slight rotation transform `rotate(-3deg)` when in fullscreen preview state

**Track Info:**
- Title: `--text-3xl`, `font-weight: 700`, `--color-text-primary-dark`, centered
- Artist: `--text-base`, `--color-text-secondary-dark`, centered

**Playback Controls Row:**

```
[↩️ repeat]  [⏮ prev]  [⏸ pause]  [⏭ next]  [🔀 shuffle]
```

- Pause/Play button: 52px circle, `background: #FFFFFF`, icon color `--color-bg-player`. Shadow: `--shadow-btn`.
- All other icons: 32×32px, `--color-text-secondary-dark`. Active shuffle/repeat: `--color-brand`.

**Waveform Progress Bar:**
- Full width
- Height: ~28px
- Visual: vertical bar segments, filled = white `--color-waveform-filled`, unfilled = `--color-waveform-empty`
- Clicking/dragging seeks to position
- Time labels: `--text-xs`, `--font-mono`
  - Left: elapsed time (e.g., `0:26`)
  - Right: total duration (e.g., `5:46`)

---

### 4.3 `<ContentPanel>` (Main Area)

**Background:** `--color-bg-content`  
**Border-radius:** `--radius-xl` (top-left and bottom-left only, or all four)  
**Layout:** `flex-col`, `overflow-y: auto`, full height  
**Padding:** `24px 28px`

This is the scrollable content area. It renders one view at a time based on sidebar nav state.

---

### 4.4 `<HomeView>`

#### 4.4.1 Top Bar

```
"Home"                    [🔔]  [🔍 Search...]
```

- "Home" title: `--text-2xl`, `font-weight: 700`, `--color-text-primary-light`
- Bell icon: 36px, relative position badge for unread dot
- Search bar: `border-radius: --radius-full`, `background: #F0EFF7`, `padding: 8px 16px`, `width: 220px`. Placeholder text `--color-text-muted-light`. Icon `--color-text-secondary-light`.

#### 4.4.2 Hero Banner

Full-width, `height: 220px`, `border-radius: --radius-lg`, overflow hidden. Functions as a carousel (dots or drag indicator on right edge visible).

- Background: photographic promotional image
- Text overlay (semi-transparent dark gradient on left/bottom):
  - Eyebrow label (e.g., "Taylor Swift Midnights"): `--text-xs`, uppercase, white, letter-spacing 1px
  - Headline: `--text-hero` (or clamped), bold, white, max 3 lines
  - Sub-copy: `--text-sm`, white/80%, max 2 lines
  - CTA button: `border-radius: --radius-md`, `background: rgba(255,255,255,0.18)`, `color: white`, `padding: 8px 18px`, `--text-sm`, `font-weight: 600`
- Right edge: vertical dots indicator (3 dots, active = white, inactive = white/40%)

#### 4.4.3 "Trending right now" Section

```
"Trending right now"                                  See all →
[01] [🖼] Song Title           03:29   8 078 651   [♡]  [⋯]
[02] [🖼] Song Title           03:04   2 341 221   [♡]  [⋯]
[03] [🖼] Song Title           03:24   2 212 882   [♡]  [⋯]
[04] [🖼] Song Title           03:32   1 934 291   [♡]  [⋯]
[05] [🖼] Song Title           03:42   1 556 239   [♡]  [⋯]
```

**Section header:**
- Label: `--text-xl`, `font-weight: 700`, `--color-text-primary-light`
- "See all" link: `--text-sm`, `--color-accent-link`, `font-weight: 500`, hover underline

**`<TrackListItem>` Component:**

| Column | Spec |
|--------|------|
| Rank number | `40px` wide, `--text-sm`, `--color-rank`, `font-weight: 500`, right-aligned |
| Album Art | `44×44px`, `border-radius: 8px`, object-fit cover |
| Track Info | `flex: 1`. Title: `--text-base`, `font-weight: 600`, `--color-text-primary-light`. Artist: `--text-sm`, `--color-text-secondary-light` |
| Duration | `--text-sm`, `--font-mono`, `--color-text-secondary-light`, `width: 48px` |
| Play Count | `--text-xs`, `--color-text-muted-light`, `width: 80px`, right-aligned |
| Heart button | 32px, outline heart → filled red on click. Toggle state. |
| More button | 32px, three horizontal dots `⋯`. Opens context menu. |

- Row height: `64px`
- Row hover: `background: --color-bg-content-alt`, `border-radius: --radius-md`
- Row padding: `0 8px`

#### 4.4.4 "Top Artist" Section (Right Column)

```
"Top Artist"                                    See all →
[🖼] Muse          #s 142 291 Followers  🎵 110M Plays   [⋯]
[🖼] Bring Me the…  #s 56 781 Followers  🎵 58M Plays    [⋯]
[🖼] Ed Sheeran     #s 49 456 Followers  🎵 908K Plays   [⋯]
```

**`<ArtistCard>` (list variant):**
- Artist photo: `44×44px`, `border-radius: --radius-full` (circular)
- Name: `--text-base`, `font-weight: 600`, `--color-text-primary-light`
- Stats line: `--text-xs`, `--color-text-muted-light`. Format: `#s {followers} Followers  🎵 {plays} Plays`
- Three-dots menu on right

#### 4.4.5 "Recent favourites" Section (Right Column, Grid)

```
"Recent favourites"
┌──────────┐  ┌──────────┐
│  [Art]   │  │  [Art]   │
│          │  │          │
│Family    │  │Bright    │
│tourism   │  │Hits      │
│The more… │  │The most… │
└──────────┘  └──────────┘
┌──────────┐  ┌──────────┐
│  [Art]   │  │  [Art]   │
│          │  │          │
│ ...      │  │ ...      │
└──────────┘  └──────────┘
```

**`<PlaylistCard>` (grid variant):**
- Size: `~140×160px` (responsive grid, 2-col in sidebar, more if full width)
- Art: full-width top section, abstract gradient or photo. `border-radius: --radius-lg --radius-lg 0 0`
- Bottom section: `padding: 10px`
  - Title: `--text-sm`, `font-weight: 600`, `--color-text-primary-light`
  - Description: `--text-xs`, `--color-text-muted-light`, max 2 lines truncated
- Card shadow: `--shadow-card`

---

### 4.5 `<FullscreenPlayer>`

Triggered when user clicks/focuses the album art in the PlayerPanel. Transitions into full-window immersive mode.

**Layout:**
- Takes full viewport minus sidebar width
- **Background**: The album art or animated music video plays fullscreen behind the UI
- Content is layered above using `position: absolute` / `z-index`
- The sidebar remains visible on the left

**Background content (animated):**
- The album art animates — it transitions from a small square to filling the entire background
- Background can show a music video or a looping animated visualization derived from the album art (Three.js / Canvas or CSS animation)
- Snowflake/particle effects float over a dark space backdrop (matching the Muse "Resistance" visualization with 3D hexagonal sphere)
- Use CSS `filter: brightness(0.7)` over background to ensure bar legibility

**Visible UI overlay:**
- Only the persistent `<PlaybackBar>` at the bottom is visible
- The large album art (rotated ~8deg) floats in the center

---

### 4.6 `<PlaybackBar>` (Fullscreen Bottom Bar)

**Position:** `fixed bottom-0`, full width of content area  
**Height:** `72px`  
**Background:** `--color-bar-bg` (`rgba(24,23,40,0.88)`) + `backdrop-filter: blur(24px)`  
**Border top:** `1px solid --color-bar-border`  
**Border radius:** `--radius-lg --radius-lg 0 0` (top corners only)

**Layout:** Three columns: `[controls] [track info + waveform] [secondary controls]`

```
[⏮] [⏸] [⏭]   [🖼 Resistance – Muse • The Resistance]  [♥] [↗] [+]   0:17 ────────────── 5:46  [🔀] [↩️] [🔊]
```

**Left Controls (100px):**
- Prev, Pause/Play, Next
- Prev/Next: 32px, white icon
- Pause/Play: 44px circle, white background, dark icon

**Center Track Info + Waveform (flex: 1):**
- Thumbnail: `44×44px`, `border-radius: 8px`
- Title: `--text-base`, `font-weight: 600`, white
- Artist • Album: `--text-sm`, `--color-text-secondary-dark`
- Heart icon: filled red if liked
- Share icon (↗): `--color-text-secondary-dark`
- Add icon (+): `--color-text-secondary-dark`
- Elapsed time: `--text-xs`, `--font-mono`, white
- Waveform: `flex: 1`, same visual as player panel waveform
- Total time: `--text-xs`, `--font-mono`, `--color-text-secondary-dark`

**Right Controls (120px):**
- Shuffle (`🔀`): `--color-text-secondary-dark`, active = `--color-brand`
- Repeat (`↩️`): same
- Volume (`🔊`): `--color-text-secondary-dark`

---

## 5. Views / Pages

### 5.1 Home (default)

Render `<HomeView>` in the content panel. Two-column layout at wider widths:
- Left/main column: Hero banner + Trending list
- Right column: Top Artists + Recent Favourites

### 5.2 Music / Browse

Track listing or artist browsing. Use `<TrackListItem>` in a full-width list.

### 5.3 Library / Files

User's saved content. Folder-style view. Use `<PlaylistCard>` in a grid.

### 5.4 Profile / Artist

Artist profile page. Hero image at top, stats row, discography list below.

### 5.5 Favorites

Filtered `<TrackListItem>` list of liked tracks.

### 5.6 Discover / AI

Personalized recommendation feed. Placeholder for AI features.

---

## 6. State & Interactions

### 6.1 Player State

```ts
interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;          // 0–1
  volume: number;            // 0–1
  isShuffled: boolean;
  repeatMode: 'none' | 'one' | 'all';
  isFullscreen: boolean;
  queue: Track[];
}
```

### 6.2 Key Interactions

| Trigger | Action |
|---------|--------|
| Click album art (player panel) | Enter fullscreen mode. Animate album art scaling to fill screen. Fade in `<PlaybackBar>`. |
| Click anywhere outside playback bar (fullscreen) | Exit fullscreen, reverse animation. |
| Click waveform position | Seek to that timestamp. Update `progress`. |
| Click `[♡]` on track | Toggle `liked` state. Icon fills red. |
| Click `[▶]` on queue card | Replace `currentTrack` with that track. |
| Click `[+]` (queue header) | Open track picker modal to add to queue. |
| Click `[⋯]` (any item) | Show context menu: Play Now / Add to Queue / Add to Playlist / Share / Go to Artist. |
| Hover track row | Show row highlight `--color-bg-content-alt`. |
| Click nav icon | Switch active view, update URL hash/route. Active icon gets `--color-brand`. |

### 6.3 Transitions & Animation

```
Album art → Fullscreen:
  transform: scale(1) rotate(-3deg)  →  scale(2.5) rotate(-3deg) + position takes full area
  duration: 400ms, easing: cubic-bezier(0.4, 0, 0.2, 1)

Fullscreen background entrance:
  opacity: 0  →  1
  duration: 600ms, delay: 200ms

Content panel slide:
  When switching views: translateX(16px) opacity:0  →  translateX(0) opacity:1
  duration: 250ms

Track row hover:
  background: transparent → --color-bg-content-alt
  duration: 120ms

Heart icon like:
  transform: scale(1) → scale(1.4) → scale(1)
  duration: 200ms, easing: spring
  color: outline → filled red

Waveform:
  Each bar animates its filled height in sync with audio (Web Audio API or mock)
  Bars: 2px wide, 2px gap, height 4–24px random per bar

Volume / shuffle / repeat active state:
  Color transition: --color-text-secondary-dark → --color-brand
  duration: 150ms
```

---

## 7. Responsive Behavior

The design is primarily **landscape tablet** (1024px+). Define breakpoints:

| Breakpoint | Behavior |
|------------|---------|
| `≥1280px` | Full layout: sidebar + player panel + content panel (two-column content) |
| `1024–1279px` | Same layout, content panel collapses to single column |
| `768–1023px` | Hide player panel by default; show via toggle. Content panel full width. |
| `<768px` | Mobile: bottom tab bar replaces sidebar. Player panel accessible via drawer. |

---

## 8. File / Folder Structure (Suggested)

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx          # outer wrapper, flex row
│   │   ├── Sidebar.tsx           # icon nav column
│   │   ├── PlayerPanel.tsx       # left dark player area
│   │   └── ContentPanel.tsx      # right white area wrapper
│   │
│   ├── player/
│   │   ├── NowPlayingCard.tsx    # large album art + controls
│   │   ├── QueueCard.tsx         # individual queue item
│   │   ├── QueueRow.tsx          # horizontal scroll queue
│   │   ├── PlaybackControls.tsx  # prev/pause/next/shuffle/repeat
│   │   ├── WaveformBar.tsx       # waveform seek component
│   │   ├── PlaybackBar.tsx       # fullscreen bottom bar
│   │   └── FullscreenPlayer.tsx  # immersive overlay
│   │
│   ├── home/
│   │   ├── HomeView.tsx
│   │   ├── HeroBanner.tsx
│   │   ├── TrendingSection.tsx
│   │   ├── TopArtistsSection.tsx
│   │   └── RecentFavourites.tsx
│   │
│   ├── common/
│   │   ├── TrackListItem.tsx
│   │   ├── ArtistCard.tsx
│   │   ├── PlaylistCard.tsx
│   │   ├── SearchBar.tsx
│   │   ├── IconButton.tsx
│   │   └── ContextMenu.tsx
│   │
│   └── icons/
│       └── (custom SVG icon components)
│
├── store/
│   ├── playerStore.ts            # Zustand / Redux slice for player state
│   └── libraryStore.ts           # tracks, playlists, liked songs
│
├── hooks/
│   ├── useAudio.ts               # Web Audio API wrapper
│   ├── useWaveform.ts            # waveform visualization hook
│   └── useFullscreen.ts          # fullscreen toggle logic
│
├── types/
│   ├── track.ts                  # Track, Album, Artist interfaces
│   └── player.ts                 # PlayerState interface
│
├── data/
│   └── mockData.ts               # sample tracks, artists, playlists
│
└── styles/
    └── tokens.css                # CSS custom properties (all tokens above)
```

---

## 9. Icon Reference

All icons should come from a consistent set — recommend **Lucide React** or **Heroicons**. Specific mappings:

| UI Element | Icon name |
|------------|-----------|
| Home | `Home` |
| Music / Songs | `Music` |
| Library | `FolderOpen` |
| Profile | `User` |
| Favorites | `Heart` |
| Discover | `Sparkles` |
| Playlists | `ListMusic` |
| Settings | `Settings2` |
| Previous track | `SkipBack` |
| Play | `Play` |
| Pause | `Pause` |
| Next track | `SkipForward` |
| Shuffle | `Shuffle` |
| Repeat | `Repeat` / `Repeat1` |
| Volume | `Volume2` |
| Search | `Search` |
| Notification | `Bell` |
| More options | `MoreHorizontal` |
| Share | `Share2` |
| Add to queue | `Plus` |
| Liked (filled) | `Heart` (fill) |

---

## 10. Mock Data Shape

```ts
interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;        // seconds
  artUrl: string;
  audioUrl?: string;
  playCount: number;
  isLiked: boolean;
}

interface Artist {
  id: string;
  name: string;
  imageUrl: string;
  followers: number;
  totalPlays: number;
}

interface Playlist {
  id: string;
  name: string;
  description: string;
  artUrl: string;
  tracks: Track[];
}
```

---

## 11. Accessibility Notes

- All icon-only buttons must have `aria-label`.
- Sidebar nav items use `role="navigation"` + `aria-current="page"` on active item.
- Waveform bar needs `role="slider"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- Heart toggle: `aria-pressed`, announce "Liked" / "Removed from likes".
- Color contrast: white text on `--color-bg-player` (#211F38) passes AA at all used sizes.
- Respect `prefers-reduced-motion`: disable waveform animation and fullscreen zoom transitions when set.
- Focus ring: custom `outline: 2px solid --color-brand` with `2px offset` replaces default browser ring.

---

## 12. Build Checklist for opencode

- [ ] Set up CSS custom properties in `tokens.css`, import globally
- [ ] Build `AppShell` with three-column flex layout
- [ ] Build `Sidebar` with icon buttons and active state
- [ ] Build `WaveformBar` component (pure CSS or Canvas)
- [ ] Build `PlayerPanel` with queue + now-playing card
- [ ] Build `TrackListItem` with all columns
- [ ] Build `HomeView` with all four sections
- [ ] Build `HeroBanner` as a carousel (3 slides minimum)
- [ ] Wire `PlayerState` (Zustand recommended)
- [ ] Implement `FullscreenPlayer` transition (Framer Motion `layoutId` approach works well for album art zoom)
- [ ] Build `PlaybackBar` with glassmorphism styling
- [ ] Add `useAudio` hook wiring (or mock with a timer for UI testing)
- [ ] Add hover/active/focus states to all interactive elements
- [ ] Test at 1280px, 1024px, 768px breakpoints
- [ ] Add `prefers-reduced-motion` guard to all animations
