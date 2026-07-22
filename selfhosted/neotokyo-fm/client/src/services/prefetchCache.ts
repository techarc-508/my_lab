const MAX_CACHE = 3

class PrefetchCache {
  private cache: Map<string, ArrayBuffer> = new Map()
  private inflight: Map<string, Promise<ArrayBuffer>> = new Map()

  prefetch(url: string): void {
    if (this.cache.has(url) || this.inflight.has(url)) return
    if (this.cache.size >= MAX_CACHE) {
      const first = this.cache.keys().next().value
      if (first) this.cache.delete(first)
    }
    const promise = fetch(url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.arrayBuffer()
    }).then(buf => {
      this.cache.set(url, buf)
      this.inflight.delete(url)
      return buf
    }).catch(e => {
      this.inflight.delete(url)
      throw e
    })
    this.inflight.set(url, promise)
  }

  get(url: string): ArrayBuffer | null {
    return this.cache.get(url) || null
  }

  has(url: string): boolean {
    return this.cache.has(url)
  }

  evict(url?: string): void {
    if (url) {
      this.cache.delete(url)
      this.inflight.delete(url)
    } else {
      this.cache.clear()
      this.inflight.clear()
    }
  }

  get size(): number {
    return this.cache.size
  }
}

export const prefetchCache = new PrefetchCache()
