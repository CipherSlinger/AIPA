import { useEffect, RefObject } from 'react'

/**
 * Hook to close a dropdown/popup when clicking outside of its container.
 * Attaches a mousedown listener that calls `onClose` when the click target
 * is outside the provided ref element (and any `extraRefs`, e.g. a menu
 * portaled into document.body).
 */
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  isOpen: boolean,
  onClose: () => void,
  extraRefs: RefObject<HTMLElement>[] = []
) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const inside = [ref, ...extraRefs].some(r => r.current?.contains(target))
      if (ref.current && !inside) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose, ref, ...extraRefs])
}
