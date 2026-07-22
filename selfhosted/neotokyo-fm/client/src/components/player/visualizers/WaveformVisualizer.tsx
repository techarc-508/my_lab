import { useRef } from 'react'
import { audioEngine } from '../../../services/audioEngine'
import { useCanvasVisualizer } from '../../../hooks/useCanvasVisualizer'

interface Props { width: number; height: number; paused: boolean }

export default function WaveformVisualizer({ width, height, paused }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useCanvasVisualizer(canvasRef, width, height, paused, (ctx) => {
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = 'var(--color-hot-pink)'
    ctx.lineWidth = 2
    const analyser = audioEngine.getAnalyser()
    if (analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteTimeDomainData(data)
      ctx.beginPath()
      const slice = data.length / width
      for (let x = 0; x < width; x++) {
        const v = data[Math.floor(x * slice)] / 128
        const y = paused ? height / 2 : (v * height) / 2
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  })
  return <canvas ref={canvasRef} style={{ width, height }} className="rounded" />
}
