import { useRef } from 'react'
import { audioEngine } from '../../services/audioEngine'
import { useCanvasVisualizer } from '../../hooks/useCanvasVisualizer'

export default function VUMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peakRef = useRef(0)
  const decayRef = useRef(0)

  useCanvasVisualizer(canvasRef, 256, 64, false, (ctx, dpr) => {
    const w = 256, h = 64
    const analyser = audioEngine.getAnalyser()
    if (!analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    ctx.clearRect(0, 0, w, h)
    const barWidth = w / 64
    let currentPeak = 0
    for (let i = 0; i < 64; i++) {
      const val = data[i] / 255
      const hVal = val * h
      const percent = val
      const r = Math.round(255 * (1 - percent))
      const g = Math.round(255 * percent)
      ctx.fillStyle = percent > 0.7 ? 'var(--color-hot-pink)' : percent > 0.4 ? `rgb(${r}, ${g}, 100)` : 'var(--color-brand-light)'
      ctx.fillRect(i * barWidth, h - hVal, barWidth - 1, hVal)
      if (hVal > currentPeak) currentPeak = hVal
    }
    // Peak hold with decay
    if (currentPeak > peakRef.current) peakRef.current = currentPeak
    else if (decayRef.current++ > 4) { peakRef.current = Math.max(0, peakRef.current - 1); decayRef.current = 0 }
    if (peakRef.current > 0) {
      ctx.fillStyle = 'var(--color-content-primary)'
      const peakIdx = Math.floor((peakRef.current / h) * 64)
      ctx.fillRect(peakIdx * barWidth, h - peakRef.current, barWidth - 1, 2)
    }
  })

  return <canvas ref={canvasRef} style={{ width: '100%', height: 64 }} className="rounded" />
}
