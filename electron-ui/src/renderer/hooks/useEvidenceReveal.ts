import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../store'

/**
 * Turn a search hit's evidence hand-off into the props MessageList already
 * understands: one tick of `scrollToMessageIdx` plus a temporary
 * `highlightedMessageIdx` (rendered with the flash animation).
 *
 * The index comes from the store rather than a DOM query because MessageList is
 * virtualised — rows outside the window do not exist yet.
 */
export function useEvidenceReveal(currentSessionId: string | null) {
  const pending = useUiStore(s => s.pendingReveal)
  const [evidence, setEvidence] = useState<{ index: number; query: string } | null>(null)
  const [scrollIndex, setScrollIndex] = useState<number | undefined>(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!pending || pending.sessionId !== currentSessionId) return
    // Consuming flips `pending` to null, which re-runs this effect with nothing
    // to do. The frame and the timer therefore cannot be owned by this effect's
    // cleanup: that cleanup ran immediately after consuming and cancelled the
    // reveal before it was ever applied. They live in refs, cancelled on
    // unmount (or by the next reveal) instead.
    useUiStore.getState().consumeReveal()
    const { messageIndex, query } = pending
    if (timerRef.current) clearTimeout(timerRef.current)
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)

    // One frame later the transcript of a freshly opened session has rendered
    // and the virtualizer has item metadata to scroll against.
    setScrollIndex(undefined)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      setScrollIndex(messageIndex)
      setEvidence({ index: messageIndex, query })
    })
    // The row is the evidence unit — the same granularity in-session search
    // uses. One transcript entry can be several screens tall (tool calls and
    // prose share an assistant message), so centring it is as far as a
    // virtualised list can land; the outline identifies which entry.
    // `briefly` is deliberate: the outline is a locator, not a persistent state.
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setEvidence(null)
      setScrollIndex(undefined)
    }, 2600)
  }, [pending, currentSessionId])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
  }, [])

  return {
    evidenceIndex: evidence?.index,
    evidenceQuery: evidence?.query,
    scrollToEvidenceIndex: scrollIndex,
  }
}
