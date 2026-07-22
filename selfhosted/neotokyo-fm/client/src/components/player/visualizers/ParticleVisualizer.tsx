import { useRef } from 'react'
import { audioEngine } from '../../../services/audioEngine'
import { useCanvasVisualizer } from '../../../hooks/useCanvasVisualizer'

interface Props { width: number; height: number; paused: boolean }

interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; hue: number; size: number
}

const MAX_PARTICLES = 80

export default function ParticleVisualizer({ width, height, paused }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const timeRef = useRef(0)

  useCanvasVisualizer(canvasRef, width, height, paused, (ctx) => {
    ctx.clearRect(0, 0, width, height)
    timeRef.current++

    if (!paused) {
      const analyser = audioEngine.getAnalyser()
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const energy = sum / data.length / 255
        if (energy > 0.15 && timeRef.current % 2 === 0) {
          const p: Particle = {
            x: width / 2 + (Math.random() - 0.5) * 40,
            y: height / 2 + (Math.random() - 0.5) * 40,
            vx: (Math.random() - 0.5) * energy * 4,
            vy: (Math.random() - 0.5) * energy * 4,
            life: 1,
            hue: 200 + energy * 140,
            size: 1 + energy * 3,
          }
          particlesRef.current.push(p)
          if (particlesRef.current.length > MAX_PARTICLES) {
            particlesRef.current = particlesRef.current.slice(-MAX_PARTICLES)
          }
        }
      }
    }

    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.015
      if (p.life <= 0) return false
      ctx.globalAlpha = p.life
      ctx.fillStyle = `hsl(${p.hue}, 100%, 60%)`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      return true
    })
  })

  return <canvas ref={canvasRef} style={{ width, height }} className="rounded" />
}
