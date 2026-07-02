export default function ScanlineOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.03]"
      style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)',
        backgroundSize: '100% 4px',
      }}
    />
  )
}
