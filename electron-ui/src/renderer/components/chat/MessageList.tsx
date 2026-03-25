import React, { useEffect, useRef } from 'react'
import { ChatMessage } from '../../types/app.types'
import Message from './Message'
import PermissionCard from './PermissionCard'
import PlanCard from './PlanCard'
import { useChatStore } from '../../store'

interface Props {
  messages: ChatMessage[]
  onPermission: (permissionId: string, allowed: boolean) => void
  onGrantPermission: (permissionId: string, toolName: string) => void
}

export default function MessageList({ messages, onPermission, onGrantPermission }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const { resolvePlan } = useChatStore()

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
        return <Message key={msg.id} message={msg} />
      })}
      <div ref={bottomRef} />
    </div>
  )
}

