import { useRef, useEffect, useCallback } from 'react'

interface CanvasSetup {
  canvas: HTMLCanvasElement | null
  dpr: number
}

export function useCanvasVisualizer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
  paused: boolean,
  draw: (ctx: CanvasRenderingContext2D, dpr: number) => void,
) {
  const rafRef = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)
  const hiddenRef = useRef(false)

  const frameGov = useCallback(() => {
    const now = Date.now()
    if (now - lastFrameRef.current < 33) return // ~30fps cap
    lastFrameRef.current = now
    return true
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const onVis = () => {
      if (document.hidden) { hiddenRef.current = true; return }
      hiddenRef.current = false
    }
    document.addEventListener('visibilitychange', onVis)

    const loop = () => {
      if (hiddenRef.current || !frameGov()) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      draw(ctx, dpr)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [width, height, paused])
}
