import { useState, useEffect } from 'react'
import { getAnalyticsOverview } from '../services/grabberAPI'
import { BarChart3, Music, User, Activity } from 'lucide-react'

export default function AdminAnalytics() {
  const [data, setData] = useState<{
    top_tracks: { title: string; artist: string; play_count: number }[]
    top_artists: { artist: string; play_count: number }[]
    plays_24h: number
    total_plays: number
  } | null>(null)

  useEffect(() => {
    getAnalyticsOverview().then(setData).catch(() => {})
  }, [])

  if (!data) return <div className="p-6 text-[11px] text-content-tertiary">Loading analytics...</div>

  return (
    <div className="p-6 space-y-4 bg-surface-deep">
      <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2">
        <BarChart3 size={18} /> ANALYTICS
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-hot-pink" />
            <span className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px]">Plays (24h)</span>
          </div>
          <p className="text-2xl font-display text-white">{data.plays_24h}</p>
        </div>
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-electric-blue" />
            <span className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px]">Total Plays</span>
          </div>
          <p className="text-2xl font-display text-white">{data.total_plays}</p>
        </div>
      </div>

      <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
        <h3 className="text-[10px] font-display tracking-[2px] text-hot-pink uppercase mb-2 flex items-center gap-1.5"><Music size={12} /> Top Tracks</h3>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {data.top_tracks.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] font-body py-1.5 border-b border-border-default/20 last:border-0">
              <span className="text-content-tertiary w-5 font-mono text-[10px]">{i + 1}</span>
              <span className="flex-1 truncate text-content-primary">{t.title}</span>
              <span className="text-content-tertiary truncate max-w-[120px]">{t.artist}</span>
              <span className="text-hot-pink/60 font-mono text-[11px]">{t.play_count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4">
        <h3 className="text-[10px] font-display tracking-[2px] text-electric-blue uppercase mb-2 flex items-center gap-1.5"><User size={12} /> Top Artists</h3>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {data.top_artists.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] font-body py-1.5 border-b border-border-default/20 last:border-0">
              <span className="text-content-tertiary w-5 font-mono text-[10px]">{i + 1}</span>
              <span className="flex-1 truncate text-content-primary">{a.artist || 'Unknown'}</span>
              <span className="text-hot-pink/60 font-mono text-[11px]">{a.play_count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
