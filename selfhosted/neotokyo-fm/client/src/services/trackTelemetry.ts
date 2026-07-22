import { emit } from './eventBus'

interface TelemetryEvent {
  session_id: string
  event_type: string
  value: number
  metadata: Record<string, unknown>
  client_ts: string
}

const SESSION_ID = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
const FLUSH_INTERVAL = 30000
const FLUSH_THRESHOLD = 10

let buffer: TelemetryEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let firstTimeUpdate = false
let stallStart: number | null = null
let activeTrack: { url?: string; source?: string } | null = null
let connType: string = '4g'

if ('connection' in navigator) {
  const conn = (navigator as any).connection
  connType = conn.effectiveType || '4g'
  conn.addEventListener('change', () => { connType = conn.effectiveType || '4g' })
}

function push(evt: TelemetryEvent) {
  buffer.push(evt)
  emit('telemetry', 'beacon', evt)
  if (buffer.length >= FLUSH_THRESHOLD) flush()
}

function flush() {
  if (buffer.length === 0) return
  const payload = buffer
  buffer = []
  try {
    navigator.sendBeacon('/api/telemetry', JSON.stringify(payload))
  } catch {}
}

function start() {
  if (flushTimer) return
  flushTimer = setInterval(flush, FLUSH_INTERVAL)
  document.addEventListener('visibilitychange', onVisibility)
}

function stop() {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  document.removeEventListener('visibilitychange', onVisibility)
}

function onVisibility() {
  if (document.visibilityState === 'hidden') flush()
}

export function trackPlayStart() {
  firstTimeUpdate = false
  push({
    session_id: SESSION_ID,
    event_type: 'ttff',
    value: Date.now(),
    metadata: { track: activeTrack?.url, source: activeTrack?.source, conn_type: connType },
    client_ts: new Date().toISOString(),
  })
}

export function trackFirstFrame() {
  if (firstTimeUpdate) return
  firstTimeUpdate = true
  const ttff = Date.now() - (buffer.find(e => e.event_type === 'ttff')?.value || Date.now())
  push({
    session_id: SESSION_ID,
    event_type: 'ttff',
    value: ttff,
    metadata: { track: activeTrack?.url, source: activeTrack?.source, conn_type: connType },
    client_ts: new Date().toISOString(),
  })
}

export function trackStallStart() {
  if (stallStart !== null) return
  stallStart = Date.now()
}

export function trackStallEnd() {
  if (stallStart === null) return
  const dur = Date.now() - stallStart
  stallStart = null
  push({
    session_id: SESSION_ID,
    event_type: 'stall',
    value: dur,
    metadata: { track: activeTrack?.url, source: activeTrack?.source, conn_type: connType },
    client_ts: new Date().toISOString(),
  })
}

export function trackError(errorMsg: string) {
  push({
    session_id: SESSION_ID,
    event_type: 'error',
    value: 1,
    metadata: { track: activeTrack?.url, source: activeTrack?.source, error: errorMsg, conn_type: connType },
    client_ts: new Date().toISOString(),
  })
}

export function trackBitrate(kbps: number) {
  push({
    session_id: SESSION_ID,
    event_type: 'bitrate',
    value: kbps,
    metadata: { track: activeTrack?.url, source: activeTrack?.source, conn_type: connType },
    client_ts: new Date().toISOString(),
  })
}

export function setActiveTrack(track: { url?: string; source?: string } | null) {
  activeTrack = track
}

export function initTelemetry() {
  start()
  return stop
}
