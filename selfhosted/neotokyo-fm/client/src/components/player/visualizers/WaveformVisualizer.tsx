import { useRef, useEffect } from 'react'
import { audioEngine } from '../../../services/audioEngine'

interface Props {
  width: number
  height: number
  paused: boolean
}

export default function WaveformVisualizer({ width, height, paused }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf: number
    const draw = () => {
      if (!ctx) { raf = requestAnimationFrame(draw); return }
      ctx.clearRect(0, 0, width, height)
      ctx.strokeStyle = '#ffb1c3'
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
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [width, height, paused])

  return <canvas ref={canvasRef} width={width} height={height} className="rounded" />
}
