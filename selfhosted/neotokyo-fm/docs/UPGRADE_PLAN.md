# NEOTOKYO FM — Upgrade Plan: The Path Beyond Navidrome

This document lays out a phased strategy to evolve NEOTOKYO FM from a personal music appliance into a serious self-hosted platform contender. It does **not** attempt to copy Navidrome — it plays to our unique strengths while methodically closing critical gaps.

---

## Philosophy: Don't Compete, Redefine

Navidrome is a **music server** — lightweight, Subsonic API, 50+ mobile apps. It wins on:
- Resource efficiency (30MB Go binary vs Flask)
- Client ecosystem (50+ apps vs browser-only)
- Maturity (6 years, 21,500 GitHub stars)
- Multi-user + transcoding + smart playlists

**We cannot beat Navidrome on its home turf.** But we can build something Navidrome fundamentally cannot be: an **all-in-one music experience appliance** that plays radio, YouTube, AND local files, with rich visualizers, karaoke lyrics, and a retro-neon aesthetic.

---

## Phase 0 — Polish & Ship (Current)

- [x] One-click Proxmox deployment (this repo)
- [x] Cloudflare Tunnel for zero-config HTTPS
- [x] Complete tarball with all 266 tracks
- [x] Optimized nginx with gzip + caching

---

## Phase 1 — Bulletproof Core Strengths (Weeks 1-2)

Make our unique features flawless. These are things Navidrome physically cannot do:

### 1.1 Internet Radio
- [ ] Gracefully handle station failures (fallback to next station)
- [ ] Add "test connectivity" in UI with status indicator
- [ ] Persistent now-playing cache (reduce polling on page reload)
- [ ] Allow user-uploaded station URLs via admin panel

### 1.2 YouTube Integration
- [ ] Add background download progress notifications
- [ ] Cache frequently searched results (reduce yt-dlp calls)
- [ ] Add playlist import from YouTube URLs
- [ ] Show video thumbnails in search results

### 1.3 Visualizers
- [ ] Fix any framerate drops on lower-end devices
- [ ] Add canvas resolution scaling for performance
- [ ] Consider WebGL-based visualizer as optional upgrade

### 1.4 Lyrics Overlay
- [ ] Cache lyrics locally (avoid refetching)
- [ ] Add manual sync offset adjustment
- [ ] Support .lrc file upload as alternative to auto-fetch

---

## Phase 2 — Mobile Experience (Weeks 3-6)

**Why it matters:** Navidrome has 50+ mobile apps. You have a browser. This is the #1 gap.

### 2.1 PWA Perfection (Week 3)
- [ ] Fix audio background playback on iOS/Android
- [ ] Add proper service worker with offline fallback page
- [ ] Implement media session API (lock screen controls on mobile)
- [ ] Add install prompt banner
- [ ] Optimize touch targets for thumbs

### 2.2 CapacitorJS Native Wrapper (Weeks 4-6)
Wrap the existing React app into actual native iOS/Android apps **without rewriting anything**:

```
neotokyo-fm/
├── client/                ← existing React app (untouched)
├── mobile/                ← NEW: CapacitorJS wrapper
│   ├── android/           ← generated Android project
│   ├── ios/               ← generated iOS project
│   ├── capacitor.config.ts
│   └── package.json
```

What Capacitor gives:
- Real APK/IPA files (not just a browser shortcut)
- Native audio controls (headphone buttons, lock screen)
- Push notifications (download complete alerts)
- Share sheet integration ("share to NEOTOKYO FM")
- App Store / Play Store publishable

**Effort:** ~2 weeks of configuration, zero React rewrites.

### 2.3 Touch Gestures
- [ ] Swipe left/right to skip tracks
- [ ] Pinch to change volume
- [ ] Long-press to add to queue
- [ ] Drag to reorder queue

---

## Phase 3 — Multi-User & Scale (Weeks 7-10)

**Why it matters:** Single-user limits sharing with family/friends.

### 3.1 Multi-User Backend (Week 7-8)
This is simpler than it sounds — your architecture already has session-based auth:

