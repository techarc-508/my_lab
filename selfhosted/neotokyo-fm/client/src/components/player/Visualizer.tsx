import { usePlayerStore } from '../../stores/playerStore'
import SpectrumVisualizer from './visualizers/SpectrumVisualizer'
import WaveformVisualizer from './visualizers/WaveformVisualizer'
import CircularVisualizer from './visualizers/CircularVisualizer'
import ParticleVisualizer from './visualizers/ParticleVisualizer'

interface Props {
  width?: number
  height?: number
}

export default function Visualizer({ width = 256, height = 64 }: Props) {
  const mode = usePlayerStore(s => s.visualizerMode)
  const isPlaying = usePlayerStore(s => s.isPlaying)

  if (mode === 'none') return null

  const paused = !isPlaying
  const props = { width, height, paused }

  switch (mode) {
    case 'spectrum':
      return <SpectrumVisualizer {...props} />
    case 'waveform':
      return <WaveformVisualizer {...props} />
    case 'circular':
      return <CircularVisualizer {...props} />
    case 'particle':
      return <ParticleVisualizer {...props} />
    default:
      return null
  }
}
