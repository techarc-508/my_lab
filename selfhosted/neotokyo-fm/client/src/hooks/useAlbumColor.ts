import { useState, useEffect, useRef } from 'react'

interface AlbumColorResult {
  vibrant: string
  muted: string
  dark: string
  loading: boolean
}

function hex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('')
}

function extractColors(imageUrl: string): Promise<{ vibrant: string; muted: string; dark: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 50
      canvas.height = 50
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas context')); return }
      ctx.drawImage(img, 0, 0, 50, 50)
      const data = ctx.getImageData(0, 0, 50, 50).data
      const buckets: { r: number; g: number; b: number; count: number }[] = []
      const step = 4
      for (let i = 0; i < data.length; i += step * 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        if (r + g + b < 50) continue
        let found = false
        for (const bucket of buckets) {
          const dr = bucket.r - r, dg = bucket.g - g, db = bucket.b - b
          if (dr * dr + dg * dg + db * db < 800) {
            bucket.r = (bucket.r * bucket.count + r) / (bucket.count + 1)
            bucket.g = (bucket.g * bucket.count + g) / (bucket.count + 1)
            bucket.b = (bucket.b * bucket.count + b) / (bucket.count + 1)
            bucket.count++
            found = true
            break
          }
        }
        if (!found) buckets.push({ r, g, b, count: 1 })
      }
      buckets.sort((a, b) => b.count - a.count)
      const top = buckets.slice(0, 3)
      const vibrant = top[0] ? hex(top[0].r, top[0].g, top[0].b) : '#8B5CF6'
      const muted = top[1] ? hex(top[1].r, top[1].g, top[1].b) : '#A78BFA'
      const dark = top[2] ? hex(top[2].r * 0.4, top[2].g * 0.4, top[2].b * 0.4) : '#1B1A30'
      resolve({ vibrant, muted, dark })
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageUrl
  })
}

const FALLBACK: { vibrant: string; muted: string; dark: string } = {
  vibrant: '#8B5CF6',
  muted: '#A78BFA',
  dark: '#1B1A30',
}

export function useAlbumColor(imageUrl: string | undefined): AlbumColorResult {
  const [colors, setColors] = useState<{ vibrant: string; muted: string; dark: string; loading: boolean }>({
    ...FALLBACK,
    loading: true,
  })
  const lastUrl = useRef<string>('')

  useEffect(() => {
    if (!imageUrl || imageUrl === lastUrl.current) {
      setColors(prev => ({ ...prev, loading: false }))
      return
    }
    lastUrl.current = imageUrl
    setColors(prev => ({ ...prev, loading: true }))
    extractColors(imageUrl)
      .then(c => setColors({ ...c, loading: false }))
      .catch(() => setColors({ ...FALLBACK, loading: false }))
  }, [imageUrl])

  return colors
}