| Change | Where | Effort |
|--------|-------|--------|
| Add `users` table to SQLite | `models/db.py` | 1 day |
| Add `user_id` to playlists, queue, history tables | `models/db.py` | 1 day |
| Update all CRUD routes to scope by user | `routes/*.py` | 3 days |
| Add user registration UI (or invite-only) | Frontend admin | 2 days |
| Scope Zustand store by user | `stores/playerStore.ts` | 2 days |

**Total:** ~2 weeks backend, ~1 week frontend.

### 3.2 Transcoding (Week 9)
Add on-the-fly transcoding for mobile users on slow connections:

```python
# routes/files.py — new endpoint
@app.route('/api/audio-transcoded/<filename>')
def stream_transcoded(filename):
    bitrate = request.args.get('bitrate', '128')
    # Pipe through ffmpeg: FLAC/WAV → MP3 128kbps
    # Cache transcoded files for 1 hour
```

**Why:** 50MB FLAC files buffer on cellular. 128kbps MP3 plays instantly.

### 3.3 Performance Profiling (Week 10)
- [ ] Add database indexes on frequently queried columns
- [ ] Profile Flask endpoints with cProfile
- [ ] Add Redis caching for metadata queries (optional)
- [ ] Benchmark: verify 10K+ tracks works smoothly

---

## Phase 4 — The Killer Features (Weeks 11+)

**This is where we beat Navidrome.** Pick ONE to build first.

### Option A: "Smart Radio" — Multi-Source Mix
Blend your three sources into a single seamless experience:

```
"Play me something like this track"
    ↓
1. Search local library for similar genre/BPM
2. Search YouTube for related tracks
3. Find radio stations playing similar music
    ↓
Create a unified queue mixing all three sources
```

**Why Navidrome can't do this:** It's a local file server. No YouTube. No radio.

**Effort:** ~3 weeks (new backend endpoint + frontend mode)

### Option B: Social Listening — SyncPlay
Listen with friends remotely, synchronized:

```
1. "Start a Session" → generates shareable link
2. Friends open link → audio syncs to same track + position
3. Chat/emoji reactions on the now-playing screen
4. Host controls playback, guests follow
```

**Why Navidrome can't do this:** Single-user architecture, no real-time.

**Tech:** WebSocket (Flask-SocketIO) + shared state + ±500ms sync window

**Effort:** ~3-4 weeks

### Option C: AI-Powered Everything

| Feature | How | Effort |
|---------|-----|--------|
| AI playlist generator ("chill synthwave for coding") | OpenAI API + tag search | 1 week |
| Auto-tag unknown files | MusicBrainz AcoustID | 1 week |
| Audio similarity ("more like this") | Chromaprint fingerprinting | 2 weeks |
| Automatic genre classification | Audio analysis + ML | 2 weeks |

**Why Navidrome can't do this:** Just got basic audio similarity via plugins — you can do it natively and better.

---

## Phase 5 — Subsonic API (Aspirational)

Implementing the OpenSubsonic API would unlock 50+ mobile/desktop apps instantly:

```
GET /rest/ping
GET /rest/getMusicFolders
GET /rest/getIndexes
GET /rest/getArtists
GET /rest/getAlbumList
GET /rest/stream          ← stream audio
GET /rest/getCoverArt
GET /rest/search3
POST /rest/scrobble       ← Last.fm scrobbling
```

**Effort:** ~2-3 months. Significant but well-documented (spec is open).

**Recommendation:** Only do this after Phase 4. Our unique value is multi-source + visuals + aesthetic — Subsonic API just adds compatibility.

---

## Final Verdict

```
Navidrome = "my music collection on my phone" (50 apps, 30MB RAM)
NEOTOKYO FM = "the ultimate retro jukebox" (radio + YouTube + local + visuals)
```

After executing this plan:
```
NEOTOKYO FM = mobile apps + multi-user + smart radio + SyncPlay + Subsonic API
```

**You don't beat Navidrome. You become the only option for people who want more than just a file server.**

---

*Next review: after successful Proxmox deployment (Phase 0 complete)*
