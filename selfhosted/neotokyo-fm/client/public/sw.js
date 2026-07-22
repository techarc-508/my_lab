const CACHE_NAME = 'neotokyo-v1'
const VIDEO_CACHE = 'neotokyo-video-thumbs'
const STATIC_ASSETS = ['/', '/index.html']

function openPlayDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('neotokyo-offline-plays', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('play-queue')) {
        db.createObjectStore('play-queue', { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Cache YouTube thumbnails
  if (url.hostname === 'i.ytimg.com' || url.pathname.includes('/vi/')) {
    event.respondWith(cacheFirst(request, VIDEO_CACHE))
    return
  }

  // API routes: network first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request))
    return
  }

  // Static assets: cache first
  event.respondWith(cacheFirst(request, CACHE_NAME))
})

async function networkFirst(request) {
  try {
    const res = await fetch(request)
    const cache = await caches.open(CACHE_NAME)
    cache.put(request, res.clone())
    return res
  } catch {
    return caches.match(request)
  }
}

async function cacheFirst(request, cacheName = CACHE_NAME) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const res = await fetch(request)
    if (res.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, res.clone())
    }
    return res
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== VIDEO_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// --- Background Sync ---

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-plays') {
    event.waitUntil(syncPlays())
  }
  if (event.tag === 'sync-queue') {
    event.waitUntil(syncQueue())
  }
})

async function syncPlays() {
  const db = await openPlayDB()
  const tx = db.transaction('play-queue', 'readwrite')
  const store = tx.objectStore('play-queue')
  const items = await new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  for (const item of items) {
    try {
      await fetch('/api/play/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      store.delete(item.id)
    } catch (e) {
      console.error('Sync failed:', e)
    }
  }
}

async function syncQueue() {
  const db = await openPlayDB()
  const tx = db.transaction('play-queue', 'readwrite')
  const store = tx.objectStore('play-queue')
  const items = await new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  for (const item of items) {
    if (item.type !== 'queue') continue
    try {
      await fetch('/api/queue/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      store.delete(item.id)
    } catch (e) {
      console.error('Queue sync failed:', e)
    }
  }
}

// --- Offline play event caching ---

self.addEventListener('message', (event) => {
  if (event.data?.type === 'cache-play-event') {
    event.waitUntil(
      openPlayDB().then((db) => {
        const tx = db.transaction('play-queue', 'readwrite')
        tx.objectStore('play-queue').add(event.data.payload)
      })
    )
  }

  // Clear video thumbnail cache
  if (event.data?.type === 'clear-video-cache') {
    event.waitUntil(caches.delete(VIDEO_CACHE))
  }
})
