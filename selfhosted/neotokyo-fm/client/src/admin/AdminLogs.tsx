import { useState, useEffect, useRef } from 'react'
import { getLogs, ensureCsrfToken } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { RefreshCw, FileText, Radio, Pause, Play, Trash2 } from 'lucide-react'
import { API_BASE } from '../config'

export default function AdminLogs() {
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(true)
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState('')
  const preRef = useRef<HTMLPreElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchInitial = async () => {
    try {
      const text = await getLogs(500)
      setLogs(text.split('\n').filter(Boolean))
    } catch { showToast('Failed to load logs', 'error') }
    setLoading(false)
  }

  useEffect(() => {
    ensureCsrfToken()
    fetchInitial()

    if (!live) return
    const es = new EventSource(`${API_BASE}/api/logs/stream`, { withCredentials: true })
    eventSourceRef.current = es
    es.onmessage = (e) => {
      if (paused) return
      try {
        const data = JSON.parse(e.data)
        if (data.text) {
          setLogs(prev => {
            const next = [...prev, data.text]
            return next.length > 1000 ? next.slice(-1000) : next
          })
        }
      } catch {}
    }
    es.onerror = () => {}
    return () => { es.close(); eventSourceRef.current = null }
  }, [live])

  useEffect(() => {
    if (!paused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, paused])

  const clearLogs = () => setLogs([])

  const displayLogs = filter
    ? logs.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
    : logs

  return (
    <div className="p-6" style={{ background: '#0A0A2E' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2"><FileText size={18} /> SERVER LOGS</h2>
        <div className="flex items-center gap-2">
          <input
            value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="w-32 px-2 py-1.5 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink transition-all"
          />
          <button onClick={clearLogs} className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-border-default text-content-tertiary text-[10px] font-body hover:text-error hover:border-error/40 transition-all">
            <Trash2 size={10} /> Clear
          </button>
          <button onClick={() => setPaused(p => !p)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-body transition-all ${
              paused ? 'bg-warning/20 border border-warning/30 text-warning' : 'border border-border-default text-content-tertiary hover:text-white'
            }`}>
            {paused ? <Play size={10} /> : <Pause size={10} />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <label className="flex items-center gap-1 text-[10px] font-body text-content-tertiary cursor-pointer">
            <input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} className="accent-hot-pink" />
            Live
          </label>
          <button onClick={fetchInitial} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-electric-blue/20 border border-electric-blue/30 text-electric-blue text-[10px] font-body hover:bg-electric-blue/30 transition-all">
            <RefreshCw size={10} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 text-[9px] font-body text-content-tertiary">
        <span className={`flex items-center gap-1 ${live && !paused ? 'text-success' : 'text-content-tertiary'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${live && !paused ? 'bg-success animate-pulse' : 'bg-content-tertiary'}`} />
          {live ? (paused ? 'Paused' : 'Streaming') : 'Off'}
        </span>
        <span>·</span>
        <span>{logs.length} lines</span>
        {filter && <span>· filtered: {displayLogs.length}</span>}
      </div>

      {loading ? (
        <p className="text-[11px] font-body text-content-tertiary">Loading logs...</p>
      ) : (
        <div className="bg-surface-sunken border border-border-default/50 rounded-lg relative">
          <pre ref={preRef} className="p-4 text-[10px] font-mono leading-5 max-h-[70vh] overflow-y-auto whitespace-pre-wrap text-content-primary/80">
            {displayLogs.map((line, i) => (
              <div key={i} className="hover:bg-white/[0.03]">
                {line}
              </div>
            ))}
            <div ref={bottomRef} />
          </pre>
          {displayLogs.length === 0 && (
            <p className="text-center text-[11px] font-body text-content-tertiary py-12">No log entries match filter.</p>
          )}
        </div>
      )}
    </div>
  )
}
