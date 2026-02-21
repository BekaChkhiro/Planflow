'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './use-auth'

type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

interface UsePushNotificationsReturn {
  // State
  isSupported: boolean
  permission: PushPermissionState
  isSubscribed: boolean
  isLoading: boolean
  error: string | null

  // Actions
  requestPermission: () => Promise<boolean>
  subscribe: () => Promise<boolean>
  unsubscribe: () => Promise<boolean>
  sendTestNotification: () => Promise<boolean>
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

export function usePushNotifications(): UsePushNotificationsReturn {
  const { getToken, isAuthenticated } = useAuth()
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<PushPermissionState>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check if push notifications are supported
  useEffect(() => {
    const checkSupport = () => {
      const supported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window

      setIsSupported(supported)

      if (supported) {
        setPermission(Notification.permission as PushPermissionState)
      } else {
        setPermission('unsupported')
      }
    }

    checkSupport()
  }, [])

  // Check subscription status on mount
  useEffect(() => {
    const checkSubscription = async () => {
      if (!isSupported || !isAuthenticated) {
        setIsLoading(false)
        return
      }

      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        setIsSubscribed(!!subscription)
      } catch (e) {
        console.error('Failed to check push subscription:', e)
      } finally {
        setIsLoading(false)
      }
    }

    checkSubscription()
  }, [isSupported, isAuthenticated])

  // Register service worker
  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) {
      return null
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      })
      console.log('[Push] Service Worker registered:', registration.scope)
      return registration
    } catch (e) {
      console.error('[Push] Service Worker registration failed:', e)
      return null
    }
  }, [])

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Push notifications are not supported in this browser')
      return false
    }

    try {
      setIsLoading(true)
      setError(null)

      const result = await Notification.requestPermission()
      setPermission(result as PushPermissionState)

      if (result === 'granted') {
        // Register service worker if permission granted
        await registerServiceWorker()
        return true
      } else if (result === 'denied') {
        setError('Notification permission was denied')
        return false
      }

      return false
    } catch (e) {
      console.error('[Push] Permission request failed:', e)
      setError('Failed to request notification permission')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, registerServiceWorker])

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    const token = await getTokenRef.current()

    if (!isSupported || !token) {
      setError('Push notifications are not available')
      return false
    }

    if (permission !== 'granted') {
      const granted = await requestPermission()
      if (!granted) return false
    }

    try {
      setIsLoading(true)
      setError(null)

      // Get VAPID public key from server
      const keyResponse = await fetch(`${API_URL}/notifications/push/vapid-public-key`)
      const keyData = await keyResponse.json()

      if (!keyData.success || !keyData.data?.publicKey) {
        setError('Push notifications are not configured on the server')
        return false
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready

      // Subscribe to push manager
      const applicationServerKey = urlBase64ToUint8Array(keyData.data.publicKey)
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      })

      // Send subscription to server
      const subscribeResponse = await fetch(`${API_URL}/notifications/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
        }),
      })

      const subscribeData = await subscribeResponse.json()

      if (!subscribeData.success) {
        setError(subscribeData.error || 'Failed to subscribe to push notifications')
        return false
      }

      setIsSubscribed(true)
      return true
    } catch (e) {
      console.error('[Push] Subscribe failed:', e)
      setError('Failed to subscribe to push notifications')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, permission, requestPermission])

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    const token = await getTokenRef.current()

    if (!isSupported || !token) {
      return false
    }

    try {
      setIsLoading(true)
      setError(null)

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        setIsSubscribed(false)
        return true
      }

      // Unsubscribe from push manager
      await subscription.unsubscribe()

      // Notify server
      await fetch(`${API_URL}/notifications/push/subscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
        }),
      })

      setIsSubscribed(false)
      return true
    } catch (e) {
      console.error('[Push] Unsubscribe failed:', e)
      setError('Failed to unsubscribe from push notifications')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  // Send test notification
  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    const token = await getTokenRef.current()

    if (!token) {
      setError('You must be logged in to send test notifications')
      return false
    }

    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/notifications/push/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!data.success) {
        setError(data.error || 'Failed to send test notification')
        return false
      }

      if (data.data.sent === 0) {
        setError('No active subscriptions found. Please enable push notifications first.')
        return false
      }

      return true
    } catch (e) {
      console.error('[Push] Test notification failed:', e)
      setError('Failed to send test notification')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTestNotification,
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
