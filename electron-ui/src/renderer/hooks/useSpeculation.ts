/**
 * useSpeculation — Renderer-side speculative execution lifecycle (Iteration 489).
 * Inspired by Claude Code's services/PromptSuggestion/speculation.ts.
 *
 * After each assistant response completes, takes the current prompt suggestion
 * (from usePromptSuggestion's latestSuggestionRef) and speculatively executes
 * it in a forked CLI process (isolated temp dir). The result is stored as a
 * "preview" that the user can accept or reject.
 *
 * Lifecycle: idle → running → ready → accepted | rejected → idle
 *
 * Integration: called from ChatPanel after streaming ends.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { usePrefsStore } from '../store'
import { latestSuggestionRef } from './usePromptSuggestion'

export interface SpeculationState {
  id: string
  prompt: string          // the speculated user prompt
  text: string            // assistant's speculative response
  toolActions: Array<{ name: string; input: Record<string, unknown>; result?: string }>
  changedFiles: string[]  // files the spec run would modify
  durationMs: number
}

export type SpeculationStatus = 'idle' | 'running' | 'ready' | 'accepted' | 'rejected'

let nextSpecId = 1

/**
 * Hook that manages the speculative execution pipeline.
 *
 * @param isStreaming  — main session streaming state
 * @param cwd         — working directory for the spec run
 */
export function useSpeculation(
  isStreaming: boolean,
  cwd: string,
) {
  const [status, setStatus] = useState<SpeculationStatus>('idle')
  const [result, setResult] = useState<SpeculationState | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const abortedRef = useRef(false)
  const prevStreamingRef = useRef(isStreaming)

  const prefs = usePrefsStore(s => s.prefs)
  // Feature gate: respect promptSuggestionsEnabled as the parent toggle
  const enabled = prefs.promptSuggestionsEnabled !== false && prefs.speculationEnabled !== false

  // Abort any running speculation
  const abortCurrent = useCallback(() => {
    if (activeIdRef.current) {
      window.electronAPI.speculationAbort(activeIdRef.current).catch(() => {})
      activeIdRef.current = null
    }
    abortedRef.current = true
    setStatus('idle')
    setResult(null)
  }, [])

  // Reset when main streaming starts (new user message)
  useEffect(() => {
    if (isStreaming) {
      abortCurrent()
    }
  }, [isStreaming, abortCurrent])

  // Detect streaming end → trigger speculation of the latest suggestion from latestSuggestionRef
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current
    prevStreamingRef.current = isStreaming

    if (!wasStreaming || isStreaming) return   // not a streaming→idle transition
    if (!enabled) return

    // Read the current suggestion from the module-level ref (set by usePromptSuggestion)
    // We delay slightly to give usePromptSuggestion time to generate the suggestion
    const timer = setTimeout(() => {
      const suggestion = latestSuggestionRef.current
      if (!suggestion) return

      abortedRef.current = false
      const id = `spec-${nextSpecId++}`
      activeIdRef.current = id
      setStatus('running')
      setResult(null)

      const model = prefs.advisorModel || prefs.model || 'claude-haiku-4-5'
      const speculationCwd = cwd || ''

      window.electronAPI.speculationIsSafe(suggestion).then((safe: boolean) => {
        if (!safe || abortedRef.current || activeIdRef.current !== id) {
          setStatus('idle')
          return
        }
        return window.electronAPI.speculationRun({
          id,
          prompt: suggestion,
          cwd: speculationCwd,
          model,
          env: {},
        })
      }).then((res: any) => {
        if (abortedRef.current || activeIdRef.current !== id) return
        if (!res || res.error) {
          setStatus('idle')
          return
        }
        setResult({
          id: res.id,
          prompt: res.prompt,
          text: res.text || '',
          toolActions: res.toolActions || [],
          changedFiles: res.changedFiles || [],
          durationMs: res.durationMs || 0,
        })
        setStatus('ready')
      }).catch(() => {
        if (activeIdRef.current === id) setStatus('idle')
      })
    }, 800)  // wait 800ms for prompt suggestion to be generated first

    return () => clearTimeout(timer)
  }, [isStreaming, enabled, cwd, prefs.model, prefs.advisorModel])

  /** Accept the speculation: merge any overlay file changes to real cwd */
  const accept = useCallback(async (): Promise<SpeculationState | null> => {
    if (!result || status !== 'ready') return null
    const id = result.id
    activeIdRef.current = null

    try {
      const merged = await window.electronAPI.speculationAccept(id, cwd)
      setStatus('accepted')
      // Hold the accepted result for ChatPanel to inject as pre-filled exchange
      const accepted = { ...result, changedFiles: merged?.merged || result.changedFiles }
      setResult(accepted)
      return accepted
    } catch {
      setStatus('idle')
      setResult(null)
      return null
    }
  }, [result, status, cwd])

  /** Reject the speculation: discard overlay */
  const reject = useCallback(() => {
    if (!result) return
    const id = result.id
    window.electronAPI.speculationReject(id).catch(() => {})
    activeIdRef.current = null
    setStatus('rejected')
    setResult(null)
  }, [result])

  /** Dismiss after reviewing (same as reject) */
  const dismiss = useCallback(() => {
    reject()
    setStatus('idle')
  }, [reject])

  return { status, result, accept, reject, dismiss, abortCurrent }
}
