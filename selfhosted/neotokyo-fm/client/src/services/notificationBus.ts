type Listener = (event: { type: string; data: unknown }) => void
const listeners = new Set<Listener>()

export function onNotification(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitNotification(type: string, data: unknown) {
  listeners.forEach(fn => fn({ type, data }))
}
