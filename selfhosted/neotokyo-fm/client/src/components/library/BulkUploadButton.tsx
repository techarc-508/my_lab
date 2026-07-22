import { useState, useRef, useCallback } from 'react'
import { FolderUp, Upload, Loader2, X } from 'lucide-react'
import { showToast } from '../ui/StreamToast'
import { walkDirectory, uploadFiles } from '../../utils/bulkUpload'

declare global {
  interface Window { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
}

const canShowDirectoryPicker = typeof window !== 'undefined' && !!window.showDirectoryPicker

interface UploadState {
  status: 'idle' | 'scanning' | 'uploading' | 'done'
  total: number
  current: number
  uploaded: number
}

export default function BulkUploadButton() {
  const [state, setState] = useState<UploadState>({ status: 'idle', total: 0, current: 0, uploaded: 0 })
  const dirInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)

  const runUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) { showToast('No audio files found', 'error'); return }
    abortRef.current = false
    setState({ status: 'uploading', total: files.length, current: 0, uploaded: 0 })
    const uploaded = await uploadFiles(files, (current, total) => {
      if (abortRef.current) return
      setState(prev => ({ ...prev, current, uploaded: current }))
    })
    setState({ status: 'done', total: files.length, current: files.length, uploaded })
    showToast(`Uploaded ${uploaded} of ${files.length} file(s)${uploaded < files.length ? ` (${files.length - uploaded} failed)` : ''}`, uploaded === files.length ? 'success' : 'info')
    setTimeout(() => setState({ status: 'idle', total: 0, current: 0, uploaded: 0 }), 3000)
  }, [])

  const handleDirectoryPicker = useCallback(async () => {
    try {
      const dirHandle = await window.showDirectoryPicker!()
      setState({ status: 'scanning', total: 0, current: 0, uploaded: 0 })
      const files = await walkDirectory(dirHandle)
      await runUpload(files)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      showToast(e?.message || 'Failed to read directory', 'error')
      setState({ status: 'idle', total: 0, current: 0, uploaded: 0 })
    }
  }, [runUpload])

  const handleDirInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files
    if (!inputFiles || inputFiles.length === 0) return
    const audioFiles = Array.from(inputFiles).filter(f => {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
      return ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma'].includes(ext)
    })
    await runUpload(audioFiles)
    e.target.value = ''
  }, [runUpload])

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files
    if (!inputFiles || inputFiles.length === 0) return
    const audioFiles = Array.from(inputFiles).filter(f => {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
      return ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma'].includes(ext)
    })
    await runUpload(audioFiles)
    e.target.value = ''
  }, [runUpload])

  const handleCancel = () => { abortRef.current = true }

  const isUploading = state.status === 'uploading' || state.status === 'scanning'
  const progressPct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0

  return (
    <div className="flex items-center gap-2">
      {/* Hidden inputs for fallback */}
      <input ref={dirInputRef} type="file" {...{webkitdirectory: ''} as React.InputHTMLAttributes<HTMLInputElement>} multiple accept="audio/*" className="hidden" onChange={handleDirInputChange} />
      <input ref={fileInputRef} type="file" multiple accept="audio/*" className="hidden" onChange={handleFileInputChange} />

      {isUploading ? (
        <div className="flex items-center gap-2">
          <div className="glass-card rounded-xl px-3 py-1.5 flex items-center gap-2">
            <Loader2 size={11} className="animate-spin text-pink-400" />
            <span className="text-[9px] text-content-secondary whitespace-nowrap">
              {state.status === 'scanning' ? 'Scanning...' : `${state.current}/${state.total}`}
            </span>
            <div className="w-16 h-1 bg-border-subtle rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
            <button onClick={handleCancel} className="text-error/60 hover:text-error transition-all ml-1">
              <X size={10} />
            </button>
          </div>
        </div>
      ) : (
        <>
          {canShowDirectoryPicker ? (
            <button onClick={handleDirectoryPicker}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-pink-500/10 border border-pink-400/30 text-pink-300 text-[9px] font-medium hover:bg-pink-500/20 transition-all">
              <FolderUp size={11} />
              <span className="hidden sm:inline">Import Folder</span>
              <span className="sm:hidden">Folder</span>
            </button>
          ) : (
            <>
              <button onClick={() => dirInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-pink-500/10 border border-pink-400/30 text-pink-300 text-[9px] font-medium hover:bg-pink-500/20 transition-all">
                <FolderUp size={11} />
                <span className="hidden sm:inline">Import Folder</span>
                <span className="sm:hidden">Folder</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-500/10 border border-purple-400/30 text-purple-300 text-[9px] font-medium hover:bg-purple-500/20 transition-all">
                <Upload size={11} />
                <span className="hidden sm:inline">Upload Files</span>
                <span className="sm:hidden">Files</span>
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
