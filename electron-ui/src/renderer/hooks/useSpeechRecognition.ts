import { useState, useRef, useEffect, useCallback } from 'react'

const MAX_RECORDING_MS = 120_000 // 2 minutes auto-stop

/**
 * Manages Web Speech API speech recognition.
 * Returns listening state, recording elapsed seconds, and a toggle function.
 * Auto-stops after 2 minutes.
 */
export function useSpeechRecognition(
  onTranscript: (text: string) => void,
  onAutoStop?: () => void,
) {
  const [listening, setListening] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timers when listening stops
  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null }
    setRecordingSeconds(0)
  }, [])

  // Sync: clear timers when listening becomes false
  useEffect(() => {
    if (!listening) clearTimers()
  }, [listening, clearTimers])

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers])

  const toggleSpeech = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = navigator.language || 'en-US'
    recognition.interimResults = false
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      onTranscript(transcript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
    startTimeRef.current = Date.now()

    // Elapsed-second counter
    timerRef.current = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 500)

    // Auto-stop after 2 minutes
    autoStopRef.current = setTimeout(() => {
      recognitionRef.current?.stop()
      setListening(false)
      onAutoStop?.()
    }, MAX_RECORDING_MS)
  }, [listening, onTranscript, onAutoStop, clearTimers])

  return { listening, recordingSeconds, toggleSpeech }
}
