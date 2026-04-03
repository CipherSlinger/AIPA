// Session tooltip hook — extracted from SessionList.tsx (Iteration 441)
import { useState, useRef, useCallback } from 'react'
import { SessionListItem } from '../../types/app.types'
import { PreviewMessage } from './SessionTooltip'

export function useSessionTooltip() {
  const [tooltipSession, setTooltipSession] = useState<SessionListItem | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const showSessionTooltip = useCallback((session: SessionListItem, e: React.MouseEvent) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    const rect = e.currentTarget.getBoundingClientRect()
    tooltipTimerRef.current = setTimeout(() => {
      setTooltipSession(session)
      setTooltipPos({ top: rect.top, left: rect.right + 8 })
      // Load preview messages asynchronously
      setPreviewMessages(null)
      setPreviewLoading(true)
      window.electronAPI.sessionLoad(session.sessionId).then((rawMessages: Array<Record<string, unknown>>) => {
        const msgs: PreviewMessage[] = []
        for (const entry of rawMessages) {
          if (entry.type !== 'user' && entry.type !== 'assistant') continue
          let content = ''
          const msg = entry.message as Record<string, unknown> | undefined
          if (msg?.content) {
            if (typeof msg.content === 'string') content = msg.content
            else if (Array.isArray(msg.content)) {
              const textPart = (msg.content as Array<Record<string, unknown>>).find(c => c.type === 'text')
              if (textPart?.text) content = String(textPart.text)
            }
          }
          if (content) {
            msgs.push({
              role: entry.type as 'user' | 'assistant',
              content: content.slice(0, 300),
              timestamp: entry.timestamp ? new Date(entry.timestamp as string).getTime() : undefined,
            })
          }
        }
        setPreviewMessages(msgs.slice(-5))
        setPreviewLoading(false)
      }).catch(() => {
        setPreviewLoading(false)
      })
    }, 400)
  }, [])

  const hideSessionTooltip = useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
    setTooltipSession(null)
    setPreviewMessages(null)
    setPreviewLoading(false)
  }, [])

  return {
    tooltipSession,
    tooltipPos,
    previewMessages,
    previewLoading,
    showSessionTooltip,
    hideSessionTooltip,
  }
}
