import type { Download } from '../../types/audio'

export default function DownloadProgress({ download }: { download: Download }) {
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/50',
    running: 'bg-cyan-400',
    processing: 'bg-blue-400',
    completed: 'bg-green-400',
    failed: 'bg-red-400',
  }
  return (
    <div className="flex items-center gap-3 p-2 rounded bg-[#1d1e31]/50">
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate">{download.title || download.filename}</p>
        <div className="h-1.5 bg-[#2a2a4a] rounded mt-1 overflow-hidden">
          <div className={`h-full rounded transition-all ${statusColors[download.status] || 'bg-cyan-400'}`}
            style={{ width: `${download.progress}%` }} />
        </div>
        <p className="text-[10px] text-[#5c3f45] mt-0.5">{download.status}</p>
      </div>
      {download.status === 'failed' && <span className="text-red-400 text-xs" title={download.error || ''}>!</span>}
    </div>
  )
}
