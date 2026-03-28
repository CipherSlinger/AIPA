import { useEffect, useRef } from 'react'

/**
 * useFocusTrap — traps keyboard focus within a container element.
 * When active, Tab/Shift+Tab cycle through focusable elements within the container.
 * Focus is moved to the first focusable element on mount.
 * Previous focus is restored on unmount.
 */
export function useFocusTrap(active: boolean = true) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    // Save current focus to restore later
    previousFocusRef.current = document.activeElement as HTMLElement

    const container = containerRef.current
    if (!container) return

    const getFocusableElements = (): HTMLElement[] => {
      const selector = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ')
      return Array.from(container.querySelectorAll<HTMLElement>(selector))
    }

    // Focus first focusable element
    const focusable = getFocusableElements()
    if (focusable.length > 0) {
      // Prefer input/textarea for search-style modals
      const inputEl = focusable.find(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      ;(inputEl || focusable[0]).focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const elements = getFocusableElements()
      if (elements.length === 0) return

      const first = elements[0]
      const last = elements[elements.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      // Restore previous focus
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus()
      }
    }
  }, [active])

  return containerRef
}
