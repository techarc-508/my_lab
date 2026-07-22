import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', variant = 'danger', onConfirm, onCancel }: Props) {
  if (!open) return null
  const isDanger = variant === 'danger'
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-surface-raised border border-border-default/50 rounded-lg p-6 w-80 space-y-4 shadow-glow-combo" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDanger ? 'bg-error/20' : 'bg-warning/20'}`}>
            <AlertTriangle size={18} className={isDanger ? 'text-error' : 'text-warning'} />
          </div>
          <h3 className={`text-sm font-display tracking-[1px] ${isDanger ? 'text-error' : 'text-warning'}`}>{title}</h3>
        </div>
        <p className="text-xs text-content-secondary leading-relaxed">{message}</p>
        <div className="flex items-center gap-2 pt-2">
          <button onClick={onConfirm} className={`flex-1 py-2 rounded-md text-white text-xs tracking-[1px] uppercase hover:brightness-110 active:brightness-90 transition-all ${isDanger ? 'bg-error shadow-glow-error' : 'bg-warning text-black'}`}>
            {confirmLabel}
          </button>
          <button onClick={onCancel} className="px-4 py-2 text-xs text-content-tertiary hover:text-white transition-all">{cancelLabel}</button>
        </div>
      </div>
    </div>
  )
}
