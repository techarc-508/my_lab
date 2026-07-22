import { useCallback, useRef, useMemo, useEffect, useState } from 'react'
import { usePlayerStore, EQ_PRESETS } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'
import { X } from 'lucide-react'

const FREQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']
const PRESET_NAMES = Object.keys(EQ_PRESETS)

function EqSlider({ index, value, onChange, curveColor }: {
  index: number
  value: number
  onChange: (v: number) => void
  curveColor: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const pct = ((value + 6) / 12) * 100

  const getValue = (clientY: number) => {
    const el = trackRef.current
    if (!el) return value
    const rect = el.getBoundingClientRect()
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height))
    const raw = 6 - (y / rect.height) * 12
    return Math.round(Math.max(-6, Math.min(6, raw)))
  }

  const onDown = (e: React.MouseEvent) => {
    dragging.current = true
    onChange(getValue(e.clientY))
    const onMove = (ev: MouseEvent) => { onChange(getValue(ev.clientY)) }
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[9px] font-mono text-content-secondary tabular-nums" style={{ color: value > 0 ? curveColor : value < 0 ? '#ff007f' : undefined }}>
        {value > 0 ? `+${value}` : value}
      </span>
      <div
        ref={trackRef}
        className="w-full h-28 rounded-full relative cursor-pointer"
        style={{ background: 'var(--color-waveform-empty, rgba(255,255,255,0.08))' }}
        onMouseDown={onDown}
      >
        <div
          className="absolute bottom-0 left-1 right-1 rounded-full transition-none"
          style={{
            height: `${pct}%`,
            background: value >= 0
              ? `linear-gradient(to top, ${curveColor}, ${curveColor}88)`
              : `linear-gradient(to top, #ff007f88, #ff007f)`,
            opacity: 0.7,
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 transition-none"
          style={{
            bottom: `${pct}%`,
            marginBottom: '-6px',
            borderColor: value >= 0 ? curveColor : '#ff007f',
            background: 'var(--color-surface-raised)',
          }}
        />
      </div>
      <span className="text-[8px] font-mono text-content-tertiary">{FREQ_LABELS[index]}</span>
    </div>
  )
}

export default function EQPanel() {
  const show = usePlayerStore(s => s.showEqualizer)
  const bands = usePlayerStore(s => s.eqBands)
  const activePreset = usePlayerStore(s => s.activeEqPreset)
  const setBand = usePlayerStore(s => s.setEqBand)
  const setPreset = usePlayerStore(s => s.setEqPreset)
  const toggle = usePlayerStore(s => s.toggleShowEqualizer)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setVisible(true)
      const bands = usePlayerStore.getState().eqBands
      audioEngine.applyEqBands(bands)
    } else {
      const timer = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(timer)
    }
  }, [show])

  useEffect(() => {
    if (!show) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggle()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [show, toggle])

  const handleBand = useCallback((idx: number, val: number) => {
    setBand(idx, val)
    audioEngine.setEqBand(idx, val)
  }, [setBand])

  const handlePreset = useCallback((name: string) => {
    setPreset(name)
    const b = EQ_PRESETS[name]
    if (b) audioEngine.applyEqBands(b)
  }, [setPreset])

  const curveColor = '#ff007f'

  const svgPath = useMemo(() => {
    const w = 400, h = 80, pad = 8
    const pw = w - pad * 2, ph = h - pad * 2
    const pts = bands.map((g, i) => ({
      x: pad + (i / (bands.length - 1)) * pw,
      y: pad + ph - ((g + 6) / 12) * ph,
    }))
    if (pts.length === 0) return ''
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const fill = `${line} L ${pts[pts.length - 1].x} ${h} L ${pts[0].x} ${h} Z`
    return { line, fill }
  }, [bands])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={(e) => { if (e.target === e.currentTarget) toggle() }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300" style={{ opacity: show ? 1 : 0 }} />
      <div
        className="relative bg-surface-raised border-t border-border-default/50 rounded-t-2xl shadow-2xl transition-transform duration-300"
        style={{ transform: show ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-content-primary tracking-wide uppercase">Equalizer</h3>
            <span className="text-[10px] font-mono text-content-tertiary bg-surface-sunken px-2 py-0.5 rounded">
              {activePreset}
            </span>
          </div>
          <button onClick={toggle} className="w-7 h-7 rounded-full bg-surface-overlay flex items-center justify-center hover:bg-white/20 transition-colors">
            <X size={12} className="text-content-secondary" />
          </button>
        </div>

        <div className="px-5 pb-4 space-y-4">
          {/* Curve */}
          <svg viewBox="0 0 400 80" className="w-full h-16" preserveAspectRatio="none">
            <defs>
              <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={curveColor} stopOpacity="0.25" />
                <stop offset="100%" stopColor={curveColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {svgPath && (
              <>
                <path d={svgPath.fill} fill="url(#eq-fill)" />
                <path d={svgPath.line} fill="none" stroke={curveColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}
          </svg>

          {/* Grid lines */}
          <div className="relative">
            <div className="absolute left-0 right-0 top-0 h-px bg-white/5" />
            <div className="absolute left-0 right-0 top-1/2 h-px bg-white/8" />
            <div className="absolute left-0 right-0 bottom-0 h-px bg-white/5" />

            {/* Sliders */}
            <div className="flex items-end gap-0 px-1">
              {bands.map((val, i) => (
                <EqSlider key={i} index={i} value={val} onChange={(v) => handleBand(i, v)} curveColor={curveColor} />
              ))}
            </div>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PRESET_NAMES.map(name => (
              <button
                key={name}
                onClick={() => handlePreset(name)}
                className={`px-3 py-1 rounded-full text-[10px] font-semibold transition-all ${
                  activePreset === name
                    ? 'bg-neon-pink text-white shadow-glow-pink-sm'
                    : 'bg-surface-overlay text-content-secondary hover:text-content-primary hover:bg-white/10'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
