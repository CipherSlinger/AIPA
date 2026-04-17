/**
 * AgentToolCard — specialized card for the `Agent` tool (sub-agent calls)
 *
 * Extracted from ToolUseBlock.tsx into its own file for maintainability.
 * Iteration 544. Enhanced in Iteration 638 with:
 *   - Foreground/Background execution mode badge
 *   - Worktree isolation badge
 *   - Expandable prompt preview (>150 chars)
 *   - Expandable result preview (>200 chars)
 *   - Indigo left border consistent with other agent-related cards
 */

import React, { useState, useEffect, useRef } from 'react'
import { Users, ChevronDown, Check, X, Timer, Loader2, GitBranch } from 'lucide-react'
import { ToolUseInfo } from '../../types/app.types'

// CopyOutputBtn inline (avoids circular import with ToolUseBlock)
function CopyOutputBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '1px 4px',
        borderRadius: 6,
        color: copied ? '#4ade80' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 9,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#6366f1' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={10} /> : null}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export interface AgentToolCardProps {
  input: {
    description?: string
    prompt?: string
    subagent_type?: string
    run_in_background?: boolean
    isolation?: string
    [key: string]: unknown
  }
  result?: string | null
  isStreaming?: boolean
  tool: ToolUseInfo
  onAbort?: () => void
}

const PROMPT_LIMIT = 150
const RESULT_LIMIT = 200

export function AgentToolCard({ input, result, tool, onAbort }: AgentToolCardProps) {
  const isRunning = tool.status === 'running'
  const isDone = tool.status === 'done'
  const isError = tool.status === 'error'

  const description = typeof input.description === 'string' ? input.description : ''
  const promptText = typeof input.prompt === 'string' ? input.prompt : ''
  const subagentType = typeof input.subagent_type === 'string' ? input.subagent_type : ''
  const runInBackground = input.run_in_background === true
  const isWorktree = input.isolation === 'worktree'

  const [elapsed, setElapsed] = useState(0)
  const [finalDuration, setFinalDuration] = useState<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [resultExpanded, setResultExpanded] = useState(false)

  useEffect(() => {
    if (isRunning) {
      setExpanded(true)
      startTimeRef.current = Date.now()
      setElapsed(0)
      setFinalDuration(null)
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (startTimeRef.current && elapsed > 0) {
        setFinalDuration(elapsed)
      }
      setExpanded(false)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prompt preview logic
  const isPromptLong = promptText.length > PROMPT_LIMIT
  const promptPreview = isPromptLong && !promptExpanded
    ? promptText.slice(0, PROMPT_LIMIT) + '...'
    : promptText

  // Result preview logic
  const resultText = result ?? ''
  const isResultLong = resultText.length > RESULT_LIMIT
  const resultPreview = isResultLong && !resultExpanded
    ? resultText.slice(0, RESULT_LIMIT) + '...'
    : resultText

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderLeft: '4px solid rgba(99,102,241,0.5)',
        borderRadius: 10,
        marginBottom: 6,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 10px',
          background: 'var(--bg-hover)',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
      >
        {/* Icon */}
        <Users size={12} style={{ color: 'rgba(165,180,252,0.85)', flexShrink: 0 }} />

        {/* "Sub-agent" label */}
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
          flexShrink: 0,
        }}>
          Sub-agent
        </span>

        {/* subagent_type badge */}
        {subagentType && (
          <span style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 8,
            background: 'rgba(107,114,128,0.15)',
            border: '1px solid rgba(107,114,128,0.25)',
            color: 'var(--text-muted)',
            fontWeight: 500,
            flexShrink: 0,
          }}>
            {subagentType}
          </span>
        )}

        {/* Foreground / Background badge */}
        <span style={{
          fontSize: 10,
          padding: '1px 6px',
          borderRadius: 8,
          background: runInBackground
            ? 'rgba(249,115,22,0.12)'
            : 'rgba(34,197,94,0.12)',
          border: `1px solid ${runInBackground ? 'rgba(249,115,22,0.28)' : 'rgba(34,197,94,0.28)'}`,
          color: runInBackground ? '#fb923c' : '#4ade80',
          fontWeight: 600,
          flexShrink: 0,
        }}>
          {runInBackground ? 'Background' : 'Foreground'}
        </span>

        {/* Worktree badge */}
        {isWorktree && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 8,
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.28)',
            color: '#60a5fa',
            fontWeight: 600,
            flexShrink: 0,
          }}>
            <GitBranch size={9} style={{ flexShrink: 0 }} />
            Worktree
          </span>
        )}

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Elapsed timer (running) */}
        {isRunning && elapsed >= 2 && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
            fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatElapsed(elapsed)}
          </span>
        )}

        {/* Final duration */}
        {!isRunning && finalDuration !== null && finalDuration >= 1 && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
            fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}>
            <Timer size={9} />
            {formatElapsed(finalDuration)}
          </span>
        )}

        {/* Status indicator */}
        {isRunning && (
          <Loader2 size={11} className="animate-spin" style={{ color: 'rgba(165,180,252,0.7)', flexShrink: 0 }} />
        )}
        {isDone && (
          <Check size={11} style={{ color: 'rgba(134,239,172,0.85)', flexShrink: 0 }} />
        )}
        {isError && (
          <X size={11} style={{ color: 'rgba(239,68,68,0.85)', flexShrink: 0 }} />
        )}

        {/* Abort button */}
        {isRunning && onAbort && (
          <button
            onClick={(e) => { e.stopPropagation(); onAbort() }}
            style={{
              padding: '1px 6px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 600,
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
          >
            Abort
          </button>
        )}

        {/* Chevron */}
        <ChevronDown
          size={11}
          style={{
            color: 'var(--text-muted)',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Description row */}
          {description && (
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)',
              lineHeight: 1.4,
            }}>
              {description}
            </div>
          )}

          {/* Prompt preview */}
          {promptText && (
            <div>
              <div style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-muted)',
                marginBottom: 4,
              }}>
                Prompt
              </div>
              <div style={{
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.14)',
                borderRadius: 6,
                padding: '6px 9px',
              }}>
                <pre style={{
                  margin: 0,
                  fontSize: 11,
                  fontFamily: 'inherit',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {promptPreview}
                </pre>
                {isPromptLong && (
                  <button
                    onClick={() => setPromptExpanded(!promptExpanded)}
                    style={{
                      marginTop: 3,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'rgba(165,180,252,0.65)',
                      fontSize: 10,
                      padding: '0',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.65)' }}
                  >
                    {promptExpanded ? 'Show less' : `+ ${promptText.length - PROMPT_LIMIT} more chars`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Result */}
          {result != null && (
            <div>
              <div style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-muted)',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span>Agent Output</span>
                {resultText && <CopyOutputBtn text={resultText} />}
              </div>
              <div style={{
                background: 'var(--code-bg)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 9px',
              }}>
                <pre style={{
                  margin: 0,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: isError ? '#fca5a5' : 'var(--text-secondary)',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'var(--border) transparent',
                }}>
                  {resultPreview}
                </pre>
                {isResultLong && (
                  <button
                    onClick={() => setResultExpanded(!resultExpanded)}
                    style={{
                      marginTop: 3,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'rgba(165,180,252,0.65)',
                      fontSize: 10,
                      padding: '0',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.65)' }}
                  >
                    {resultExpanded ? 'Show less' : `+ ${resultText.length - RESULT_LIMIT} more chars`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AgentToolCard
