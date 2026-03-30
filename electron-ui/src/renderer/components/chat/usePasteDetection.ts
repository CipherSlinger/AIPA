import { useState, useRef, useEffect, useCallback } from 'react'
import { useUiStore } from '../../store'

interface UsePasteDetectionOptions {
  setInput: (updater: (prev: string) => string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  handleImagePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
}

const URL_REGEX = /https?:\/\/[^\s<>'"]+/i

/**
 * Manages URL paste detection, long-text paste detection, and quote reply state.
 */
export function usePasteDetection({
  setInput,
  textareaRef,
  handleImagePaste,
}: UsePasteDetectionOptions) {
  // URL paste detection
  const [pastedUrl, setPastedUrl] = useState<string | null>(null)
  const urlChipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Long text paste detection
  const [pastedLongText, setPastedLongText] = useState(false)
  const longTextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Quote reply
  const quotedText = useUiStore((s) => s.quotedText)
  const setQuotedText = useUiStore((s) => s.setQuotedText)
  const [pendingQuote, setPendingQuote] = useState<string | null>(null)

  // Consume quotedText from store into pendingQuote
  useEffect(() => {
    if (!quotedText) return
    setPendingQuote(quotedText)
    setQuotedText(null)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [quotedText, setQuotedText])

  // Handle text paste events (delegates image handling, then detects URL/long text)
  const handleTextPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      // Let useImagePaste handle image pastes first
      handleImagePaste(e)
      // Detect URL in pasted text
      const text = e.clipboardData.getData('text/plain')
      if (text) {
        const match = text.match(URL_REGEX)
        if (match) {
          setPastedUrl(match[0])
          // Auto-dismiss after 8 seconds
          if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
          urlChipTimerRef.current = setTimeout(() => setPastedUrl(null), 8000)
        }
        // Detect long text paste (>500 chars, no URL already shown)
        if (text.length > 500 && !match) {
          setPastedLongText(true)
          if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current)
          longTextTimerRef.current = setTimeout(
            () => setPastedLongText(false),
            12_000,
          )
        }
      }
    },
    [handleImagePaste],
  )

  // Handle URL quick action: prefix the action before the URL in input
  const handleUrlAction = useCallback(
    (action: string) => {
      if (!pastedUrl) return
      setInput((prev: string) => {
        const actionPrefix = `${action}: ${pastedUrl}\n`
        if (prev.includes(pastedUrl)) {
          return actionPrefix + prev.replace(pastedUrl, '').trim()
        }
        return actionPrefix + prev.trim()
      })
      setPastedUrl(null)
      if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
      textareaRef.current?.focus()
    },
    [pastedUrl, setInput, textareaRef],
  )

  // Handle long text quick action: prefix the action before the text in input
  const handleLongTextAction = useCallback(
    (action: string) => {
      setInput((prev: string) => {
        return `${action}:\n\n${prev}`
      })
      setPastedLongText(false)
      if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current)
      textareaRef.current?.focus()
    },
    [setInput, textareaRef],
  )

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
      if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current)
    }
  }, [])

  return {
    // URL paste
    pastedUrl,
    setPastedUrl,
    handleUrlAction,
    urlChipTimerRef,
    // Long text paste
    pastedLongText,
    setPastedLongText,
    handleLongTextAction,
    longTextTimerRef,
    // Quote
    pendingQuote,
    setPendingQuote,
    // Paste handler
    handleTextPaste,
  }
}
