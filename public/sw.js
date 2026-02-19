// FORTUNA ENGINE — Service Worker v1
// Provides: offline caching, push notifications, background sync

const CACHE_NAME = 'fortuna-v10-cache'
const OFFLINE_URL = '/offline.html'

// Assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
]

// ─── Install ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS)
    }).then(() => self.skipWaiting())
  )
})

// ─── Activate ───────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

// ─── Fetch — Network first, cache fallback ──────────────────────────────────

self.addEventListener('fetch', (event) => {
  // Skip non-GET and API calls
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('/api/')) return
  if (event.request.url.includes('coingecko.com')) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone)
          })
        }
        return response
      })
      .catch(() => {
        // Serve from cache when offline
        return caches.match(event.request).then(cached => {
          return cached || caches.match(OFFLINE_URL)
        })
      })
  )
})

// ─── Push Notifications ─────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = { title: 'Fortuna Alert', body: 'You have a new financial alert.', icon: '/icons/icon-192.png', tag: 'fortuna-alert' }
  
  if (event.data) {
    try {
      const payload = event.data.json()
      data = { ...data, ...payload }
    } catch {
      data.body = event.data.text()
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: data.tag || 'fortuna-alert',
      vibrate: [200, 100, 200],
      data: data,
      actions: [
        { action: 'open', title: 'View in Fortuna' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  if (event.action === 'dismiss') return
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing window or open new
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      return self.clients.openWindow('/')
    })
  )
})

// ─── Background Sync (for offline estimated tax payments, etc.) ─────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'fortuna-sync-data') {
    event.waitUntil(syncData())
  }
})

async function syncData() {
  // Future: sync offline changes to cloud when back online
  console.log('[Fortuna SW] Background sync triggered')
}
