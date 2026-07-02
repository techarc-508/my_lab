import { useState, useEffect, useRef } from 'react'

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function AnimatedStat({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    if (value === 0) { setDisplay(0); return }
    const start = performance.now()
    const duration = 800
    const raf = (now: number) => {
      if (!mounted.current) return
      const pct = Math.min((now - start) / duration, 1)
      setDisplay(Math.round(value * easeOutCubic(pct)))
      if (pct < 1) requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
    return () => { mounted.current = false }
  }, [value])
  return <>{display}{suffix}</>
}

export function Sparkline({ data, width = 160, height = 32, color = '#FF006E' }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length < 2) return <div className="text-[9px] font-body text-content-tertiary">No data</div>
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const id = `sg-${color.replace('#', '')}`
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${id})`} />
    </svg>
  )
}

export function Donut({ percent, size = 48, strokeWidth = 4, color = '#FF006E', bgColor = 'rgba(255,255,255,0.06)' }: { percent: number; size?: number; strokeWidth?: number; color?: string; bgColor?: string }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const dash = (percent / 100) * circ
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bgColor} strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
    </svg>
  )
}

export function MiniBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px">
      {items.map((item, i) => (
        <div key={i} className="rounded-sm transition-all" style={{ width: `${(item.value / total) * 100}%`, background: item.color, minWidth: item.value > 0 ? '3px' : '0' }} title={`${item.label}: ${item.value}`} />
      ))}
    </div>
  )
}
