import { useRef, useEffect } from 'react'
import { audioEngine } from '../../../services/audioEngine'

interface Props {
  width: number
  height: number
  paused: boolean
}

export default function SpectrumVisualizer({ width, height, paused }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
        const bars = 64
        const barWidth = width / bars
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor((i / bars) * data.length)
          const h = paused ? 2 : (data[idx] / 255) * height
          const hue = 200 + (h / height) * 140
          ctx.fillStyle = `hsl(${hue}, 100%, ${40 + (h / height) * 30}%)`
          ctx.fillRect(i * barWidth, height - h, Math.max(1, barWidth - 1), h)
        }
      } else {
        ctx.fillStyle = '#1d1e31'
        ctx.fillRect(0, 0, width, height)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [width, height, paused])

  return <canvas ref={canvasRef} width={width} height={height} className="rounded" />
}
