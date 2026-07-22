type EventChannel = 'player' | 'lyrics' | 'queue' | 'admin' | 'telemetry' | 'audio' | 'social'

type Handler = (event: string, data?: unknown) => void

const channels = new Map<EventChannel, Map<string, Set<Handler>>>()
const allChannels = new Map<EventChannel, Set<Handler>>()

const VALID_CHANNELS: Set<string> = new Set(['player', 'lyrics', 'queue', 'admin', 'telemetry', 'audio', 'social'])

export function on(channel: EventChannel, event: string, handler: Handler): () => void {
  if (!channels.has(channel)) channels.set(channel, new Map())
  const events = channels.get(channel)!
  if (!events.has(event)) events.set(event, new Set())
  events.get(event)!.add(handler)
  return () => { events.get(event)?.delete(handler) }
}

export function onAny(channel: EventChannel, handler: Handler): () => void {
  if (!allChannels.has(channel)) allChannels.set(channel, new Set())
  allChannels.get(channel)!.add(handler)
  return () => { allChannels.get(channel)?.delete(handler) }
}

export function emit(channel: EventChannel, event: string, data?: unknown): void {
  const events = channels.get(channel)
  if (events) {
    const handlers = events.get(event)
    if (handlers) handlers.forEach(fn => fn(event, data))
  }
  const all = allChannels.get(channel)
  if (all) all.forEach(fn => fn(event, data))
}

export function clearChannel(channel: EventChannel): void {
  channels.delete(channel)
  allChannels.delete(channel)
}

export function clearAll(): void {
  channels.clear()
  allChannels.clear()
}
