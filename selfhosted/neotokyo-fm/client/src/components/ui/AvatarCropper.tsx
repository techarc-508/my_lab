import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ZoomIn, ZoomOut, Crop } from 'lucide-react'

interface Props {
  open: boolean
  file: File | null
  onCrop: (blob: Blob) => void
  onCancel: () => void
}

const CROP_SIZE = 128
const PREVIEW_SIZE = 280
const CROP_RADIUS = PREVIEW_SIZE / 2
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

export default function AvatarCropper({ open, file, onCrop, onCancel }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 })
  const [processing, setProcessing] = useState(false)
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const previewRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget
    setImgNatural({ w: el.naturalWidth, h: el.naturalHeight })
    imgRef.current = el
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setOffsetStart({ ...offset })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [offset])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    setOffset({ x: offsetStart.x + dx, y: offsetStart.y + dy })
  }, [dragging, dragStart, offsetStart])

  const handlePointerUp = useCallback(() => {
    setDragging(false)
  }, [])

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  const handleCrop = useCallback(async () => {
    if (!imgRef.current || processing) return
    setProcessing(true)

    const img = imgRef.current
    const canvas = document.createElement('canvas')
    canvas.width = CROP_SIZE
    canvas.height = CROP_SIZE
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Calculate what region of the original image maps to the crop circle
    // The preview shows the image scaled to fit PREVIEW_SIZE with zoom applied
    const imgAspect = img.naturalWidth / img.naturalHeight
    let drawW: number, drawH: number
    if (imgAspect >= 1) {
      drawH = PREVIEW_SIZE * zoom
      drawW = drawH * imgAspect
    } else {
      drawW = PREVIEW_SIZE * zoom
      drawH = drawW / imgAspect
    }

    // The crop circle center is at (PREVIEW_SIZE/2, PREVIEW_SIZE/2) in preview space
    // Image top-left in preview space: ((PREVIEW_SIZE - drawW)/2 + offset.x, (PREVIEW_SIZE - drawH)/2 + offset.y)
    const imgPreviewX = (PREVIEW_SIZE - drawW) / 2 + offset.x
    const imgPreviewY = (PREVIEW_SIZE - drawH) / 2 + offset.y

    // Crop center in preview: (CROP_RADIUS, CROP_RADIUS)
    // Corresponding position in source image:
    const srcX = ((CROP_RADIUS - imgPreviewX) / drawW) * img.naturalWidth
    const srcY = ((CROP_RADIUS - imgPreviewY) / drawH) * img.naturalHeight
    const srcSize = (PREVIEW_SIZE / drawW) * img.naturalWidth

    ctx.beginPath()
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, srcX - srcSize / 2, srcY - srcSize / 2, srcSize, srcSize, 0, 0, CROP_SIZE, CROP_SIZE)

    canvas.toBlob((blob) => {
      if (blob) onCrop(blob)
      setProcessing(false)
    }, 'image/png')
  }, [offset, zoom, processing, onCrop])

  if (!open || !file) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={onCancel}>
      <div className="glass-card rounded-lg p-6 w-[340px] space-y-4 shadow-glow-combo" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crop size={16} className="text-hot-pink" />
            <h3 className="text-sm font-display tracking-[1px] text-content-primary">Crop Avatar</h3>
          </div>
          <button onClick={onCancel} className="text-content-tertiary hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Preview area */}
        <div
          ref={previewRef}
          className="relative mx-auto overflow-hidden select-none"
          style={{
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.1)',
            cursor: dragging ? 'grabbing' : 'grab',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {imgSrc && (
            <img
              src={imgSrc}
              alt="Crop preview"
              className="absolute pointer-events-none"
              onLoad={onImgLoad}
              draggable={false}
              style={{
                top: '50%',
                left: '50%',
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                maxWidth: 'none',
                width: imgNatural.w >= imgNatural.h ? PREVIEW_SIZE : undefined,
                height: imgNatural.h > imgNatural.w ? PREVIEW_SIZE : undefined,
              }}
            />
          )}
          {/* Circle overlay border */}
          <div className="absolute inset-0 rounded-full pointer-events-none" style={{
            boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.3)',
          }} />
        </div>

        <p className="text-[10px] text-content-tertiary text-center">Drag to reposition</p>

        {/* Zoom controls */}
        <div className="flex items-center gap-3">
          <button onClick={() => setZoom(z => clampZoom(z - ZOOM_STEP))}
            className="p-1.5 rounded bg-surface-sunken text-content-tertiary hover:text-white transition-colors">
            <ZoomOut size={14} />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            className="flex-1 h-1 appearance-none bg-border-default rounded-full accent-hot-pink cursor-pointer"
          />
          <button onClick={() => setZoom(z => clampZoom(z + ZOOM_STEP))}
            className="p-1.5 rounded bg-surface-sunken text-content-tertiary hover:text-white transition-colors">
            <ZoomIn size={14} />
          </button>
          <span className="text-[10px] text-content-tertiary w-8 text-right">{zoom.toFixed(1)}x</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button onClick={handleCrop} disabled={processing}
            className="flex-1 py-2 rounded bg-gradient-to-r from-hot-pink to-purple text-white text-xs font-body tracking-[1px] uppercase hover:brightness-110 transition-all disabled:opacity-50">
            {processing ? 'Saving...' : 'Crop & Save'}
          </button>
          <button onClick={onCancel}
            className="px-4 py-2 text-xs text-content-tertiary hover:text-white transition-all">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
