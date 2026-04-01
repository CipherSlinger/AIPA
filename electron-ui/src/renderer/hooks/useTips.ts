/**
 * useTips -- Hook that manages contextual tip display.
 * Shows a tip on the WelcomeScreen when conditions are met.
 */
import { useState, useEffect, useCallback } from 'react'
import { usePrefsStore } from '../store'
import { useSessionStore } from '../store'
import { pickTip, Tip } from './tipRegistry'

export function useTips() {
  const [currentTip, setCurrentTip] = useState<Tip | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Pick a tip on mount
  useEffect(() => {
    const prefs = usePrefsStore.getState().prefs
    const sessions = useSessionStore.getState().sessions
    const tipHistory = prefs.tipHistory || {}

    const tip = pickTip({
      messageCount: 0, // Welcome screen = 0 messages in current session
      sessionCount: sessions.length,
      tipHistory,
    })

    if (tip) {
      setCurrentTip(tip)
    }
  }, [])

  const dismissTip = useCallback(() => {
    if (!currentTip) return
    setDismissed(true)

    // Record the tip as shown
    const prefs = usePrefsStore.getState().prefs
    const tipHistory = { ...(prefs.tipHistory || {}), [currentTip.id]: Date.now() }
    usePrefsStore.getState().setPrefs({ tipHistory })
    window.electronAPI.prefsSet('tipHistory', tipHistory)
  }, [currentTip])

  const nextTip = useCallback(() => {
    if (currentTip) {
      // Mark current as shown
      const prefs = usePrefsStore.getState().prefs
      const tipHistory = { ...(prefs.tipHistory || {}), [currentTip.id]: Date.now() }
      usePrefsStore.getState().setPrefs({ tipHistory })
      window.electronAPI.prefsSet('tipHistory', tipHistory)

      // Pick another tip
      const sessions = useSessionStore.getState().sessions
      const newTip = pickTip({
        messageCount: 0,
        sessionCount: sessions.length,
        tipHistory,
      })
      setCurrentTip(newTip)
      setDismissed(false)
    }
  }, [currentTip])

  return {
    tip: dismissed ? null : currentTip,
    dismissTip,
    nextTip,
  }
}
