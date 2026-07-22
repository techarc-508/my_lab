import { useEffect, useState, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { videoService } from '../services/videoService'

export function useVideoMode() {
  const videoMode = usePlayerStore(s => s.videoMode)
  const currentTrack = usePlayerStore(s => s.currentTrack)
  const isPlaying = usePlayerStore(s => s.isPlaying)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const lastResolvedTrack = useRef<string>('')
  const prevVideoMode = useRef(false)
  const lastSyncTime = useRef(0)

  // Resolve video ID when track changes or video mode is enabled
  useEffect(() => {
    if (!videoMode || !currentTrack) {
      if (prevVideoMode.current && !videoMode) {
        videoService.destroyPlayer()
        usePlayerStore.getState().clearVideo()
        setLoading(false)
        setError(false)
      }
      prevVideoMode.current = videoMode
      return
    }

    const trackKey = currentTrack.url
    if (lastResolvedTrack.current === trackKey) return

    lastResolvedTrack.current = ''
    setLoading(true)
    setError(false)

    const resolve = async () => {
      const trackName = currentTrack.title || currentTrack.url.split('/').pop() || ''
      const result = await videoService.resolveVideoId(trackName)
      const state = usePlayerStore.getState()
      if (state.videoMode && state.currentTrack?.url === trackKey) {
        if (result?.videoId) {
          state.setCurrentVideo(result.videoId, result.thumbnail, result.title)
          lastResolvedTrack.current = trackKey
        } else {
          setError(true)
          lastResolvedTrack.current = trackKey
        }
        setLoading(false)
      }
    }
    resolve()
  }, [videoMode, currentTrack])

  // Sync play/pause state
  useEffect(() => {
    if (!videoMode) return
    if (isPlaying) {
      videoService.playVideo()
    } else {
      videoService.pauseVideo()
    }
  }, [isPlaying, videoMode])

  // Detect user seek (large time jumps) and sync video position
  useEffect(() => {
    if (!videoMode) return
    const prev = lastSyncTime.current
    const curr = usePlayerStore.getState().currentTime
    const jump = Math.abs(curr - prev)
    if (jump > 3) {
      videoService.seekTo(curr)
    }
    lastSyncTime.current = curr
  })

  // Start sync polling
  useEffect(() => {
    if (!videoMode || !isPlaying) {
      videoService.stopSync()
      return
    }
    videoService.startSync(() => usePlayerStore.getState().currentTime)
    return () => videoService.stopSync()
  }, [videoMode, isPlaying])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      videoService.destroyPlayer()
    }
  }, [])

  return {
    videoId: usePlayerStore(s => s.currentVideoId),
    thumbnail: usePlayerStore(s => s.videoThumbnail),
    loading,
    error,
  }
}
