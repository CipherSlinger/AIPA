import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Copy, MessageSquareQuote, StickyNote, Check, Languages, Lightbulb } from 'lucide-react'
import { useUiStore, usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import { Note } from '../../types/app.types'

interface SelectionToolbarProps {
  /** The container element to watch for text selections */
  containerRef: React.RefObject<HTMLElement>
  /** Whether the message is from the user (different quote behavior) */
  isUser?: boolean
}

/**
 * Floating toolbar that appears when the user selects text inside a message bubble.
 * Provides Copy, Quote Reply, and Save to Notes actions for the selected text.
 */
export default function SelectionToolbar({ containerRef, isUser = false }: SelectionToolbarProps) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const setQuotedText = useUiStore(s => s.setQuotedText)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [selectedText, setSelectedText] = useState('')
  const [copied, setCopied] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      // Delay hiding slightly to allow clicking toolbar buttons
      hideTimeoutRef.current = setTimeout(() => setVisible(false), 200)
      return
    }

    // Check if selection is within our container
    const container = containerRef.current
    if (!container) return

    const range = selection.getRangeAt(0)
    const commonAncestor = range.commonAncestorContainer
    const node = commonAncestor.nodeType === Node.ELEMENT_NODE
      ? commonAncestor as Element
      : commonAncestor.parentElement

    if (!node || !container.contains(node)) {
      hideTimeoutRef.current = setTimeout(() => setVisible(false), 200)
      return
    }

    // Don't show toolbar if selection is inside a textarea (e.g. editing mode)
    if (node.closest('textarea') || node.closest('input')) return

    const text = selection.toString().trim()
    if (!text) return

    // Position the toolbar above the selection
    const rect = range.getBoundingClientRect()
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    })
    setSelectedText(text)
    setVisible(true)
    setCopied(false)

    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [containerRef])

  useEffect(() => {
    document.addEventListener('selectionchange', checkSelection)
    return () => {
      document.removeEventListener('selectionchange', checkSelection)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [checkSelection])

  // Hide on scroll
  useEffect(() => {
    if (!visible) return
    const handleScroll = () => setVisible(false)
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [visible])

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(selectedText).then(() => {
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        setVisible(false)
      }, 1200)
    })
  }, [selectedText])

  const handleQuote = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setQuotedText(selectedText)
    setVisible(false)
    window.getSelection()?.removeAllRanges()
  }, [selectedText, setQuotedText])

  const handleSaveNote = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const MAX_NOTES = 100
    const currentNotes: Note[] = usePrefsStore.getState().prefs.notes || []
    if (currentNotes.length >= MAX_NOTES) {
      addToast('error', t('message.notesLimitReached'))
      return
    }
    const now = Date.now()
    const title = selectedText.slice(0, 50) + (selectedText.length > 50 ? '...' : '')
    const newNote: Note = {
      id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      content: selectedText,
      createdAt: now,
      updatedAt: now,
    }
    const updated = [newNote, ...currentNotes]
    usePrefsStore.getState().setPrefs({ notes: updated })
    window.electronAPI.prefsSet('notes', updated)
    addToast('success', t('message.savedToNotes'))
    setVisible(false)
    window.getSelection()?.removeAllRanges()
  }, [selectedText, addToast, t])

  const handleTranslate = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const lang = usePrefsStore.getState().prefs.language
    const targetLang = lang === 'zh-CN' ? 'English' : 'Chinese'
    const prompt = `Translate the following text to ${targetLang}:\n\n${selectedText}`
    window.dispatchEvent(new CustomEvent('aipa:sendPrompt', { detail: prompt }))
    setVisible(false)
    window.getSelection()?.removeAllRanges()
  }, [selectedText])

  const handleExplain = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const prompt = `Explain the following in simple terms:\n\n${selectedText}`
    window.dispatchEvent(new CustomEvent('aipa:sendPrompt', { detail: prompt }))
    setVisible(false)
    window.getSelection()?.removeAllRanges()
  }, [selectedText])

  if (!visible || !selectedText) return null

  // Calculate position relative to viewport
  const toolbarWidth = 120
  const clampedX = Math.max(toolbarWidth / 2 + 8, Math.min(position.x, window.innerWidth - toolbarWidth / 2 - 8))

  return (
    <div
      ref={toolbarRef}
      onMouseDown={(e) => e.preventDefault()} // Prevent selection from being lost
      style={{
        position: 'fixed',
        left: clampedX,
        top: position.y,
        transform: 'translate(-50%, -100%)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '3px 5px',
        background: 'var(--popup-bg)',
        border: '1px solid var(--popup-border)',
        boxShadow: 'var(--popup-shadow)',
        borderRadius: 8,
        zIndex: 1000,
        animation: 'popup-in 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Copy selection */}
      <button
        onClick={handleCopy}
        title={copied ? t('message.copied') : t('selection.copySelection')}
        style={{
          background: 'transparent',
          border: 'none',
          borderRadius: 5,
          padding: '4px 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          color: copied ? 'var(--success)' : 'var(--text-muted)',
          fontSize: 11,
          transition: 'background 0.12s ease, color 0.12s ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { if (!copied) (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span>{copied ? t('message.copied') : t('selection.copy')}</span>
      </button>

      {/* Separator */}
      <div style={{ width: 1, height: 16, background: 'var(--popup-border)', flexShrink: 0 }} />

      {/* Quote reply */}
      <button
        onClick={handleQuote}
        title={t('selection.quoteSelection')}
        style={{
          background: 'transparent',
          border: 'none',
          borderRadius: 5,
          padding: '4px 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          color: 'var(--text-muted)',
          fontSize: 11,
          transition: 'background 0.12s ease, color 0.12s ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <MessageSquareQuote size={13} />
        <span>{t('selection.quote')}</span>
      </button>

      {/* Separator */}
      <div style={{ width: 1, height: 16, background: 'var(--popup-border)', flexShrink: 0 }} />

      {/* Save to notes */}
      <button
        onClick={handleSaveNote}
        title={t('selection.saveToNotes')}
        style={{
          background: 'transparent',
          border: 'none',
          borderRadius: 5,
          padding: '4px 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          color: 'var(--text-muted)',
          fontSize: 11,
          transition: 'background 0.12s ease, color 0.12s ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <StickyNote size={13} />
        <span>{t('selection.note')}</span>
      </button>

      {/* Separator */}
      <div style={{ width: 1, height: 16, background: 'var(--popup-border)', flexShrink: 0 }} />

      {/* Translate */}
      <button
        onClick={handleTranslate}
        title={t('selection.translate')}
        style={{
          background: 'transparent',
          border: 'none',
          borderRadius: 5,
          padding: '4px 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          color: 'var(--text-muted)',
          fontSize: 11,
          transition: 'background 0.12s ease, color 0.12s ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <Languages size={13} />
        <span>{t('selection.translate')}</span>
      </button>

      {/* Explain */}
      <button
        onClick={handleExplain}
        title={t('selection.explain')}
        style={{
          background: 'transparent',
          border: 'none',
          borderRadius: 5,
          padding: '4px 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          color: 'var(--text-muted)',
          fontSize: 11,
          transition: 'background 0.12s ease, color 0.12s ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <Lightbulb size={13} />
        <span>{t('selection.explain')}</span>
      </button>
    </div>
  )
}
