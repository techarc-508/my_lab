export function CardSkeleton({ h = 'h-24' }: { h?: string }) {
  return <div className={`${h} bg-surface-card rounded-lg animate-pulse border border-border-subtle/50`} />
}

export function LineSkeleton({ w = 'w-full' }: { w?: string }) {
  return <div className={`h-3 ${w} bg-surface-card rounded animate-pulse`} />
}

export function PageSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-surface-card rounded" />
      <div className="h-4 w-32 bg-surface-card rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-surface-card rounded-lg" />)}
      </div>
      <div className="h-64 bg-surface-card rounded-lg" />
    </div>
  )
}
