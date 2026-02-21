'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Register service worker for push notifications
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Wait for window load to avoid blocking initial render
      window.addEventListener('load', async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          })
          console.log('[SW] Service Worker registered:', registration.scope)

          // Check for updates periodically
          setInterval(() => {
            registration.update()
          }, 60 * 60 * 1000) // Check every hour

          // Handle updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (
                  newWorker.state === 'installed' &&
                  navigator.serviceWorker.controller
                ) {
                  // New version available
                  console.log('[SW] New service worker available')
                  // Could show a toast here to prompt user to refresh
                }
              })
            }
          })
        } catch (error) {
          console.error('[SW] Service Worker registration failed:', error)
        }
      })
    }
  }, [])

  return null
}
