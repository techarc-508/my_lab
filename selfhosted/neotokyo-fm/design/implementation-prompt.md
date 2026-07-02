# Lyrics Feature Implementation Prompt

## Context
You are implementing a lyrics overlay feature for the NEOTOKYO FM music player. The current UI has a sidebar "Now Playing" section with album art, song info, and player controls. The file icon in the player controls should toggle a lyrics view.

---

## Task
Add a lyrics display overlay that:
1. Activates on file icon click
2. Shows blurred album art background with centered album art
3. Displays synced lyrics that scroll upward
4. Works on both desktop and mobile viewports

---

## Implementation Steps

### Step 1: Create LyricsOverlay Component

```jsx
// components/LyricsOverlay/LyricsOverlay.jsx
import { useState, useEffect, useRef } from 'react';
import styles from './lyricsOverlay.module.css';

export default function LyricsOverlay({ 
  isOpen, 
  onClose, 
  albumArt, 
  songTitle, 
  artistName, 
  lyrics, 
  currentTime 
}) {
  const lyricsRef = useRef(null);
  const [activeLine, setActiveLine] = useState(0);

  // Find active lyric line based on current playback time
  useEffect(() => {
    if (!lyrics || lyrics.length === 0) return;
    
    const index = lyrics.findIndex((line, i) => {
      const nextLine = lyrics[i + 1];
      return currentTime >= line.time && 
             (!nextLine || currentTime < nextLine.time);
    });
    
    if (index !== -1 && index !== activeLine) {
      setActiveLine(index);
      scrollToLine(index);
    }
  }, [currentTime, lyrics]);

  const scrollToLine = (index) => {
    if (!lyricsRef.current) return;
    const line = lyricsRef.current.children[index];
    if (line) {
      line.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div 
        className={styles.background}
        style={{ backgroundImage: `url(${albumArt})` }}
      />
      
      <div className={styles.container} onClick={e => e.stopPropagation()}>
        <div className={styles.albumSection}>
          <img 
            src={albumArt} 
            alt={songTitle}
            className={styles.albumArt}
          />
          <h2 className={styles.title}>{songTitle}</h2>
          <p className={styles.artist}>{artistName}</p>
        </div>
        
        <div className={styles.lyricsSection} ref={lyricsRef}>
          {lyrics.map((line, index) => (
            <p 
              key={index}
              className={`${styles.lyricLine} ${
                index === activeLine ? styles.active : ''
              }`}
            >
              {line.text}
            </p>
          ))}
        </div>
      </div>

      <button 
        className={styles.closeButton}
        onClick={onClose}
        aria-label="Close lyrics"
      >
        ✕
      </button>
    </div>
  );
}
```

---

### Step 2: Create Styles

```css
/* components/LyricsOverlay/lyricsOverlay.module.css */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

.background {
  position: absolute;
  inset: -20px;
  background-size: cover;
  background-position: center;
  filter: blur(20px);
  transform: scale(1.1);
  opacity: 0.6;
}

.background::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
}

.container {
  position: relative;
  display: flex;
  width: 90%;
  max-width: 1200px;
  height: 80vh;
  gap: 40px;
  z-index: 1;
}

.albumSection {
  flex: 0 0 35%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.albumArt {
  width: 300px;
  height: 300px;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.title {
  color: #fff;
  font-size: 1.5rem;
  font-weight: 600;
  text-align: center;
}

.artist {
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
}

.lyricsSection {
  flex: 1;
  overflow-y: auto;
  padding: 40px 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
}

.lyricLine {
  color: rgba(255, 255, 255, 0.4);
  font-size: 1.25rem;
  line-height: 2;
  transition: all 0.3s ease;
  padding: 8px 0;
}

.lyricLine.active {
  color: #fff;
  font-weight: 600;
  transform: scale(1.02);
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
}

.closeButton {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1.25rem;
  cursor: pointer;
  z-index: 10;
  transition: background 0.2s;
}

.closeButton:hover {
  background: rgba(255, 255, 255, 0.2);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .container {
    flex-direction: column;
    width: 95%;
    height: 90vh;
    gap: 20px;
  }
  
  .albumSection {
    flex: 0 0 auto;
    gap: 12px;
  }
  
  .albumArt {
    width: 150px;
    height: 150px;
  }
  
  .title {
    font-size: 1.25rem;
  }
  
  .lyricsSection {
    flex: 1;
    padding: 20px 0;
  }
  
  .lyricLine {
    font-size: 1rem;
    line-height: 1.8;
  }
}
```

---

### Step 3: Add State Management

```jsx
// In your main App or Player component
const [lyricsState, setLyricsState] = useState({
  isActive: false,
  currentLyrics: [],
  activeLineIndex: 0
});

const toggleLyrics = () => {
  setLyricsState(prev => ({
    ...prev,
    isActive: !prev.isActive
  }));
};

const updateActiveLine = (time) => {
  if (!lyricsState.currentLyrics.length) return;
  
  const index = lyricsState.currentLyrics.findIndex((line, i) => {
    const next = lyricsState.currentLyrics[i + 1];
    return time >= line.time && (!next || time < next.time);
  });
  
  setLyricsState(prev => ({
    ...prev,
    activeLineIndex: index >= 0 ? index : prev.activeLineIndex
  }));
};
```

---

### Step 4: Update Player Controls

```jsx
// Add click handler to the file icon button
<button 
  className={styles.lyricsButton}
  onClick={toggleLyrics}
  aria-label="Toggle lyrics"
  aria-pressed={lyricsState.isActive}
>
  {/* File/Lyrics Icon */}
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
</button>
```

---

### Step 5: Integrate with Audio Player

```jsx
// Connect lyrics to audio playback
useEffect(() => {
  const audio = audioRef.current;
  
  const handleTimeUpdate = () => {
    updateActiveLine(audio.currentTime);
  };
  
  audio.addEventListener('timeupdate', handleTimeUpdate);
  return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
}, [lyricsState.currentLyrics]);
```

---

## File Structure
```
src/
├── components/
│   ├── LyricsOverlay/
│   │   ├── LyricsOverlay.jsx
│   │   └── lyricsOverlay.module.css
│   └── Player/
│       └── PlayerControls.jsx  (modified)
└── hooks/
    └── useLyrics.js  (optional - for lyrics parsing)
```

---

## Key Requirements
1. Do NOT modify existing component styles
2. Use CSS Modules for isolation
3. Add z-index layering for overlay
4. Support ESC key to close
5. Handle empty lyrics gracefully
6. Test on both desktop and mobile viewports

---

## Testing Checklist
- [ ] File icon toggles lyrics overlay
- [ ] Album art displays correctly
- [ ] Background blur works
- [ ] Lyrics scroll smoothly
- [ ] Active line highlights
- [ ] Mobile layout responsive
- [ ] ESC key closes overlay
- [ ] Click outside closes overlay
- [ ] No existing functionality broken
