# NEOTOKYO FM — v2 Remaining Phases

> Generated: 2026-07-08

---

## ✅ Completed

### Step Zero — VM Service Dashboard
Pre-existing at `/mnt/data/projects/dashboard/` — Flask app, HTML template, systemd unit, install docs.

### Priority 1 — UI Redesign

| # | Task | Status |
|---|------|--------|
| 1.1 | Bottom Player Bar | ✅ compact 72px bar, slide-up overlay, mobile touch targets |
| 1.2 | Album Art Color Extraction | ✅ `useAlbumColor` hook, ambient gradient on bar/overlay/home |
| 1.3 | Color Token Audit | ✅ all hardcoded hex replaced with CSS vars |
| 1.4 | Light Theme Rework | ✅ `:root:not(.dark)` CSS vars, `darkMode: 'class'` in Tailwind |
| 1.5 | Animated Page Transitions | ✅ `PageTransition.tsx` — `<Outlet>` wrapped with `key=pathname` + `animate-fade-in` |
| 1.6 | Mobile Bottom Sheet | ✅ unified bar + full-screen overlay on tap |
| 1.7 | Sidebar Enhancement | ✅ tooltips, now-playing dot, queue badge |
| 1.8 | Scanline Overlay Toggle | ✅ store boolean, keyboard shortcut, default on |
| 1.9 | Micro-interactions | ✅ heart-bounce keyframes, range slider glow, `card-hover` class |

### Priority 2 — Core Feature Polish

| # | Task | Status |
|---|------|--------|
| 2.1a | Station offline state | ✅ graceful failure UI |
| 2.1b | Connectivity test indicator | ✅ green/red indicator |
| 2.1c | Persistent now-playing cache | ✅ localStorage |
| 2.1d | Drag-reorder AdminRadio | ✅ |
| 2.1e | Genre color badges | ✅ per-genre Tailwind color |
| 2.1f | Add custom station on RadioPage | ✅ |
| 2.2a | Video thumbnails | ✅ displayed in search results |
| 2.2b | Search pagination | ✅ Load More button |
| 2.2c | Playlist import from URL | ✅ `expandPlaylist` + download queue in `YouTubePage.tsx` |
| 2.2d | Download completion toasts | ✅ |
| 2.3a | Canvas DPR scaling | ✅ `useCanvasVisualizer` hook, all 4 visualizers (Spectrum, Waveform, Circular, Particle) |
| 2.3b | Frame rate governor | ✅ cancels RAF when hidden, caps at 30fps |
| 2.3c | EQ curve connecting sliders | ✅ SVG path in `EQPanel.tsx` (already existed, verified) |
| 2.3d | Crossfade duration slider | ✅ slider in `NowPlayingOverlay.tsx` (0–12s), store already had `crossfade` + `setCrossfade` |
| 2.3e | VU Meter gradient + peak hold | ✅ brand gradient bars, peak hold line with decay |
| 2.4a | LocalStorage cache (24h TTL) | ✅ `neotokyo-lyrics-<key>` with timestamp expiry |
| 2.4b | Manual sync offset | ✅ Shift+↑/↓ ±0.5s, offset indicator with reset |
| 2.4c | LRC file upload | ✅ in `LyricsOverlay.tsx` + `AdminLyrics.tsx` |
| 2.4d | Submit form guide + char count | ✅ guide overlay with examples, character counter |
| 2.5a | Scanner SSE progress bar | ✅ frontend polls `/api/scanner-status` every 600ms |
| 2.5b | Inline click-to-edit metadata | ✅ click table cell → auto-focus input → Enter/Blur saves |
| 2.5c | ConfirmDialog for destructive actions | ✅ reusable `ConfirmDialog.tsx` component, wired in `AdminSongs.tsx` |
| 2.5d | Log level filter tabs | ✅ ALL/INFO/WARN/ERROR/DEBUG tabs in `AdminLogs.tsx` |
| 2.5e | Upload progress bar | ✅ XHR `upload.onprogress` in `AdminUploads.tsx` |
| 2.6a | Bulk tag editor | ✅ select tracks → batch edit modal → apply |
| 2.6b | List/Grid view toggle | ✅ `LayoutGrid`/`List` icons in LibraryPage, persisted to localStorage |
| 2.6c | Album grouping | ✅ toggle groups by `album` field, album cards with track lists |

---

## ✅ All phases complete — see `v2_audit_report.md` for full details.
