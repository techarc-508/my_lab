const WS_RECONNECT_DELAY = 3000

type EventHandler = (data: any) => void

class SocketClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<EventHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _connected = false
  private _enabled = false

  get connected(): boolean { return this._connected }

  connect(token: string) {
    if (this._enabled) return
    this._enabled = true
    this._doConnect(token)
  }

  private _doConnect(token: string) {
    if (this.ws) return
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${location.host}/api/socket.io/?token=${token}`
    try {
      this.ws = new WebSocket(url)
      this.ws.onopen = () => { this._connected = true }
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          const name = msg[0] || ''
          const data = msg[1] || {}
          const set = this.handlers.get(name)
          if (set) set.forEach(fn => fn(data))
        } catch {}
      }
      this.ws.onclose = () => {
        this._connected = false
        this.ws = null
        if (this._enabled) {
          this.reconnectTimer = setTimeout(() => this._doConnect(token), WS_RECONNECT_DELAY)
        }
      }
      this.ws.onerror = () => { this.ws?.close() }
    } catch {
      this.reconnectTimer = setTimeout(() => this._doConnect(token), WS_RECONNECT_DELAY)
    }
  }

  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  disconnect() {
    this._enabled = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this._connected = false
  }
}

export const socketClient = new SocketClient()
