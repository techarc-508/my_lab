import { usePlayerStore } from '../stores/playerStore'
import { emit } from './eventBus'
import { trackPlayStart, trackFirstFrame, trackStallStart, trackStallEnd, trackError, trackBitrate, setActiveTrack, initTelemetry } from './trackTelemetry'
import { prefetchCache } from './prefetchCache'

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
  private _iosUnlockCleanup: (() => void) | null = null
  private _fadingOut = false
  private _fadeInterval: ReturnType<typeof setInterval> | null = null
  private _pauseTimeout: ReturnType<typeof setTimeout> | null = null
  private _skipTimeout: ReturnType<typeof setTimeout> | null = null
  private _wakeLock: any = null
  private _loudnessMultiplier = 1

  private async _requestWakeLock() {
    if ('wakeLock' in navigator && !this._wakeLock) {
      try { this._wakeLock = await (navigator as any).wakeLock.request('screen') } catch {}
    }
  }

  private _releaseWakeLock() {
    if (this._wakeLock) {
      this._wakeLock.release().catch(() => {})
      this._wakeLock = null
    }
  }

  private fadeTo(targetVolume: number, durationMs = 800) {
    if (!this.gainNode) return
    if (this._fadeInterval) clearInterval(this._fadeInterval)
    const effectiveTarget = targetVolume * this._loudnessMultiplier
    const startVol = this.gainNode.gain.value
    const steps = 16
    const stepTime = durationMs / steps
    const volStep = (effectiveTarget - startVol) / steps
    let currentStep = 0
    
    this._fadeInterval = setInterval(() => {
      currentStep++
      if (this.gainNode) {
        this.gainNode.gain.value = Math.max(0, Math.min(1, startVol + volStep * currentStep))
      }
      if (currentStep >= steps) {
        clearInterval(this._fadeInterval!)
        this._fadeInterval = null
        if (this.gainNode) this.gainNode.gain.value = effectiveTarget
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
      this._setupIOSUnlock()
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume()
    }
  }

  private _setupIOSUnlock() {
    if (this._iosUnlockCleanup) return
    const unlock = () => {
      if (this.audioCtx?.state === 'suspended') {
        this.audioCtx.resume().then(() => {
          this._iosUnlockCleanup?.()
          this._iosUnlockCleanup = null
        })
      } else {
        this._iosUnlockCleanup?.()
        this._iosUnlockCleanup = null
      }
    }
    document.addEventListener('touchstart', unlock, { once: true, passive: true })
    document.addEventListener('touchend', unlock, { once: true, passive: true })
    this._iosUnlockCleanup = () => {
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('touchend', unlock)
    }
    this._cleanups.push(() => {
      this._iosUnlockCleanup?.()
      this._iosUnlockCleanup = null
    })
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
    navigator.mediaSession.setActionHandler('seekto', (d) => {
      if (d.seekTime != null && this.audio) this.audio.currentTime = d.seekTime
    })
    navigator.mediaSession.setActionHandler('stop', () => {
      usePlayerStore.getState().setTrack(null)
      usePlayerStore.getState().setPlaying(false)
      this.pause()
    })
  }

  private updateMediaSession() {
    if (!('mediaSession' in navigator)) return
    const track = usePlayerStore.getState().currentTrack
    if (!track) return
    const artwork: MediaImage[] = []
    if (track.albumArt) {
      const sizes = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512']
      const ext = track.albumArt.match(/\.(jpe?g|png|webp)/i)?.[1]?.toLowerCase() || 'jpeg'
      const type = ext === 'jpg' ? 'jpeg' : ext
      artwork.push(...sizes.map(s => ({ src: track.albumArt!.replace(/\/cover\//, `/cover/${s.split('x')[0]}-`), sizes: s, type: `image/${type}` })))
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || '',
      artist: track.artist || '',
      album: (track as any).album || '',
      artwork,
    })
    this.updatePositionState()
  }

  private updatePositionState() {
    if (!('setPositionState' in navigator.mediaSession)) return
    const dur = this.audio?.duration
    if (!dur || !isFinite(dur) || dur <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: 1,
        position: this.audio!.currentTime,
      })
    } catch {}
  }

  init() {
    if (this.audio) return
    this.ensureContext()
    this.initEQ()
    this.setupMediaSession()
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.crossOrigin = 'anonymous'

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
      this.updatePositionState()
      
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
      emit('player', 'stop', { track: usePlayerStore.getState().currentTrack })
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
    const onPlay = () => {
      usePlayerStore.getState().setPlaying(true)
      emit('player', 'play', { track: usePlayerStore.getState().currentTrack })
      this._requestWakeLock()
      try {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
        const key = 'neotokyo-play-count'
        const plays = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1
        localStorage.setItem(key, JSON.stringify(plays))
      } catch {}
    }
    const onPause = () => {
      usePlayerStore.getState().setPlaying(false)
      emit('player', 'pause', { track: usePlayerStore.getState().currentTrack })
      this._releaseWakeLock()
      try {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
      } catch {}
    }
    const onError = () => {
      const errMsg = 'Audio playback error'
      trackError(errMsg)
      emit('player', 'error', { track: usePlayerStore.getState().currentTrack })
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
    this.audio.addEventListener('waiting', trackStallStart)
    this.audio.addEventListener('playing', trackStallEnd)
    this.audio.addEventListener('loadeddata', trackFirstFrame)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (this.audioCtx?.state === 'suspended') {
          this.audioCtx.resume()
        }
      } else if (document.visibilityState === 'hidden') {
        if (this.audio && !this.audio.paused) {
          const isMediaSessionControlled = 'mediaSession' in navigator && navigator.mediaSession.playbackState === 'playing'
          if (!isMediaSessionControlled) {
            this.pause()
          }
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    if (usePlayerStore.getState().isPlaying) this._requestWakeLock()

    this._cleanups.push(
      () => this.audio?.removeEventListener('timeupdate', onTime),
      () => this.audio?.removeEventListener('durationchange', onDur),
      () => this.audio?.removeEventListener('ended', onEnd),
      () => this.audio?.removeEventListener('play', onPlay),
      () => this.audio?.removeEventListener('pause', onPause),
      () => this.audio?.removeEventListener('error', onError),
      () => this.audio?.removeEventListener('waiting', trackStallStart),
      () => this.audio?.removeEventListener('playing', trackStallEnd),
      () => this.audio?.removeEventListener('loadeddata', trackFirstFrame),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => { if (this._wakeLock) this._wakeLock.release().catch(() => {}) },
    )
    const stopTelemetry = initTelemetry()
    this._cleanups.push(stopTelemetry)
    emit('audio', 'engine-ready')
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

  async playTrack(track: { url: string; source?: string }, startPosition?: number) {
    this.ensureAudio()
    this._fadingOut = false
    setActiveTrack(track)
    trackPlayStart()
    const prevUrl = this.audio!.src
    this.setupSrc(track.url)
    const { crossfade, isMuted, loudnessEnabled, loudnessMode } = usePlayerStore.getState()
    const durMs = crossfade * 1000
    if (this.gainNode) this.gainNode.gain.value = 0
    this.updateMediaSession()
    if (loudnessEnabled && track.source !== 'radio') {
      this._applyLoudnessNormalization(track.url, loudnessMode).catch(() => {})
    } else {
      this._loudnessMultiplier = 1
      usePlayerStore.getState().setCurrentLoudnessGain(0)
    }
    try {
      await this.audio!.play()
      if (startPosition && startPosition > 0) {
        this.audio!.currentTime = startPosition
      }
      const vol = isMuted ? 0 : usePlayerStore.getState().volume
      this.fadeTo(vol, durMs || 800)
    } catch (e) {
      if ((e as Error)?.name === 'NotAllowedError') {
        usePlayerStore.getState().setPlaying(false)
      }
    }
    this._prefetchNext()
  }

  private async _applyLoudnessNormalization(url: string, mode: 'track' | 'album') {
    try {
      const { API_BASE } = await import('../config')
      const encoded = encodeURIComponent(url)
      const res = await fetch(`${API_BASE}/api/gains/${encoded}`)
      if (!res.ok) {
        this._loudnessMultiplier = 1
        usePlayerStore.getState().setCurrentLoudnessGain(0)
        return
      }
      const data = await res.json()
      const gainDb = mode === 'album' && data.album_gain ? data.album_gain : data.track_gain
      if (typeof gainDb !== 'number') {
        this._loudnessMultiplier = 1
        usePlayerStore.getState().setCurrentLoudnessGain(0)
        return
      }
      const linearGain = Math.pow(10, gainDb / 20)
      this._loudnessMultiplier = linearGain
      usePlayerStore.getState().setCurrentLoudnessGain(gainDb)
    } catch {
      this._loudnessMultiplier = 1
      usePlayerStore.getState().setCurrentLoudnessGain(0)
    }
  }

  private _prefetchNext() {
    const { queue, currentTrack } = usePlayerStore.getState()
    if (!currentTrack || currentTrack.source === 'radio') return
    const idx = queue.findIndex(t => t.url === currentTrack.url)
    for (let i = 1; i <= 2; i++) {
      const next = queue[idx + i]
      if (next && next.source !== 'radio') {
        prefetchCache.prefetch(next.url)
        if (next.title) {
          import('../services/videoService').then(m => {
            m.videoService.resolveVideoId(next.title || '').catch(() => {})
          })
        }
      }
    }
  }

  pause() {
    this.audio?.pause()
    emit('player', 'pause', { track: usePlayerStore.getState().currentTrack })
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

  getAnalyser() {
    return this.analyser
  }

  getCurrentTime(): number {
    return this.audio?.currentTime || 0
  }

  getDuration(): number {
    return this.audio?.duration || 0
  }

  setVolume(v: number) {
    if (this.gainNode) this.fadeTo(v, 400)
    emit('player', 'volume', { volume: v })
  }

  seek(time: number) {
    if (this.audio) {
      this.audio.currentTime = time
      this._fadingOut = false
    }
  }

  destroy() {
    emit('audio', 'engine-destroy')
    this._iosUnlockCleanup?.()
    this._iosUnlockCleanup = null
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
