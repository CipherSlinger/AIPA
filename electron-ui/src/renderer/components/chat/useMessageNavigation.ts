import { useEffect, useState, useMemo } from 'react'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import { useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { Virtualizer } from '@tanstack/react-virtual'

interface ListItem {
  type: string
  msgIdx?: number
}

/**
 * Keyboard message navigation hook extracted from MessageList (Iteration 403).
 *
 * Handles:
 * - Ctrl+Up/Down to step through messages
 * - Ctrl+C to copy focused message (when no text selection)
 * - Escape to clear focus indicator
 * - Sync focus when Ctrl+Home/End fires via CustomEvent
 * - Clear focus when messages change (new message sent)
 */
export function useMessageNavigation(
  messages: ChatMessage[],
  items: ListItem[],
  virtualizer: Virtualizer<HTMLDivElement, Element>,
) {
  const [focusedMsgIdx, setFocusedMsgIdx] = useState<number | null>(null)
  const t = useT()

  const messageIndices = useMemo(() =>
    messages.reduce<number[]>((acc, m, i) => {
      if (m.role !== 'permission' && m.role !== 'plan') acc.push(i)
      return acc
    }, []),
    [messages]
  )

  // Keyboard navigation between messages (Ctrl+Up/Down to step through all messages, Escape to unfocus)
  // Note: Ctrl+Home/End are handled by useChatPanelShortcuts -> aipa:scrollToFirst/Last events
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape clears focus indicator (does not conflict with Escape-to-abort in useChatPanelShortcuts
      // because that handler only fires when streaming is active)
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (focusedMsgIdx !== null) {
          setFocusedMsgIdx(null)
          // Don't preventDefault — let Escape propagate to abort handler if streaming
        }
        return
      }

      if (!e.ctrlKey || e.shiftKey || e.altKey) return
      if (messageIndices.length === 0) return

      // Ctrl+C: copy focused message content when no text is selected (Iteration 453)
      if (e.key === 'c' && focusedMsgIdx !== null) {
        const selection = window.getSelection()?.toString()
        if (!selection) {
          e.preventDefault()
          const msg = messages[focusedMsgIdx] as StandardChatMessage
          if (msg?.content) {
            navigator.clipboard.writeText(msg.content).catch(() => {})
            // Dispatch event so Message component can show copy flash
            window.dispatchEvent(new CustomEvent('aipa:messageCopiedByKeyboard', { detail: msg.id }))
            useUiStore.getState().addToast('success', t('message.copiedViaKeyboard'))
          }
          return
        }
      }

      let nextIdx: number | null = null

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (focusedMsgIdx === null) {
          nextIdx = messageIndices[messageIndices.length - 1]
        } else {
          const pos = messageIndices.indexOf(focusedMsgIdx)
          if (pos > 0) nextIdx = messageIndices[pos - 1]
          else nextIdx = messageIndices[0]
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (focusedMsgIdx === null) {
          nextIdx = messageIndices[0]
        } else {
          const pos = messageIndices.indexOf(focusedMsgIdx)
          if (pos < messageIndices.length - 1) nextIdx = messageIndices[pos + 1]
          else nextIdx = messageIndices[messageIndices.length - 1]
        }
      }

      if (nextIdx !== null) {
        setFocusedMsgIdx(nextIdx)
        const itemIdx = items.findIndex(it => it.type === 'message' && it.msgIdx === nextIdx)
        if (itemIdx >= 0) {
          virtualizer.scrollToIndex(itemIdx, { align: 'center', behavior: 'smooth' })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusedMsgIdx, messageIndices, items, virtualizer])

  // Sync focus indicator when Ctrl+Home/End fires (via CustomEvent from useChatPanelShortcuts)
  useEffect(() => {
    const handleFirst = () => {
      if (messageIndices.length > 0) setFocusedMsgIdx(messageIndices[0])
    }
    const handleLast = () => {
      if (messageIndices.length > 0) setFocusedMsgIdx(messageIndices[messageIndices.length - 1])
    }
    window.addEventListener('aipa:scrollToFirst', handleFirst)
    window.addEventListener('aipa:scrollToLast', handleLast)
    return () => {
      window.removeEventListener('aipa:scrollToFirst', handleFirst)
      window.removeEventListener('aipa:scrollToLast', handleLast)
    }
  }, [messageIndices])

  // Clear focus when messages change (new message sent)
  useEffect(() => {
    setFocusedMsgIdx(null)
  }, [messages.length])

  return { focusedMsgIdx }
}
