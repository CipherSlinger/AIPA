import { useState, useRef, useEffect, useCallback } from 'react'
import { useUiStore } from '../../store'
import { detectContentType, PasteContentType } from './chatInputConstants'

interface UsePasteDetectionOptions {
  setInput: (updater: (prev: string) => string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  handleImagePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
}

const URL_REGEX = /https?:\/\/[^\s<>'"]+/i

/**
 * Manages paste detection with content type classification (Iteration 463).
 * Detects code, URL, long-text, and image pastes with type-specific actions.
 */
export function usePasteDetection({
  setInput,
  textareaRef,
  handleImagePaste,
}: UsePasteDetectionOptions) {
  // URL paste detection (legacy, kept for backward compat)
  const [pastedUrl, setPastedUrl] = useState<string | null>(null)
  const urlChipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Long text paste detection (legacy, kept for backward compat)
  const [pastedLongText, setPastedLongText] = useState(false)
  const longTextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Unified content type detection (Iteration 463)
  const [pastedContentType, setPastedContentType] = useState<PasteContentType | null>(null)
  const [pastedText, setPastedText] = useState<string | null>(null)
  const contentTypeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Handle text paste events (delegates image handling, then detects content type)
  const handleTextPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      // Let useImagePaste handle image pastes first
      handleImagePaste(e)
      // Detect content type in pasted text
      const text = e.clipboardData.getData('text/plain')
      if (text) {
        const contentType = detectContentType(text)

        // Set unified content type state
        setPastedContentType(contentType !== 'short-text' ? contentType : null)
        setPastedText(contentType !== 'short-text' ? text : null)

        // Auto-dismiss after 10 seconds
        if (contentTypeTimerRef.current) clearTimeout(contentTypeTimerRef.current)
        if (contentType !== 'short-text') {
          contentTypeTimerRef.current = setTimeout(() => {
            setPastedContentType(null)
            setPastedText(null)
          }, 10000)
        }

        // Also set legacy states for backward compat
        const match = text.match(URL_REGEX)
        if (match) {
          setPastedUrl(match[0])
          if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
          urlChipTimerRef.current = setTimeout(() => setPastedUrl(null), 8000)
        }
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
      setPastedContentType(null)
      setPastedText(null)
      if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
      if (contentTypeTimerRef.current) clearTimeout(contentTypeTimerRef.current)
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
      setPastedContentType(null)
      setPastedText(null)
      if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current)
      if (contentTypeTimerRef.current) clearTimeout(contentTypeTimerRef.current)
      textareaRef.current?.focus()
    },
    [setInput, textareaRef],
  )

  // Handle typed paste action (Iteration 463)
  const handleTypedAction = useCallback(
    (prompt: string) => {
      setInput(() => prompt)
      setPastedContentType(null)
      setPastedText(null)
      if (contentTypeTimerRef.current) clearTimeout(contentTypeTimerRef.current)
      // Also clear legacy states
      setPastedUrl(null)
      setPastedLongText(false)
      if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
      if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current)
      textareaRef.current?.focus()
    },
    [setInput, textareaRef],
  )

  // Clear paste state (e.g., after sending a message)
  const clearPasteState = useCallback(() => {
    setPastedContentType(null)
    setPastedText(null)
    setPastedUrl(null)
    setPastedLongText(false)
    if (contentTypeTimerRef.current) clearTimeout(contentTypeTimerRef.current)
    if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
    if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current)
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
      if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current)
      if (contentTypeTimerRef.current) clearTimeout(contentTypeTimerRef.current)
    }
  }, [])

  return {
    // Unified content type (Iteration 463)
    pastedContentType,
    pastedText,
    handleTypedAction,
    clearPasteState,
    // URL paste (legacy compat)
    pastedUrl,
    setPastedUrl,
    handleUrlAction,
    urlChipTimerRef,
    // Long text paste (legacy compat)
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
