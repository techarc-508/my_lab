# Lyrics Overlay Feature Design

## Overview
A lyrics display feature that activates when clicking the file icon (right of player controls). Transforms the current view into an immersive lyrics experience with album art and blurred background.

---

## Trigger Element
**File Icon Button** - Located in the player controls row (rightmost position)
- Icon: Document/lyrics icon
- State: Toggle between normal and lyrics-active
- Tooltip: "Show Lyrics"

---

## Desktop Layout (>768px)

### Expanded State
```
┌─────────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░ BLURRED ALBUM ART BG ░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │                 │  │                             │  │
│  │   ┌─────────┐   │  │    [Line 1 - Active]       │  │
│  │   │         │   │  │    [Line 2]                │  │
│  │   │ Album   │   │  │    [Line 3]                │  │
│  │   │  Art    │   │  │    [Line 4]                │  │
│  │   │         │   │  │    [Line 5]                │  │
│  │   └─────────┘   │  │    [Line 6]                │  │
│  │   Song Title    │  │    [Line 7]                │  │
│  │   Artist Name   │  │    [Line 8]                │  │
│  │                 │  │                             │  │
│  └─────────────────┘  └─────────────────────────────┘  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
└─────────────────────────────────────────────────────────┘
```

### Desktop Specifications
- **Container**: Full viewport overlay (position: fixed)
- **Background**: Album art with `filter: blur(20px)` + dark overlay (rgba(0,0,0,0.6))
- **Layout**: Flexbox row - Album Art (left 35%) | Lyrics (right 65%)
- **Album Art**: 
  - Size: 300x300px (max)
  - Shadow: `0 20px 60px rgba(0,0,0,0.5)`
  - Border-radius: 16px
  - Centered vertically
- **Song Info**: Below album art, centered
- **Lyrics Panel**:
  - Scroll direction: Bottom-to-top (natural reading)
  - Active line highlight: Bold, larger font, accent color
  - Text: Semi-transparent for non-active lines
  - Scroll behavior: Smooth scroll to keep active line centered

---

## Mobile Layout (<768px)

### Expanded State
```
┌───────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░ │
│ ░░ BLURRED ALBUM ░░░░ │
│ ░░░░░░░░░░░░░░░░░░░░░ │
│  ┌─────────────────┐  │
│  │    ┌─────────┐  │  │
│  │    │ Album   │  │  │
│  │    │  Art    │  │  │
│  │    └─────────┘  │  │
│  │   Song Title    │  │
│  │   Artist Name   │  │
│  └─────────────────┘  │
│ ┌───────────────────┐ │
│ │  [Active Lyric]   │ │
│ │  [Next Lyric]     │ │
│ │  [Next Lyric]     │ │
│ │  ...              │ │
│ └───────────────────┘ │
└───────────────────────┘
```

### Mobile Specifications
- **Container**: Full viewport overlay
- **Background**: Album art with `filter: blur(30px)` + darker overlay
- **Layout**: Flexbox column - Album Art (top 40%) | Lyrics (bottom 60%)
- **Album Art**: 
  - Size: 200x200px
  - Margin: auto
- **Lyrics Panel**:
  - Scroll direction: Bottom-to-top
  - Touch-friendly scroll
  - Active line: Highlighted with accent color

---

## State Management

### State Object
```javascript
lyricsState = {
  isActive: false,          // Lyrics view toggle
  currentLineIndex: 0,      // Active lyric line
  lyricsData: [],           // Array of { time, text }
  scrollPosition: 0         // Current scroll offset
}
```

### Events
- `toggleLyricsView()` - Toggle lyrics overlay
- `updateActiveLine(time)` - Sync lyric with playback
- `scrollToLine(index)` - Scroll to specific line

---

## Animation & Transitions

### Open Animation
```css
@keyframes lyricsOpen {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

### Close Animation
```css
@keyframes lyricsClose {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}
```

### Line Highlight Transition
```css
.lyric-line {
  transition: all 0.3s ease;
  opacity: 0.4;
  transform: scale(0.98);
}

.lyric-line.active {
  opacity: 1;
  transform: scale(1);
  color: var(--accent-color);
  font-weight: 600;
}
```

---

## Theme Integration

### Color Variables (Match Existing Theme)
```css
:root {
  --lyrics-bg-overlay: rgba(0, 0, 0, 0.6);
  --lyrics-text-inactive: rgba(255, 255, 255, 0.4);
  --lyrics-text-active: #ffffff;
  --lyrics-accent: var(--primary-accent);  /* From main theme */
  --lyrics-blur-amount: 20px;
}
```

### Dark Theme Support
```css
[data-theme="dark"] {
  --lyrics-bg-overlay: rgba(0, 0, 0, 0.7);
  --lyrics-text-inactive: rgba(255, 255, 255, 0.35);
}
```

---

## Component Structure

```
LyricsOverlay/
├── LyricsOverlay.jsx        # Main container
├── AlbumArtSection.jsx      # Blurred bg + centered art
├── LyricsPanel.jsx          # Scrollable lyrics container
├── LyricLine.jsx            # Individual line component
└── styles/
    ├── lyricsOverlay.module.css
    └── lyricsOverlay.css
```

---

## Integration Points

### Existing Components to Modify
1. **Player Controls** - Add click handler to file icon
2. **App State** - Add lyrics state management
3. **Audio Player** - Emit time update events for lyric sync

### New Components
1. `LyricsOverlay` - Main overlay wrapper
2. `AlbumArtDisplay` - Album art with blur effect
3. `LyricsScroller` - Scrollable lyrics container

---

## Data Format (LRC Format)
```lrc
[00:12.00]Line 1 lyrics
[00:15.50]Line 2 lyrics
[00:19.00]Line 3 lyrics
```

---

## Accessibility
- ESC key to close overlay
- Tab navigation within lyrics
- Screen reader announcements for active line
- Reduced motion support

---

## Performance Considerations
- Use `will-change: transform` for blur animations
- Debounce scroll events
- Virtualize long lyrics lists
- Lazy load blur background image
