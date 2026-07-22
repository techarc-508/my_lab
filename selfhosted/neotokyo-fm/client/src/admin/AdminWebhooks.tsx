import { useState, useEffect } from 'react'
import { getWebhooks, saveWebhooks, testWebhook } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Plus, Trash2, Save, Send, Info, Globe } from 'lucide-react'
import type { Webhook } from '../types/audio'

export default function AdminWebhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [newUrl, setNewUrl] = useState('')
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => { try { setWebhooks(await getWebhooks()) } catch {} }

  const handleAdd = () => { if (!newUrl.trim()) return; setWebhooks(prev => [...prev, { url: newUrl, enabled: true, events: ['all'] }]); setNewUrl('') }
  const handleRemove = (idx: number) => setWebhooks(prev => prev.filter((_, i) => i !== idx))

  const handleSave = async () => { try { await saveWebhooks(webhooks); showToast('Webhooks saved', 'success') } catch { showToast('Save failed', 'error') } }

  const handleTest = async (url: string) => {
    try { const res = await testWebhook(url); showToast(res.ok ? `Webhook OK (${res.status})` : `Webhook failed (${res.status})`, res.ok ? 'success' : 'error') }
    catch { showToast('Test request failed', 'error') }
  }

  return (
    <div className="p-6 bg-surface-deep">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2"><Globe size={18} /> WEBHOOKS</h2>
          <button onClick={() => setShowGuide(!showGuide)} className="text-content-tertiary hover:text-electric-blue transition-all">
            <Info size={14} />
          </button>
        </div>
        <button onClick={handleSave} className="flex items-center gap-1 px-3 py-2 rounded-md bg-success/20 border border-success/30 text-success text-xs font-body hover:bg-success/30 transition-all">
          <Save size={14} /> Save
        </button>
      </div>

      {showGuide && (
        <div className="bg-surface-raised border border-electric-blue/20 rounded-lg p-4 mb-4 text-xs space-y-2">
          <h3 className="text-electric-blue font-display tracking-[2px] uppercase text-sm flex items-center gap-2"><Info size={14} /> Webhooks Guide</h3>
          <p className="text-content-secondary font-body text-[11px]">
            Webhooks let NEOTOKYO FM send HTTP POST requests to external services when events occur.
            Each webhook URL receives a JSON payload with event details.
          </p>
          <div className="text-content-secondary font-body text-[11px] space-y-1">
            <p className="text-content-tertiary font-bold mt-2">Events:</p>
            <p><span className="text-hot-pink">track.change</span> — When a new track starts playing</p>
            <p><span className="text-hot-pink">download.complete</span> — When a download finishes</p>
            <p><span className="text-hot-pink">batch.complete</span> — When all downloads in a batch finish</p>
            <p><span className="text-hot-pink">backup.created</span> — When an automatic backup is created</p>
            <p><span className="text-hot-pink">all</span> — Receive all events</p>
          </div>
          <div className="text-content-secondary font-body text-[11px] space-y-1 mt-2">
            <p className="text-content-tertiary font-bold">Example payload (track.change):</p>
            <pre className="bg-surface-sunken p-2 rounded text-[10px] font-mono overflow-x-auto border border-border-default/30">
{`{
  "event": "track.change",
  "title": "Song Title",
  "artist": "Artist Name",
  "timestamp": "2026-06-27T12:00:00Z"
}`}
            </pre>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input value={newUrl} onChange={e => setNewUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="https://hooks.example.com/..."
          className="flex-1 px-3 py-2.5 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
        <button onClick={handleAdd} className="px-3 py-2.5 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white hover:brightness-110 active:brightness-90 transition-all shadow-glow-pink-sm">
          <Plus size={14} />
        </button>
      </div>
      <div className="space-y-1">
        {webhooks.map((w, i) => (
          <div key={i} className="flex items-center gap-2 text-xs p-3 rounded-md bg-surface-raised/30 border border-border-default/20 hover:border-hot-pink/20 transition-all">
            <span className="flex-1 truncate font-mono text-[10px] text-content-primary">{w.url}</span>
            <button onClick={() => handleTest(w.url)} className="text-electric-blue/40 hover:text-electric-blue transition-all"><Send size={12} /></button>
            <button onClick={() => handleRemove(i)} className="text-error/40 hover:text-error transition-all"><Trash2 size={12} /></button>
          </div>
        ))}
        {webhooks.length === 0 && <p className="text-xs font-body text-content-tertiary">No webhooks configured. Click the <Info size={10} className="inline" /> icon for help.</p>}
      </div>
    </div>
  )
}
