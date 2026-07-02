import { useEffect, useRef, useState } from 'react'
import { audioEngine } from '../services/audioEngine'

export function useVisualizer(bins = 64) {
  const [data, setData] = useState(new Uint8Array(bins))
  const rafRef = useRef<number>(undefined)

  useEffect(() => {
    const analyse = () => {
      const analyser = audioEngine.getAnalyser()
      if (analyser) {
        const arr = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(arr)
        const step = Math.floor(arr.length / bins)
        const sampled = new Uint8Array(bins)
        for (let i = 0; i < bins; i++) {
          let sum = 0
          for (let j = 0; j < step; j++) sum += arr[i * step + j] || 0
          sampled[i] = sum / step
        }
        setData(sampled)
      }
      rafRef.current = requestAnimationFrame(analyse)
    }
    rafRef.current = requestAnimationFrame(analyse)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [bins])

  return { data, binData: Array.from(data).map(v => v / 255) }
}
