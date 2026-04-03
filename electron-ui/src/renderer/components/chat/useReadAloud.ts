import { useState, useCallback, useEffect, useRef } from 'react'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'

/**
 * useReadAloud — TTS (Text-to-Speech) hook extracted from Message.tsx (Iteration 451)
 * Handles reading message content aloud via Web Speech API.
 */
export function useReadAloud(message: ChatMessage) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const handleReadAloud = useCallback(() => {
    if (!('speechSynthesis' in window)) return

    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      utteranceRef.current = null
      return
    }

    const content = (message as StandardChatMessage).content
    if (!content) return

    // Strip markdown formatting for cleaner speech
    const plainText = content
      .replace(/```[\s\S]*?```/g, ' code block omitted ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, 'image: $1')
      .replace(/^[-*]\s/gm, '')
      .replace(/^\d+\.\s/gm, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim()

    if (!plainText) return

    const utterance = new SpeechSynthesisUtterance(plainText)
    utterance.rate = 1.0
    utterance.pitch = 1.0

    utterance.onend = () => {
      setIsSpeaking(false)
      utteranceRef.current = null
    }
    utterance.onerror = () => {
      setIsSpeaking(false)
      utteranceRef.current = null
    }

    utteranceRef.current = utterance
    setIsSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }, [message, isSpeaking])

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      if (utteranceRef.current) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return { isSpeaking, handleReadAloud }
}
