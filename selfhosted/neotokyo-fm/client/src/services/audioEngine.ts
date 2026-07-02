import { usePlayerStore } from '../stores/playerStore'

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

class AudioEngine {
  private audio: HTMLAudioElement | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private gainNode: GainNode | null = null
  private source: MediaElementAudioSourceNode | null = null
  private eqFilters: BiquadFilterNode[] = []
  private _cleanups: (() => void)[] = []
  private _srcSetup = false
  private _fadingOut = false
  private _fadeInterval: ReturnType<typeof setInterval> | null = null
  private _pauseTimeout: ReturnType<typeof setTimeout> | null = null
  private _skipTimeout: ReturnType<typeof setTimeout> | null = null

  private fadeTo(targetVolume: number, durationMs = 800) {
    if (!this.gainNode) return
    if (this._fadeInterval) clearInterval(this._fadeInterval)
    const startVol = this.gainNode.gain.value
    const steps = 16
    const stepTime = durationMs / steps
    const volStep = (targetVolume - startVol) / steps
    let currentStep = 0
    
    this._fadeInterval = setInterval(() => {
      currentStep++
      if (this.gainNode) {
        this.gainNode.gain.value = Math.max(0, Math.min(1, startVol + volStep * currentStep))
      }
      if (currentStep >= steps) {
        clearInterval(this._fadeInterval!)
        this._fadeInterval = null
        if (this.gainNode) this.gainNode.gain.value = targetVolume
      }
    }, stepTime)
  }

