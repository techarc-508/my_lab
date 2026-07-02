import { useCallback, useRef } from 'react'
import { usePlayerStore, EQ_PRESETS } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'

const EQ_FREQUENCIES = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']

export default function Equalizer() {
  const eqBands = usePlayerStore(s => s.eqBands)
  const activeEqPreset = usePlayerStore(s => s.activeEqPreset)
  const setEqBand = usePlayerStore(s => s.setEqBand)
  const setEqPreset = usePlayerStore(s => s.setEqPreset)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const dragRef = useRef<{ index: number; startY: number; startVal: number } | null>(null)

  const handleSlider = useCallback((index: number, value: number) => {
    const gain = Math.round((value - 50) * 0.24 * 10) / 10
    setEqBand(index, gain)
    audioEngine.setEqBand(index, gain)
  }, [setEqBand])

  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const pct = 1 - (e.clientY - rect.top) / rect.height
    const clamped = Math.max(0, Math.min(100, pct * 100))
    handleSlider(index, clamped)
    dragRef.current = { index, startY: e.clientY, startVal: clamped }
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const diff = (dragRef.current.startY - ev.clientY) / rect.height * 100
      const val = Math.max(0, Math.min(100, dragRef.current.startVal + diff))
      handleSlider(dragRef.current.index, val)
    }
    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const gainToPercent = (gain: number) => ((gain + 12) / 24) * 100
  const presetNames = Object.keys(EQ_PRESETS)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-display text-sm tracking-[2px] text-hot-pink">Equalizer</span>
        <div className="flex gap-1 flex-wrap">
          {presetNames.map(name => (
            <button
              key={name}
              onClick={() => setEqPreset(name)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-all font-mono ${
                activeEqPreset === name
                  ? 'bg-gradient-primary text-white shadow-glow-pink-sm'
                  : 'text-content-tertiary border border-border-default hover:border-hot-pink/40'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-1 h-36">
        {eqBands.map((gain, i) => {
          const pct = gainToPercent(gain)
          const hue = 200 + (pct / 100) * 140
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full">
              <span className="text-[9px] font-mono text-content-tertiary">{gain > 0 ? `+${gain}` : gain}</span>
              <div
                className="w-full flex-1 relative rounded-sm cursor-pointer group"
                style={{ background: 'linear-gradient(to top, #060620, #12123A)' }}
                onMouseDown={(e) => handleMouseDown(i, e)}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-sm transition-all duration-75"
                  style={{
                    height: `${pct}%`,
                    background: `linear-gradient(to top, hsl(${hue}, 100%, 40%), hsl(${hue}, 100%, 60%))`,
                    boxShadow: isPlaying ? `0 0 8px hsl(${hue}, 100%, 50%)` : 'none',
                  }}
                />
                <div
                  className="absolute left-0 right-0 h-2 -mt-1 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ top: `${100 - pct}%`, background: `hsl(${hue}, 100%, 70%)` }}
                />
              </div>
              <span className="text-[9px] font-mono text-content-tertiary">{EQ_FREQUENCIES[i]}</span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[9px] font-mono text-content-tertiary">
        <span>+12dB</span>
        <span>0dB</span>
        <span>-12dB</span>
      </div>
    </div>
  )
}
