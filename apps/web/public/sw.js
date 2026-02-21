// PlanFlow Service Worker for Push Notifications (T6.8)
// This service worker handles push notifications when the browser is open
// or in the background

const CACHE_NAME = 'planflow-v1'

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing')
  // Skip waiting to activate immediately
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    })
  )
  // Take control of all pages immediately
  self.clients.claim()
})

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event)

  let data = {
    title: 'PlanFlow Notification',
    body: 'You have a new notification',
    icon: '/icons/notification.png',
    badge: '/icons/badge.png',
    data: {},
  }

  try {
    if (event.data) {
      const payload = event.data.json()
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        data: payload.data || {},
      }
    }
  } catch (e) {
    console.error('[SW] Error parsing push data:', e)
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.data.notificationId || 'planflow-notification',
    renotify: true,
    requireInteraction: false,
    vibrate: [100, 50, 100],
    data: data.data,
    actions: [
      {
        action: 'open',
        title: 'View',
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
      },
    ],
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// Notification click event - handle notification interactions
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action)

  event.notification.close()

  if (event.action === 'dismiss') {
    // Just close the notification
    return
  }

  // Default action or 'open' action - open the relevant URL
  const urlToOpen = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if we have a window already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Navigate existing window to the URL
          client.navigate(urlToOpen)
          return client.focus()
        }
      }
      // No window open - open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen)
      }
    })
  )
})

// Notification close event - track dismissed notifications
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag)
  // Could be used to track dismissed notifications via API if needed
})

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data)

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Periodic background sync for updating badge count (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-badge') {
    event.waitUntil(updateBadge())
  }
})

async function updateBadge() {
  try {
    // Could fetch unread count from API and update badge
    // navigator.setAppBadge(unreadCount)
  } catch (e) {
    console.error('[SW] Failed to update badge:', e)
  }
}
