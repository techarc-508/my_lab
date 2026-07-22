import { useRef, useCallback } from 'react'

interface GestureHandlers {
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onLongPress?: () => void
  onPinch?: (scale: number) => void
  onTap?: () => void
}

const SWIPE_THRESHOLD = 50
const LONG_PRESS_MS = 500

export function useTouchGestures(handlers: GestureHandlers) {
  const state = useRef({ startX: 0, startY: 0, startDist: 0, longPressTimer: 0, moved: false })

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches
    state.current = { startX: t[0].clientX, startY: t[0].clientY, startDist: 0, longPressTimer: 0, moved: false }

    if (t.length === 2) {
      const dx = t[0].clientX - t[1].clientX
      const dy = t[0].clientY - t[1].clientY
      state.current.startDist = Math.hypot(dx, dy)
    }

    if (t.length === 1 && handlers.onLongPress) {
      state.current.longPressTimer = window.setTimeout(() => {
        if (!state.current.moved) handlers.onLongPress!()
      }, LONG_PRESS_MS)
    }
  }, [handlers])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    state.current.moved = true
    if (state.current.longPressTimer) {
      clearTimeout(state.current.longPressTimer)
      state.current.longPressTimer = 0
    }

    const t = e.touches
    if (t.length === 2 && handlers.onPinch) {
      const dx = t[0].clientX - t[1].clientX
      const dy = t[0].clientY - t[1].clientY
      const dist = Math.hypot(dx, dy)
      if (state.current.startDist > 0) {
        handlers.onPinch(dist / state.current.startDist)
      }
    }
  }, [handlers])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (state.current.longPressTimer) {
      clearTimeout(state.current.longPressTimer)
      state.current.longPressTimer = 0
    }

    if (e.changedTouches.length !== 1 || state.current.moved) {
      if (!state.current.moved && handlers.onTap) handlers.onTap()
      return
    }

    const dx = e.changedTouches[0].clientX - state.current.startX
    const dy = e.changedTouches[0].clientY - state.current.startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
      handlers.onTap?.()
      return
    }

    if (absDy > absDx) {
      if (dy < -SWIPE_THRESHOLD) handlers.onSwipeUp?.()
      else if (dy > SWIPE_THRESHOLD) handlers.onSwipeDown?.()
    } else {
      if (dx < -SWIPE_THRESHOLD) handlers.onSwipeLeft?.()
      else if (dx > SWIPE_THRESHOLD) handlers.onSwipeRight?.()
    }
  }, [handlers])

  return { onTouchStart, onTouchMove, onTouchEnd }
}
