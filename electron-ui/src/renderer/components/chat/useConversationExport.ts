import { useCallback } from 'react'
import { ChatMessage } from '../../types/app.types'
import { formatMarkdown } from '../../utils/formatMarkdown'
import { formatHtml } from '../../utils/formatHtml'
import { useT } from '../../i18n'
import { generateShortWordSlug } from '../../utils/wordSlug'
import { ToastType } from '../ui/Toast'

interface BookmarkedMsg {
  msg: ChatMessage
  idx: number
}

/**
 * Hook encapsulating conversation export, copy, and bookmark export logic.
 */
export function useConversationExport(
  messages: ChatMessage[],
  currentSessionId: string | null,
  currentSessionTitle: string | null,
  model: string,
  bookmarkedMessages: BookmarkedMsg[],
  addToast: (type: ToastType, message: string) => void,
) {
  const t = useT()

  const exportConversation = useCallback(async () => {
    if (messages.length === 0) return
    const now = new Date()
    const slug = generateShortWordSlug()
    const defaultName = `aipa-${slug}`
    const filePath = await window.electronAPI.fsShowSaveDialog(defaultName, [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'HTML', extensions: ['html'] },
      { name: 'JSON', extensions: ['json'] },
    ])
    if (!filePath) return

    const isJson = filePath.toLowerCase().endsWith('.json')
    const isHtml = filePath.toLowerCase().endsWith('.html') || filePath.toLowerCase().endsWith('.htm')
    let content: string

    if (isJson) {
      content = JSON.stringify(messages, null, 2)
    } else if (isHtml) {
      content = formatHtml(messages, currentSessionId, now, currentSessionTitle, model)
    } else {
      content = formatMarkdown(messages, currentSessionId, now, currentSessionTitle, model)
    }

    const result = await window.electronAPI.fsWriteFile(filePath, content)
    if (result?.error) {
      addToast('error', t('chat.exportFailed', { error: result.error }))
    } else {
      addToast('success', t('chat.exportSuccess'))
    }
  }, [messages, currentSessionId, addToast, t])

  const exportBookmarks = useCallback(async () => {
    if (bookmarkedMessages.length === 0) return
    const bookmarkedMsgs = bookmarkedMessages.map(b => b.msg)
    const now = new Date()
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const defaultName = `aipa-bookmarks-${ts}`
    const filePath = await window.electronAPI.fsShowSaveDialog(defaultName, [
      { name: 'Markdown', extensions: ['md'] },
    ])
    if (!filePath) return
    const content = formatMarkdown(bookmarkedMsgs, currentSessionId, now, currentSessionTitle, model)
    const result = await window.electronAPI.fsWriteFile(filePath, content)
    if (result?.error) {
      addToast('error', t('chat.exportFailed', { error: result.error }))
    } else {
      addToast('success', t('chat.bookmarksExported'))
    }
  }, [bookmarkedMessages, currentSessionId, currentSessionTitle, model, addToast, t])

  const copyConversation = useCallback(async () => {
    if (messages.length === 0) return
    const md = formatMarkdown(messages, currentSessionId, new Date(), currentSessionTitle, model)
    try {
      await navigator.clipboard.writeText(md)
      addToast('success', t('chat.copiedToClipboard'))
    } catch {
      addToast('error', t('chat.copyFailed'))
    }
  }, [messages, currentSessionId, addToast, t])

  return { exportConversation, exportBookmarks, copyConversation }
}
