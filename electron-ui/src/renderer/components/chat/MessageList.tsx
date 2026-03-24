import React, { useEffect, useRef } from 'react'
import { ChatMessage } from '../../types/app.types'
import Message from './Message'

interface Props {
  messages: ChatMessage[]
}

export default function MessageList({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.content?.length])

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 0' }}>
      {messages.map((msg) => (
        <Message key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
