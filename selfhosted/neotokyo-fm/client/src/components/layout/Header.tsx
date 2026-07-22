import { useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePlayerStore } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'
import { Sun, Moon } from 'lucide-react'

function HeaderEQ() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isPlaying = usePlayerStore(s => s.isPlaying)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf: number
    const draw = () => {
      if (!ctx) { raf = requestAnimationFrame(draw); return }
      ctx.clearRect(0, 0, 24, 24)
      const analyser = audioEngine.getAnalyser()
      let heights: number[]
      if (isPlaying && analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        const step = Math.floor(data.length / 5)
        heights = [0,1,2,3,4].map(i => {
          let sum = 0
          for (let j = 0; j < step; j++) sum += data[i * step + j] || 0
          return Math.max(3, (sum / step / 255) * 22)
        })
      } else {
        heights = [4, 4, 4, 4, 4]
      }
      const barWidth = 3
      const gap = 2
      for (let i = 0; i < 5; i++) {
        const x = i * (barWidth + gap)
        const h = heights[i]
        ctx.fillStyle = i % 2 === 0 ? '#ffb1c3' : '#00e3fd'
        ctx.fillRect(x, 24 - h, barWidth, h)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  return <canvas ref={canvasRef} width={24} height={24} className="w-6 h-6" />
}

export default function Header() {
  const theme = usePlayerStore(s => s.theme)
  const toggleTheme = usePlayerStore(s => s.toggleTheme)
  return (
    <header className="h-12 border-b border-border-subtle/50 flex items-center px-4 gap-4 shrink-0">
      <Link to="/" className="flex items-center gap-2">
        <span className="font-bold text-sm text-pink-400 tracking-wider">NEOTOKYO FM</span>
      </Link>
      <div className="flex items-center gap-2 ml-auto">
        <HeaderEQ />
        <button onClick={toggleTheme} className="text-text-muted hover:text-white p-1" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  )
}
