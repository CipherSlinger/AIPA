import { useState, useCallback, useRef } from 'react'

export type VimModeState = 'insert' | 'normal'

interface UseVimModeOptions {
  enabled: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  setInput: (val: string | ((prev: string) => string)) => void
}

function getLineInfo(text: string, cursor: number): { lineStart: number; lineEnd: number } {
  const before = text.slice(0, cursor)
  const after = text.slice(cursor)
  const lineStart = before.lastIndexOf('\n') + 1
  const lineEndInAfter = after.indexOf('\n')
  const lineEnd = lineEndInAfter === -1 ? text.length : cursor + lineEndInAfter
  return { lineStart, lineEnd }
}

function nextWordStart(text: string, cursor: number): number {
  let i = cursor
  if (i < text.length && /\S/.test(text[i])) {
    while (i < text.length && /\S/.test(text[i])) i++
  }
  while (i < text.length && /\s/.test(text[i])) i++
  return i
}

function prevWordStart(text: string, cursor: number): number {
  let i = cursor - 1
  while (i > 0 && /\s/.test(text[i])) i--
  while (i > 0 && /\S/.test(text[i - 1])) i--
  return Math.max(0, i)
}

export function useVimMode({ enabled, textareaRef, setInput }: UseVimModeOptions) {
  const [mode, setMode] = useState<VimModeState>('insert')
  const pendingDRef = useRef(false)

  const setCursor = (pos: number) => {
    const ta = textareaRef.current
    if (!ta) return
    requestAnimationFrame(() => {
      ta.selectionStart = pos
      ta.selectionEnd = pos
    })
  }

  const handleNormalKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!enabled || mode === 'insert') return false
    const ta = textareaRef.current
    if (!ta) return false
    const text = ta.value
    const cursor = ta.selectionStart

    // Pass Ctrl/Meta combos through to browser
    if (e.ctrlKey || e.metaKey) return false

    switch (e.key) {
      case 'i':
        e.preventDefault()
        setMode('insert')
        return true
      case 'a':
        e.preventDefault()
        setMode('insert')
        setCursor(Math.min(cursor + 1, text.length))
        return true
      case 'I': {
        e.preventDefault()
        setMode('insert')
        const { lineStart } = getLineInfo(text, cursor)
        setCursor(lineStart)
        return true
      }
      case 'A': {
        e.preventDefault()
        setMode('insert')
        const { lineEnd } = getLineInfo(text, cursor)
        setCursor(lineEnd)
        return true
      }
      case 'Escape':
        e.preventDefault()
        return true
      case 'h':
        e.preventDefault()
        setCursor(Math.max(0, cursor - 1))
        return true
      case 'l':
        e.preventDefault()
        setCursor(Math.min(text.length, cursor + 1))
        return true
      case 'k': {
        e.preventDefault()
        const before = text.slice(0, cursor)
        const prevNewline = before.lastIndexOf('\n')
        if (prevNewline < 0) { setCursor(0); return true }
        const col = cursor - prevNewline - 1
        const lineBeforePrev = before.slice(0, prevNewline)
        const prevPrevNl = lineBeforePrev.lastIndexOf('\n')
        const prevLineStart = prevPrevNl + 1
        const prevLineLen = prevNewline - prevLineStart
        setCursor(prevLineStart + Math.min(col, prevLineLen))
        return true
      }
      case 'j': {
        e.preventDefault()
        const nextNl = text.indexOf('\n', cursor)
        if (nextNl < 0) { setCursor(text.length); return true }
        const lineOfCursor = text.slice(0, cursor).lastIndexOf('\n')
        const col = cursor - lineOfCursor - 1
        const nextLineStart = nextNl + 1
        const nextNextNl = text.indexOf('\n', nextLineStart)
        const nextLineLen = nextNextNl === -1 ? text.length - nextLineStart : nextNextNl - nextLineStart
        setCursor(nextLineStart + Math.min(col, nextLineLen))
        return true
      }
      case '0': {
        e.preventDefault()
        const { lineStart } = getLineInfo(text, cursor)
        setCursor(lineStart)
        return true
      }
      case '$': {
        e.preventDefault()
        const { lineEnd } = getLineInfo(text, cursor)
        setCursor(lineEnd)
        return true
      }
      case 'w':
        e.preventDefault()
        setCursor(nextWordStart(text, cursor))
        return true
      case 'b':
        e.preventDefault()
        setCursor(prevWordStart(text, cursor))
        return true
      case 'x': {
        e.preventDefault()
        if (cursor < text.length && text[cursor] !== '\n') {
          setInput(text.slice(0, cursor) + text.slice(cursor + 1))
          setCursor(cursor)
        }
        return true
      }
      case 'u': {
        e.preventDefault()
        document.execCommand('undo')
        return true
      }
      case 'd': {
        e.preventDefault()
        if (pendingDRef.current) {
          pendingDRef.current = false
          const { lineStart, lineEnd } = getLineInfo(text, cursor)
          const start = lineStart > 0 ? lineStart - 1 : 0
          const end = lineEnd < text.length ? lineEnd + 1 : lineEnd
          const newText = text.slice(0, start) + text.slice(end)
          setInput(newText)
          setCursor(Math.min(start, newText.length))
        } else {
          pendingDRef.current = true
          setTimeout(() => { pendingDRef.current = false }, 800)
        }
        return true
      }
      default:
        // Swallow other keys in normal mode
        e.preventDefault()
        return true
    }
  }, [enabled, mode, textareaRef, setInput])

  const wrapKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    originalHandler: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  ) => {
    if (!enabled) { originalHandler(e); return }
    if (mode === 'normal') {
      const handled = handleNormalKeyDown(e)
      if (!handled) originalHandler(e)
    } else {
      // Insert mode: intercept Escape to enter normal mode
      if (e.key === 'Escape' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        setMode('normal')
        e.preventDefault()
        return
      }
      originalHandler(e)
    }
  }, [enabled, mode, handleNormalKeyDown])

  const reset = useCallback(() => setMode('insert'), [])

  return { mode, wrapKeyDown, reset }
}
