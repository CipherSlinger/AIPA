import React, { useEffect, useRef } from 'react'
import { ChatMessage } from '../../types/app.types'
import Message from './Message'
import PermissionCard from './PermissionCard'
import PlanCard from './PlanCard'
import { useChatStore, useUiStore } from '../../store'

interface Props {
  messages: ChatMessage[]
  onPermission: (permissionId: string, allowed: boolean) => void
  onGrantPermission: (permissionId: string, toolName: string) => void
  sessionId?: string | null
}

export default function MessageList({ messages, onPermission, onGrantPermission, sessionId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const { resolvePlan, rateMessage } = useChatStore()
  const { addToast } = useUiStore()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]])

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 0' }}>
      {messages.map((msg) => {
        if (msg.role === 'permission') {
          return (
            <PermissionCard
              key={msg.id}
              message={msg}
              onAllow={() => onGrantPermission(msg.permissionId, msg.toolName)}
              onDeny={() => onPermission(msg.permissionId, false)}
            />
          )
        }
        if (msg.role === 'plan') {
          return (
            <PlanCard
              key={msg.id}
              message={msg}
              onAccept={() => resolvePlan(msg.id, 'accepted')}
              onReject={() => resolvePlan(msg.id, 'rejected')}
            />
          )
        }
        return <Message
          key={msg.id}
          message={msg}
          onRate={(msgId, rating) => {
            rateMessage(msgId, rating)
            window.electronAPI.feedbackRate(msgId, rating)
          }}
          onRewind={sessionId ? async (ts) => {
            const isoTs = new Date(ts).toISOString()
            const result = await window.electronAPI.sessionRewind(sessionId, isoTs)
            if (result?.success) {
              addToast('success', 'Files reverted to state before this message')
            } else {
              addToast('error', 'Rewind failed: ' + (result?.error || 'Unknown error'))
            }
          } : undefined}
        />
      })}
      <div ref={bottomRef} />
    </div>
  )
}
