import React, { useEffect, useRef } from 'react'
import { ChatMessage } from '../../types/app.types'
import Message from './Message'
import PermissionCard from './PermissionCard'

interface Props {
  messages: ChatMessage[]
  onPermission: (permissionId: string, allowed: boolean) => void
}

export default function MessageList({ messages, onPermission }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

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
              onAllow={() => onPermission(msg.permissionId, true)}
              onDeny={() => onPermission(msg.permissionId, false)}
            />
          )
        }
        return <Message key={msg.id} message={msg} />
      })}
      <div ref={bottomRef} />
    </div>
  )
}
