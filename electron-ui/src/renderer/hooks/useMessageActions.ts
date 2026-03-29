import { useCallback, useState } from 'react'
import { StandardChatMessage, Note } from '../types/app.types'
import { usePrefsStore, useChatStore, useUiStore } from '../store'
import { useT } from '../i18n'

interface UseMessageActionsProps {
  message: { id: string; role: string; content?: string }
  isPermission: boolean
  isPlan: boolean
}

export function useMessageActions({ message, isPermission, isPlan }: UseMessageActionsProps) {
  const t = useT()
  const toggleBookmarkStore = useChatStore(s => s.toggleBookmark)
  const setQuotedText = useUiStore(s => s.setQuotedText)
  const addToast = useUiStore(s => s.addToast)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message])

  const handleQuote = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    setQuotedText(text)
  }, [message, setQuotedText])

  const handleBookmarkAction = useCallback((onBookmark?: (id: string) => void) => {
    if (onBookmark) {
      onBookmark(message.id)
    } else {
      toggleBookmarkStore(message.id)
    }
  }, [message.id, toggleBookmarkStore])

  const handleCopyMarkdown = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message])

  const handleCopyRichText = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    // Convert markdown to simple HTML and copy as rich text
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      return `<pre style="background:#f6f8fa;padding:12px;border-radius:6px;overflow-x:auto;font-family:monospace;font-size:13px;border:1px solid #d0d7de">${lang ? `<div style="font-size:11px;color:#656d76;margin-bottom:4px">${lang}</div>` : ''}<code>${code.trimEnd()}</code></pre>`
    })
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background:#f6f8fa;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:13px">$1</code>')
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3 style="margin:12px 0 4px">$1</h3>')
    html = html.replace(/^## (.+)$/gm, '<h2 style="margin:14px 0 6px">$1</h2>')
    html = html.replace(/^# (.+)$/gm, '<h1 style="margin:16px 0 8px">$1</h1>')
    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul style="margin:8px 0;padding-left:20px">${match}</ul>`)
    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>')
    html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1f2328"><p>${html}</p></div>`
    html = html.replace(/<p>\s*<\/p>/g, '')

    const blob = new Blob([html], { type: 'text/html' })
    const plainBlob = new Blob([text], { type: 'text/plain' })
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': plainBlob,
      })
    ]).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Fallback to plain text copy
      navigator.clipboard.writeText(text)
    })
  }, [message])

  const handleSaveAsNote = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    const MAX_NOTES = 100
    const currentNotes: Note[] = usePrefsStore.getState().prefs.notes || []
    if (currentNotes.length >= MAX_NOTES) {
      addToast('error', t('message.notesLimitReached'))
      return
    }
    const now = Date.now()
    const title = text.slice(0, 50) + (text.length > 50 ? '...' : '')
    const newNote: Note = {
      id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      content: text,
      createdAt: now,
      updatedAt: now,
    }
    const updated = [newNote, ...currentNotes]
    usePrefsStore.getState().setPrefs({ notes: updated })
    window.electronAPI.prefsSet('notes', updated)
    addToast('success', t('message.savedToNotes'))
  }, [message, addToast, t])

  const handleDoubleClick = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text || isPermission || isPlan) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message, isPermission, isPlan])

  return {
    copied,
    handleCopy,
    handleQuote,
    handleBookmarkAction,
    handleCopyMarkdown,
    handleCopyRichText,
    handleSaveAsNote,
    handleDoubleClick,
  }
}
