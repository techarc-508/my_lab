import { useRef, useEffect } from 'react'
import { audioEngine } from '../../../services/audioEngine'

interface Props {
  width: number
  height: number
  paused: boolean
}

export default function CircularVisualizer({ width, height, paused }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(cx, cy) * 0.6

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf: number
    const draw = () => {
      if (!ctx) { raf = requestAnimationFrame(draw); return }
      ctx.clearRect(0, 0, width, height)
      const analyser = audioEngine.getAnalyser()
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        const bars = 48
        const step = Math.floor(data.length / bars)
        for (let i = 0; i < bars; i++) {
          let sum = 0
          for (let j = 0; j < step; j++) sum += data[i * step + j] || 0
          const avg = paused ? 0 : (sum / step / 255)
          const angle = (i / bars) * Math.PI * 2 - Math.PI / 2
          const r = radius + avg * radius * 0.5
          const x = cx + Math.cos(angle) * r
          const y = cy + Math.sin(angle) * r
          const hue = 200 + (avg * 140)
          ctx.strokeStyle = `hsl(${hue}, 100%, ${40 + avg * 30}%)`
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
          ctx.lineTo(x, y)
          ctx.stroke()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [width, height, cx, cy, radius, paused])

  return <canvas ref={canvasRef} width={width} height={height} className="rounded" />
}
