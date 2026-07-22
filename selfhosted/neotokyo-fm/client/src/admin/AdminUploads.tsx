import { useState, useRef, useCallback, useEffect } from 'react'
import { expandPlaylist, previewDownloads, startDownload, uploadLocalFile, getCsrfToken } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import { Upload, Link, ListMusic, Play, FileAudio, X, Loader2 } from 'lucide-react'
import { API_BASE } from '../config'

interface UploadMeta { title: string; artist: string; album: string; genre: string }

export default function AdminUploads() {
  const [url, setUrl] = useState('')
  const [files, setFiles] = useState<{ url: string; filename?: string }[]>([])
  const [duplicates, setDuplicates] = useState('replace')
  const [localFiles, setLocalFiles] = useState<{ file: File; meta: UploadMeta }[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [expanding, setExpanding] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const dropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {}, [])

  const handleExpand = async () => {
    if (!url.trim()) return
    setExpanding(true); setError('')
    try {
      const data = await expandPlaylist(url)
      if (data.error) { setError(data.error); return }
      setFiles(prev => [...prev, ...data.files.map((f: any) => ({ url: f.url, filename: f.filename || f.title || f.url }))])
      showToast(`Found ${data.count} tracks`, 'success')
    } catch (e: any) { const msg = e?.message || 'Failed'; setError(msg); showToast(msg, 'error') }
    setExpanding(false)
  }

  const handlePreview = async () => {
    if (files.length === 0) return
    try { const data = await previewDownloads(files); showToast(`${data.count} files, ${formatSize(data.total_size)}`, 'info') }
    catch { showToast('Preview failed', 'error') }
  }

  const handleStart = async () => {
    if (files.length === 0) return
    setStarting(true); setError('')
    try {
      const res = await startDownload(files, duplicates)
      showToast(`Started ${res.count || files.length} download(s)`, 'success')
      setFiles([])
    } catch (e: any) { const msg = e?.message || 'Failed'; setError(msg); showToast(msg, 'error') }
    setStarting(false)
  }

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|flac|m4a|ogg|wav|opus|webm)$/i))
    if (dropped.length === 0) { showToast('No audio files found', 'error'); return }
    setLocalFiles(prev => [...prev, ...dropped.map(f => ({ file: f, meta: { title: f.name.replace(/\.[^.]+$/, ''), artist: '', album: '', genre: '' } }))])
  }, [])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    if (picked.length === 0) return
    setLocalFiles(prev => [...prev, ...picked.map(f => ({ file: f, meta: { title: f.name.replace(/\.[^.]+$/, ''), artist: '', album: '', genre: '' } }))])
  }

  const removeLocal = (idx: number) => setLocalFiles(prev => prev.filter((_, i) => i !== idx))
  const updateMeta = (idx: number, field: keyof UploadMeta, value: string) => setLocalFiles(prev => prev.map((item, i) => i === idx ? { ...item, meta: { ...item.meta, [field]: value } } : item))

  const uploadAll = async () => {
    if (localFiles.length === 0) return
    setUploading(true)
    setUploadProgress(0)
    setUploadTotal(localFiles.length)
    let ok = 0, fail = 0
    for (let i = 0; i < localFiles.length; i++) {
      const item = localFiles[i]
      try {
        // Use XHR for upload progress
        const result = await uploadWithProgress(item.file, (pct) => {
          setUploadProgress(Math.round(((i + pct / 100) / localFiles.length) * 100))
        })
        if (result) ok++; else fail++
      } catch { fail++ }
      setUploadProgress(Math.round(((i + 1) / localFiles.length) * 100))
    }
    setUploading(false)
    setUploadProgress(0)
    if (fail === 0) { showToast(`Uploaded ${ok} file(s)`, 'success'); setLocalFiles([]) }
    else { showToast(`${ok} uploaded, ${fail} failed`, 'error') }
  }

  const uploadWithProgress = (file: File, onProgress: (pct: number) => void): Promise<boolean> => {
    return new Promise((resolve) => {
      const formData = new FormData()
      formData.append('file', file)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/api/upload/local`)
      xhr.setRequestHeader('X-CSRF-Token', getCsrfToken() || '')
      xhr.withCredentials = true
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total * 100)
      }
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
      xhr.onerror = () => resolve(false)
      xhr.send(formData)
    })
  }

  return (
    <div className="p-6 bg-surface-deep">
      <h2 className="text-xl font-display tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-hot-pink to-purple mb-5 flex items-center gap-2"><Upload size={18} /> UPLOADS</h2>

      <div className="flex gap-2 mb-4">
        <input value={url} onChange={e => { setUrl(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && handleExpand()}
          placeholder="Paste YouTube / SoundCloud or any music URL..."
          className="flex-1 px-3 py-2.5 bg-surface-sunken border border-border-default rounded-md text-xs font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-hot-pink focus:shadow-glow-pink-sm transition-all" />
        <button onClick={handleExpand} disabled={expanding}
          className="px-3 py-2.5 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white hover:brightness-110 active:brightness-90 disabled:opacity-35 transition-all shadow-glow-pink-sm">
          {expanding ? <Loader2 size={14} className="animate-spin" /> : <ListMusic size={14} />}
        </button>
      </div>
      {error && <p className="text-[10px] font-body text-error mb-3 bg-error/10 border border-error/20 rounded px-2 py-1">{error}</p>}

      <div className="flex items-center gap-2 mb-4">
        <label className="text-[10px] font-body text-content-tertiary">Duplicates:</label>
        <select value={duplicates} onChange={e => setDuplicates(e.target.value)}
          className="px-2.5 py-1.5 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary focus:outline-none focus:border-hot-pink">
          <option value="replace">Replace</option>
          <option value="skip">Skip</option>
          <option value="rename">Rename</option>
        </select>
      </div>

      {files.length > 0 && (
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-body text-content-tertiary">{files.length} files (URL)</span>
            <div className="flex gap-2">
              <button onClick={handlePreview} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-purple/20 border border-purple/30 text-purple text-[10px] font-body hover:bg-purple/30 transition-all">
                <Play size={10} /> Preview
              </button>
              <button onClick={handleStart} disabled={starting} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-success/20 border border-success/30 text-success text-[10px] font-body hover:bg-success/30 disabled:opacity-35 transition-all">
                {starting ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />} {starting ? 'Starting...' : 'Start'}
              </button>
            </div>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] font-body py-1.5 border-b border-border-default/20 last:border-0">
                <Link size={10} className="text-content-tertiary shrink-0" />
                <span className="flex-1 truncate text-content-primary">{f.filename}</span>
                <button onClick={() => removeFile(i)} className="text-error/40 hover:text-error transition-all">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border-default/30 my-6" />

      <h3 className="text-xs font-display tracking-[2px] text-purple mb-3 flex items-center gap-2 uppercase">
        <FileAudio size={14} /> Local Files
      </h3>

      <div ref={dropRef} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center mb-4 transition-all cursor-pointer ${
          dragging ? 'border-hot-pink bg-hot-pink/10 shadow-glow-pink-sm' : 'border-border-default hover:border-purple/50'
        }`}
        onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" multiple accept="audio/*,.mp3,.flac,.m4a,.ogg,.wav,.opus,.webm" onChange={handleFilePick} className="hidden" />
        <Upload size={24} className="mx-auto mb-2 text-content-tertiary" />
        <p className="text-xs font-body text-content-tertiary">Drop audio files here or click to browse</p>
        <p className="text-[10px] font-body text-content-tertiary mt-1">MP3, FLAC, M4A, OGG, WAV, OPUS</p>
      </div>

      {uploading && uploadTotal > 0 && (
        <div className="mb-4 bg-surface-raised border border-border-default/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-body text-content-tertiary flex items-center gap-2">
              <Loader2 size={10} className="animate-spin" /> Uploading...
            </span>
            <span className="text-[9px] font-body text-content-tertiary">{uploadProgress}%</span>
          </div>
          <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-hot-pink to-purple rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {localFiles.length > 0 && (
        <div className="bg-surface-raised border border-border-default/30 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-body text-content-tertiary">{localFiles.length} file(s)</span>
            <button onClick={uploadAll} disabled={uploading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-success/20 border border-success/30 text-success text-xs font-body hover:bg-success/30 disabled:opacity-35 transition-all">
              <Upload size={12} /> {uploading ? 'Uploading...' : 'Upload All'}
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {localFiles.map((item, i) => (
              <div key={i} className="bg-surface-sunken/50 border border-border-default/20 rounded-md p-2">
                <div className="flex items-center gap-2 mb-1">
                  <FileAudio size={12} className="text-purple/60 shrink-0" />
                  <span className="text-[10px] font-body flex-1 truncate font-mono text-content-primary">{item.file.name}</span>
                  <span className="text-[9px] font-body text-content-tertiary">{formatSize(item.file.size)}</span>
                  <button onClick={() => removeLocal(i)} className="text-error/40 hover:text-error transition-all"><X size={12} /></button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <input placeholder="Title" value={item.meta.title} onChange={e => updateMeta(i, 'title', e.target.value)}
                    className="px-1.5 py-1 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-purple transition-all" />
                  <input placeholder="Artist" value={item.meta.artist} onChange={e => updateMeta(i, 'artist', e.target.value)}
                    className="px-1.5 py-1 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-purple transition-all" />
                  <input placeholder="Album" value={item.meta.album} onChange={e => updateMeta(i, 'album', e.target.value)}
                    className="px-1.5 py-1 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-purple transition-all" />
                  <input placeholder="Genre" value={item.meta.genre} onChange={e => updateMeta(i, 'genre', e.target.value)}
                    className="px-1.5 py-1 bg-surface-sunken border border-border-default rounded-md text-[10px] font-body text-content-primary placeholder:text-content-tertiary/50 focus:outline-none focus:border-purple transition-all" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}
