import { useEffect, RefObject } from 'react'

/**
 * Hook to close a dropdown/popup when clicking outside of its container.
 * Attaches a mousedown listener that calls `onClose` when the click target
 * is outside the provided ref element.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  isOpen: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose, ref])
}
