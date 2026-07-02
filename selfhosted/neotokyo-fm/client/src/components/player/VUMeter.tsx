import { useRef, useEffect } from 'react'
import { audioEngine } from '../../services/audioEngine'

export default function VUMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf: number
    const draw = () => {
      const analyser = audioEngine.getAnalyser()
      if (!analyser || !ctx) { raf = requestAnimationFrame(draw); return }
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const barWidth = canvas.width / 64
      for (let i = 0; i < 64; i++) {
        const h = (data[i] / 255) * canvas.height
        const hue = 200 + (h / canvas.height) * 140
        ctx.fillStyle = `hsl(${hue}, 100%, ${40 + (h / canvas.height) * 30}%)`
        ctx.fillRect(i * barWidth, canvas.height - h, barWidth - 1, h)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={canvasRef} width={256} height={64} className="w-full h-16 rounded" />
}
