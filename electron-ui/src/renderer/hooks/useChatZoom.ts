import { useState, useEffect, useCallback } from 'react'

/**
 * Manages chat zoom level (Ctrl+= / Ctrl+- / Ctrl+0).
 * Range: 70% to 150%, step: 10%.
 */
export function useChatZoom() {
  const [chatZoom, setChatZoom] = useState(100)

  const zoomIn = useCallback(() => {
    setChatZoom(z => Math.min(z + 10, 150))
  }, [])

  const zoomOut = useCallback(() => {
    setChatZoom(z => Math.max(z - 10, 70))
  }, [])

  const resetZoom = useCallback(() => {
    setChatZoom(100)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomIn()
      }
      if (e.ctrlKey && !e.shiftKey && e.key === '-') {
        e.preventDefault()
        zoomOut()
      }
      if (e.ctrlKey && !e.shiftKey && e.key === '0') {
        e.preventDefault()
        resetZoom()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [zoomIn, zoomOut, resetZoom])

  return { chatZoom, resetZoom }
}
