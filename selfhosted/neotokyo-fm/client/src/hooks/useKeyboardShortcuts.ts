import { useEffect } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../services/audioEngine'

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (INPUT_TAGS.has(tag)) return

      const store = usePlayerStore.getState()

      switch (e.key) {
        case ' ':
          e.preventDefault()
          audioEngine.togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          audioEngine.skip(-5)
          break
        case 'ArrowRight':
          e.preventDefault()
          audioEngine.skip(5)
          break
        case 'ArrowUp':
          e.preventDefault()
          const volUp = Math.min(1, store.volume + 0.1)
          store.setVolume(volUp)
          audioEngine.setVolume(volUp)
          break
        case 'ArrowDown':
          e.preventDefault()
          const volDown = Math.max(0, store.volume - 0.1)
          store.setVolume(volDown)
          audioEngine.setVolume(volDown)
          break
        case 's':
          store.toggleShuffle()
          break
        case 'S':
          store.toggleScanlines()
          break
        case 'r':
          store.cycleRepeat()
          break
        case 'm':
          store.toggleMute()
          const after = usePlayerStore.getState()
          audioEngine.setVolume(after.isMuted ? 0 : after.volume)
          break
        case 'e':
          store.toggleShowEqualizer()
          break
        case 'l':
          store.toggleShowLyrics()
          break
        case '+':
        case '=':
          const vu = Math.min(1, store.volume + 0.1)
          store.setVolume(vu)
          audioEngine.setVolume(vu)
          break
        case '-':
        case '_':
          const vd = Math.max(0, store.volume - 0.1)
          store.setVolume(vd)
          audioEngine.setVolume(vd)
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
