import { API_BASE } from '../config'

class VideoService {
  private player: HTMLIFrameElement | null = null
  private pollingInterval: ReturnType<typeof setInterval> | null = null
  private syncEnabled = false

  getEmbedUrl(videoId: string, startTime?: number): string {
    const params = new URLSearchParams({
      autoplay: '1',
      enablejsapi: '1',
      rel: '0',
      modestbranding: '1',
    })
    if (startTime && startTime > 0) {
      params.set('start', String(Math.floor(startTime)))
    }
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
  }

  async resolveVideoId(trackName: string): Promise<{ videoId: string; thumbnail: string; title: string; duration: number } | null> {
    try {
      const res = await fetch(`${API_BASE}/api/yt-video/${encodeURIComponent(trackName)}`)
      if (!res.ok) return null
      const data = await res.json()
      if (data.error) return null
      return {
        videoId: data.videoId || data.video_id || '',
        thumbnail: data.thumbnail || '',
        title: data.title || '',
        duration: data.duration || 0,
      }
    } catch {
      return null
    }
  }

  createPlayer(videoId: string, container: HTMLElement): HTMLIFrameElement {
    this.destroyPlayer()
    const iframe = document.createElement('iframe')
    iframe.src = this.getEmbedUrl(videoId)
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; clipboard-write'
    iframe.allowFullscreen = true
    iframe.className = 'w-full aspect-video rounded-lg'
    container.appendChild(iframe)
    this.player = iframe
    return iframe
  }

  destroyPlayer() {
    this.stopSync()
    if (this.player) {
      this.player.remove()
      this.player = null
    }
  }

  pauseVideo() {
    this._postMessage('{"event":"command","func":"pauseVideo","args":""}')
  }

  playVideo() {
    this._postMessage('{"event":"command","func":"playVideo","args":""}')
  }

  seekTo(seconds: number) {
    this._postMessage(`{"event":"command","func":"seekTo","args":[${seconds},true]}`)
  }

  muteVideo() {
    this._postMessage('{"event":"command","func":"mute","args":""}')
  }

  unmuteVideo() {
    this._postMessage('{"event":"command","func":"unMute","args":""}')
  }

  setVolume(percent: number) {
    this._postMessage(`{"event":"command","func":"setVolume","args":[${Math.round(percent * 100)}]}`)
  }

  startSync(getAudioPosition: () => number) {
    this.syncEnabled = true
    this.stopSync()
    this.pollingInterval = setInterval(() => {
      if (!this.syncEnabled || !this.player) return
      const pos = getAudioPosition()
      if (pos > 0) {
        this.seekTo(pos)
      }
    }, 5000)
  }

  stopSync() {
    this.syncEnabled = false
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  toggleFullscreen() {
    if (this.player) {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        this.player.requestFullscreen()
      }
    }
  }

  async togglePiP() {
    if (!this.player) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if ((this.player as any).requestPictureInPicture) {
        await (this.player as any).requestPictureInPicture()
      }
    } catch {}
  }

  setMediaSessionMetadata(title: string, artist: string, thumbnail: string) {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      artwork: thumbnail ? [{ src: thumbnail, sizes: '480x360', type: 'image/jpeg' }] : [],
    })
  }

  private _postMessage(message: string) {
    this.player?.contentWindow?.postMessage(message, '*')
  }

  getPlayer(): HTMLIFrameElement | null {
    return this.player
  }
}

export const videoService = new VideoService()
