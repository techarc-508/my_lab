import { useState, useEffect, useRef } from 'react'
import { getRadioStations, saveRadioStations, restoreDefaultStations, testRadioStation } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Plus, Trash2, Save, RotateCcw, Radio, GripVertical, Wifi, WifiOff } from 'lucide-react'
import type { RadioStation } from '../types/audio'

export default function AdminRadio() {
  const [stations, setStations] = useState<RadioStation[]>([])
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newGenre, setNewGenre] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const dragItem = useRef<number | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<Record<string, 'ok' | 'fail'>>({})

  useEffect(() => { load() }, [])

  const load = async () => { try { setStations(await getRadioStations()) } catch { showToast('Failed to load stations', 'error') } }

  const handleAdd = () => {
    if (!newName.trim() || !newUrl.trim()) return
    setStations(prev => [...prev, { id: String(Date.now()), name: newName, url: newUrl, genre: newGenre || 'Other' }])
    setNewName(''); setNewUrl(''); setNewGenre('')
  }

  const handleRemove = (id: string) => setStations(prev => prev.filter(s => s.id !== id))

  const handleSave = async () => { try { await saveRadioStations(stations); showToast('Stations saved', 'success') } catch { showToast('Save failed', 'error') } }

  const handleRestore = async () => { try { await restoreDefaultStations(); load(); showToast('Defaults restored', 'success') } catch { showToast('Restore failed', 'error') } }

  const handleDragStart = (idx: number) => {
    dragItem.current = idx
    setDragIdx(idx)
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragIdx(idx)
  }

  const handleDrop = (targetIdx: number) => {
    const from = dragItem.current
    if (from === null || from === targetIdx) { setDragIdx(null); dragItem.current = null; return }
    setStations(prev => {
      const q = [...prev]
      const [moved] = q.splice(from, 1)
      q.splice(targetIdx, 0, moved)
      return q
    })
    setDragIdx(null)
    dragItem.current = null
  }

  const handleDragEnd = () => {
    setDragIdx(null)
    dragItem.current = null
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    const s = stations.find(x => x.id === id)
    if (!s) { setTestingId(null); return }
    try {
      const res = await testRadioStation(s.url)
      setTestStatus(prev => ({ ...prev, [id]: (res as any)?.icy_name !== undefined ? 'ok' : 'fail' }))
    } catch {
      setTestStatus(prev => ({ ...prev, [id]: 'fail' }))
    }
    setTestingId(null)
  }

  return (
    <div className="p-6 bg-surface-deep">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple flex items-center gap-2"><Radio size={18} /> RADIO STATIONS</h2>
        <div className="flex gap-2">
          <button onClick={handleRestore} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-warning/20 border border-warning/30 text-warning text-[10px] font-body hover:bg-warning/30 transition-all">
            <RotateCcw size={10} /> Defaults
          </button>
          <button onClick={handleSave} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-success/20 border border-success/30 text-success text-[10px] font-body hover:bg-success/30 transition-all">
            <Save size={10} /> Save
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name"
          className="flex-1 px-3 py-2.5 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
        <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="URL"
          className="flex-[2] px-3 py-2.5 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
        <input value={newGenre} onChange={e => setNewGenre(e.target.value)} placeholder="Genre"
          className="w-28 px-3 py-2.5 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
        <button onClick={handleAdd} className="px-3 py-2.5 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white hover:brightness-110 active:brightness-90 transition-all shadow-glow-pink-sm">
          <Plus size={14} />
        </button>
      </div>

      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {stations.map((s, i) => (
          <div
            key={s.id}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-2 text-xs p-3 rounded-md border transition-all ${
              dragIdx === i
                ? 'border-brand/30 bg-brand/5'
                : 'border-border-default/20 bg-surface-raised/30 hover:border-hot-pink/20'
            }`}
          >
            <span className="cursor-grab active:cursor-grabbing text-content-tertiary shrink-0">
              <GripVertical size={12} />
            </span>
            <span className="w-36 truncate font-body text-content-primary font-medium">{s.name}</span>
            <span className="flex-1 truncate text-content-tertiary font-mono text-[10px]">{s.url}</span>
            <span className="w-20 text-[10px] font-body text-purple/60">{s.genre}</span>
            <button onClick={() => handleTest(s.id)} disabled={testingId === s.id}
              className={`transition-all ${testStatus[s.id] === 'ok' ? 'text-success' : testStatus[s.id] === 'fail' ? 'text-error' : 'text-content-tertiary/40 hover:text-brand'}`}
              title="Test connectivity">
              {testingId === s.id ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> :
               testStatus[s.id] === 'ok' ? <Wifi size={12} /> : <WifiOff size={12} />}
            </button>
            <button onClick={() => handleRemove(s.id)} className="text-error/40 hover:text-error transition-all"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
