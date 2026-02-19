/**
 * FORTUNA ENGINE — PWA Registration & Push Notifications
 * 
 * Handles:
 *   - Service worker registration
 *   - Push notification permission requests
 *   - Local notification scheduling (for tax deadlines)
 *   - Install prompt management
 */

export interface NotificationPayload {
  title: string
  body: string
  tag?: string
  icon?: string
  data?: Record<string, any>
}

// ─── Service Worker Registration ────────────────────────────────────────────

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[Fortuna PWA] Service workers not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    console.log('[Fortuna PWA] Service worker registered:', registration.scope)

    // Check for updates periodically
    setInterval(() => registration.update(), 60 * 60 * 1000) // hourly

    return registration
  } catch (err) {
    console.error('[Fortuna PWA] Registration failed:', err)
    return null
  }
}

// ─── Push Notification Permission ───────────────────────────────────────────

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('[Fortuna PWA] Notifications not supported')
    return 'denied'
  }

  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'

  const permission = await Notification.requestPermission()
  return permission
}

export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

// ─── Local Notifications (no server needed) ─────────────────────────────────

export async function showLocalNotification(payload: NotificationPayload): Promise<boolean> {
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  
  await registration.showNotification(payload.title, {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: payload.tag || `fortuna-${Date.now()}`,
    vibrate: [200, 100, 200],
    data: payload.data,
  })

  return true
}

// ─── Scheduled Notification Engine ──────────────────────────────────────────

const SCHEDULE_KEY = 'fortuna:notification-schedule'

interface ScheduledNotification {
  id: string
  payload: NotificationPayload
  scheduledAt: string  // ISO datetime
  fired: boolean
}

export function scheduleNotification(payload: NotificationPayload, date: Date): string {
  const schedule = getSchedule()
  const id = 'notif_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4)
  
  schedule.push({
    id,
    payload,
    scheduledAt: date.toISOString(),
    fired: false,
  })

  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule))
  return id
}

export function cancelNotification(id: string) {
  const schedule = getSchedule().filter(n => n.id !== id)
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule))
}

export function getSchedule(): ScheduledNotification[] {
  try {
    return JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '[]')
  } catch { return [] }
}

// Check and fire due notifications (call this on app load and periodically)
export async function checkScheduledNotifications() {
  const now = new Date()
  const schedule = getSchedule()
  let changed = false

  for (const notif of schedule) {
    if (notif.fired) continue
    const scheduled = new Date(notif.scheduledAt)
    if (now >= scheduled) {
      await showLocalNotification(notif.payload)
      notif.fired = true
      changed = true
    }
  }

  if (changed) {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule))
  }
}

// ─── Install Prompt Management ──────────────────────────────────────────────

let deferredPrompt: any = null

export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault()
    deferredPrompt = e
  })
}

export function canShowInstallPrompt(): boolean {
  return !!deferredPrompt
}

export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) return false
  
  deferredPrompt.prompt()
  const result = await deferredPrompt.userChoice
  deferredPrompt = null
  return result.outcome === 'accepted'
}

export function isPWAInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
}

// ─── PWA Status Summary ─────────────────────────────────────────────────────

export function getPWAStatus(): {
  serviceWorkerSupported: boolean
  serviceWorkerRegistered: boolean
  notificationSupported: boolean
  notificationPermission: NotificationPermission
  isInstalled: boolean
  canInstall: boolean
  scheduledNotifications: number
} {
  return {
    serviceWorkerSupported: 'serviceWorker' in navigator,
    serviceWorkerRegistered: !!navigator.serviceWorker?.controller,
    notificationSupported: 'Notification' in window,
    notificationPermission: getNotificationPermission(),
    isInstalled: isPWAInstalled(),
    canInstall: canShowInstallPrompt(),
    scheduledNotifications: getSchedule().filter(n => !n.fired).length,
  }
}
