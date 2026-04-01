import { usePrefsStore } from '../store'

/** Check if the current model should be routed to a non-Claude provider */
export async function resolveProvider(modelId: string | undefined): Promise<{ type: 'claude-cli' } | { type: 'provider'; providerId: string }> {
  if (!modelId) return { type: 'claude-cli' }
  try {
    const configs = await window.electronAPI.providerListConfigs()
    for (const config of configs as { id: string; type: string; models: { id: string }[]; enabled: boolean }[]) {
      if (!config.enabled) continue
      if (config.type === 'claude-cli') continue
      if (config.models.some(m => m.id === modelId)) {
        return { type: 'provider', providerId: config.id }
      }
    }
  } catch {
    // Fallback to Claude CLI if provider system is unavailable
  }
  return { type: 'claude-cli' }
}

export function sendCompletionNotification(title: string, summary: string) {
  if (document.hasFocus()) return  // Don't notify when window is focused
  if (usePrefsStore.getState().prefs.desktopNotifications === false) return

  // Use Electron native notification (click-to-focus) instead of Web Notification API
  try {
    window.electronAPI.windowShowNotification({
      title,
      body: summary.slice(0, 100),
    })
    // Also flash the taskbar icon to attract attention
    window.electronAPI.windowFlashFrame(true)
  } catch {
    // Fallback to Web Notification API if IPC fails
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted') {
      new Notification(title, { body: summary.slice(0, 100) })
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          new Notification(title, { body: summary.slice(0, 100) })
        }
      })
    }
  }
}

/** Play a subtle completion chime using Web Audio API */
export function playCompletionSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    // Two-tone chime: C5 then E5
    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, ctx.currentTime)       // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12) // E5
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
    osc.onended = () => ctx.close()
  } catch {
    // Audio not available (e.g., no audio output device)
  }
}

/** Get the currently active API key from pool or fallback to single key */
export function getActiveApiKey(): string {
  const prefs = usePrefsStore.getState().prefs
  const pool = prefs.apiKeyPool || []
  const enabledKeys = pool.filter(k => k.enabled && !k.exhausted)
  if (enabledKeys.length > 0) {
    // If activeApiKeyId is set and still valid, use it
    const active = prefs.activeApiKeyId ? enabledKeys.find(k => k.id === prefs.activeApiKeyId) : null
    return (active ?? enabledKeys[0]).apiKey
  }
  return prefs.apiKey || ''
}

/** Mark current active pool key as exhausted and switch to next */
export function rotateApiKey(): boolean {
  const prefs = usePrefsStore.getState().prefs
  const pool = prefs.apiKeyPool || []
  if (pool.length === 0) return false
  const enabledKeys = pool.filter(k => k.enabled && !k.exhausted)
  const currentId = prefs.activeApiKeyId
  const currentIdx = currentId ? enabledKeys.findIndex(k => k.id === currentId) : 0
  // Mark current as exhausted
  const updatedPool = pool.map(k =>
    k.id === (currentId ?? enabledKeys[0]?.id) ? { ...k, exhausted: true } : k
  )
  const remaining = updatedPool.filter(k => k.enabled && !k.exhausted)
  if (remaining.length === 0) {
    usePrefsStore.getState().setPrefs({ apiKeyPool: updatedPool, activeApiKeyId: undefined })
    window.electronAPI.prefsSet('apiKeyPool', updatedPool)
    return false
  }
  const nextKey = remaining[currentIdx < remaining.length ? currentIdx : 0]
  usePrefsStore.getState().setPrefs({ apiKeyPool: updatedPool, activeApiKeyId: nextKey.id })
  window.electronAPI.prefsSet('apiKeyPool', updatedPool)
  window.electronAPI.prefsSet('activeApiKeyId', nextKey.id)
  return true
}