  private ensureContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 256
      this.gainNode = this.audioCtx.createGain()
      this.gainNode.gain.value = usePlayerStore.getState().volume
      this.gainNode.connect(this.audioCtx.destination)
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume()
    }
  }

  private initEQ() {
    if (!this.audioCtx) return
    this.eqFilters = EQ_FREQUENCIES.map(freq => {
      const filter = this.audioCtx!.createBiquadFilter()
      filter.type = 'peaking'
      filter.frequency.value = freq
      filter.Q.value = 1
      filter.gain.value = 0
      return filter
    })
    for (let i = 0; i < this.eqFilters.length - 1; i++) {
      this.eqFilters[i].connect(this.eqFilters[i + 1])
    }
  }

  setEqBand(index: number, gain: number) {
    if (this.eqFilters[index]) {
      this.eqFilters[index].gain.value = gain
    }
  }

  applyEqBands(bands: number[]) {
    bands.forEach((gain, i) => {
      if (this.eqFilters[i]) {
        this.eqFilters[i].gain.value = gain
      }
    })
  }

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => this.togglePlay())
    navigator.mediaSession.setActionHandler('pause', () => this.togglePlay())
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prevTrack())
    navigator.mediaSession.setActionHandler('nexttrack', () => this.nextTrack())
    navigator.mediaSession.setActionHandler('seekbackward', () => this.skip(-10))
    navigator.mediaSession.setActionHandler('seekforward', () => this.skip(10))
  }

  private updateMediaSession() {
    if (!('mediaSession' in navigator)) return
    const track = usePlayerStore.getState().currentTrack
    if (!track) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || '',
      artist: track.artist || '',
      album: '',
      artwork: track.albumArt ? [{ src: track.albumArt, sizes: '512x512', type: 'image/jpeg' }] : [],
    })
  }

  init() {
    if (this.audio) return
    this.ensureContext()
    this.initEQ()
    this.setupMediaSession()
    this.audio = new Audio()
    this.audio.preload = 'auto'

    this.source = this.audioCtx!.createMediaElementSource(this.audio)
    this.source.connect(this.analyser!)
    if (this.eqFilters.length > 0) {
      this.analyser!.connect(this.eqFilters[0])
      this.eqFilters[this.eqFilters.length - 1].connect(this.gainNode!)
    } else {
      this.analyser!.connect(this.gainNode!)
    }

    let lastTimeUpdate = 0
    const onTime = () => {
      const now = Date.now()
      if (now - lastTimeUpdate < 250) return
      lastTimeUpdate = now
      const curr = this.audio!.currentTime
      const dur = this.audio!.duration
      usePlayerStore.getState().setCurrentTime(curr)
      
      // Smooth fade out when approaching the end of the track
      if (isFinite(dur) && dur > 0 && dur - curr < 1.2 && !this._fadingOut) {
        this._fadingOut = true
        this.fadeTo(0, 1000)
      }
    }
    const onDur = () => {
      const dur = this.audio!.duration
      if (isFinite(dur) && dur > 0) {
        usePlayerStore.getState().setDuration(dur)
      }
    }
    const onEnd = () => {
      this._fadingOut = false
      const { repeat, currentTrack } = usePlayerStore.getState()
      if (repeat === 'one' && currentTrack) {
        if (this.audio) this.audio.currentTime = 0
        this.playTrack(currentTrack)
      } else {
        const prevTrack = currentTrack
        usePlayerStore.getState().playNext()
        const nextTrack = usePlayerStore.getState().currentTrack
        if (nextTrack && nextTrack.url !== prevTrack?.url) {
          this.playTrack(nextTrack)
        }
      }
    }
    const onPlay = () => usePlayerStore.getState().setPlaying(true)
    const onPause = () => usePlayerStore.getState().setPlaying(false)
    const onError = () => {
      usePlayerStore.getState().setPlaying(false)
      usePlayerStore.getState().setCurrentTime(0)
      usePlayerStore.getState().setDuration(0)
      const { isRadio } = usePlayerStore.getState()
      const msg = isRadio ? 'Station unreachable — try another' : 'Failed to load audio'
      import('../components/ui/StreamToast').then(m => m.showToast(msg, 'error'))
    }

    this.audio.addEventListener('timeupdate', onTime)
    this.audio.addEventListener('durationchange', onDur)
    this.audio.addEventListener('ended', onEnd)
    this.audio.addEventListener('play', onPlay)
    this.audio.addEventListener('pause', onPause)
    this.audio.addEventListener('error', onError)
    this._cleanups.push(
      () => this.audio?.removeEventListener('timeupdate', onTime),
      () => this.audio?.removeEventListener('durationchange', onDur),
      () => this.audio?.removeEventListener('ended', onEnd),
      () => this.audio?.removeEventListener('play', onPlay),
      () => this.audio?.removeEventListener('pause', onPause),
      () => this.audio?.removeEventListener('error', onError),
    )
    this._srcSetup = true
  }

  private ensureAudio() {
    if (!this.audio) this.init()
    this.ensureContext()
  }

  private setupSrc(url: string) {
    if (!this._srcSetup) {
      this.ensureAudio()
    }
    if (this.audio!.src !== url) {
      this.audio!.src = url
    }
  }

  async playTrack(track: { url: string }) {
    this.ensureAudio()
    this._fadingOut = false
    this.setupSrc(track.url)
    if (this.gainNode) this.gainNode.gain.value = 0
    this.updateMediaSession()
    try {
      await this.audio!.play()
      const vol = usePlayerStore.getState().isMuted ? 0 : usePlayerStore.getState().volume
      this.fadeTo(vol, 800)
    } catch (e) {
      if ((e as Error)?.name === 'NotAllowedError') {
        usePlayerStore.getState().setPlaying(false)
      }
    }
  }

  pause() {
    this.audio?.pause()
  }

  resume() {
    if (!this.audio) return
    this.ensureContext()
    this.audio.play().catch(() => {})
  }

  togglePlay() {
    if (!this.audio || !this.audio.src) return
    if (this.audio.paused) {
      this._fadingOut = false
      if (this._pauseTimeout) {
        clearTimeout(this._pauseTimeout)
        this._pauseTimeout = null
      }
      this.resume()
      const vol = usePlayerStore.getState().isMuted ? 0 : usePlayerStore.getState().volume
      if (this.gainNode) this.gainNode.gain.value = 0
      this.fadeTo(vol, 500)
    } else {
      this._fadingOut = true
      this.fadeTo(0, 300)
      this._pauseTimeout = setTimeout(() => {
        this.pause()
        this._pauseTimeout = null
      }, 300)
    }
  }

  seek(time: number) {
    if (this.audio) this.audio.currentTime = time
  }

  skip(seconds: number) {
    if (this.audio) {
      this._fadingOut = true
      this.fadeTo(0, 300)
      if (this._skipTimeout) clearTimeout(this._skipTimeout)
      this._skipTimeout = setTimeout(() => {
        this._skipTimeout = null
        const el = this.audio!
        el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + seconds))
        this._fadingOut = false
        const vol = usePlayerStore.getState().isMuted ? 0 : usePlayerStore.getState().volume
        this.fadeTo(vol, 500)
      }, 300)
    }
  }

  nextTrack() {
    const { currentTrack } = usePlayerStore.getState()
    usePlayerStore.getState().playNext()
    const next = usePlayerStore.getState().currentTrack
    if (next && next.url !== currentTrack?.url) {
      this.playTrack(next)
    }
  }

  prevTrack() {
    const { currentTrack } = usePlayerStore.getState()
    usePlayerStore.getState().playPrev()
    const prev = usePlayerStore.getState().currentTrack
    if (prev && prev.url !== currentTrack?.url) {
      this.playTrack(prev)
    }
  }

  setVolume(v: number) {
    if (this.gainNode) this.fadeTo(v, 400)
  }

  getAnalyser() {
    return this.analyser
  }

  getCurrentTime(): number {
    return this.audio?.currentTime || 0
  }

  getDuration(): number {
    return this.audio?.duration || 0
  }

  destroy() {
    this.audio?.pause()
    this.audioCtx?.close()
    if (this._pauseTimeout) clearTimeout(this._pauseTimeout)
    if (this._skipTimeout) clearTimeout(this._skipTimeout)
    this._cleanups.forEach(c => c())
    this.audio = null
    this.audioCtx = null
    this.analyser = null
    this.gainNode = null
    this.source = null
    this.eqFilters = []
    this._cleanups = []
    this._srcSetup = false
  }
}

export const audioEngine = new AudioEngine()
