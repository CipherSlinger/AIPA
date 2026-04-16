/**
 * AgentToolCard — specialized card for the `Agent` tool (sub-agent calls)
 *
 * Extracted from ToolUseBlock.tsx into its own file for maintainability.
 * Iteration 544.
 */

import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check, X, Timer } from 'lucide-react'
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
      title="复制"
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
      {copied ? '已复制' : '复制'}
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
    [key: string]: unknown
  }
  result?: string | null
  isStreaming?: boolean
  tool: ToolUseInfo
  onAbort?: () => void
}

export function AgentToolCard({ input, result, tool, onAbort }: AgentToolCardProps) {
  const isRunning = tool.status === 'running'
  const isDone = tool.status === 'done'
  const description = input.description || input.prompt || ''
  const subagentType = input.subagent_type || ''
  const [elapsed, setElapsed] = useState(0)
  const [finalDuration, setFinalDuration] = useState<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [expanded, setExpanded] = useState(false)

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

  const statusColor = isRunning
    ? 'rgba(251,191,36,0.82)'
    : isDone
    ? 'rgba(134,239,172,0.82)'
    : 'rgba(239,68,68,0.82)'

  const statusLabel = isRunning ? '运行中' : isDone ? '已完成' : '出错'

  const promptText = typeof input.prompt === 'string' ? input.prompt : ''

  return (
    <div
      style={{
        background: 'rgba(15,15,25,0.60)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid rgba(139,92,246,0.60)',
        borderRadius: 10,
        marginBottom: 6,
        overflow: 'hidden',
        transition: 'all 0.15s ease',
      }}
    >
      <style>{`
        @keyframes agent-pulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>

      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          background: 'rgba(139,92,246,0.06)',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          borderRadius: expanded ? '8px 8px 0 0' : 8,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.10)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.06)' }}
      >
        {/* Sub-agent label */}
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase' as const,
          color: 'rgba(192,132,252,0.82)',
          flexShrink: 0,
        }}>
          子代理
        </span>

        {/* Description preview */}
        <span style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {description || '(无描述)'}
        </span>

        {/* Elapsed timer */}
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

        {/* Status badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 10,
          fontWeight: 600,
          color: statusColor,
          flexShrink: 0,
        }}>
          {isRunning ? (
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor,
              display: 'inline-block',
              flexShrink: 0,
              animation: 'agent-pulse 1.5s ease-in-out infinite',
            }} />
          ) : isDone ? (
            <Check size={10} style={{ color: statusColor }} />
          ) : (
            <X size={10} style={{ color: statusColor }} />
          )}
          {statusLabel}
        </span>

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
            取消
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
          {/* Subagent type tag */}
          {subagentType && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-muted)',
              }}>类型</span>
              <span style={{
                fontSize: 11,
                color: 'rgba(192,132,252,0.60)',
                background: 'rgba(139,92,246,0.10)',
                border: '1px solid rgba(139,92,246,0.20)',
                borderRadius: 6,
                padding: '1px 6px',
                fontWeight: 500,
              }}>
                {subagentType}
              </span>
            </div>
          )}

          {/* Prompt content */}
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
                提示词
              </div>
              <pre style={{
                margin: 0,
                fontSize: 11,
                fontFamily: 'monospace',
                background: 'rgba(8,8,16,0.80)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 10px',
                overflow: 'auto',
                maxHeight: 160,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--border) transparent',
              }}>
                {promptText}
              </pre>
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
                <span>子代理输出</span>
                {result && <CopyOutputBtn text={result} />}
              </div>
              <pre style={{
                margin: 0,
                fontSize: 11,
                fontFamily: 'monospace',
                background: 'rgba(8,8,16,0.80)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 10px',
                overflow: 'auto',
                maxHeight: 200,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--border) transparent',
              }}>
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AgentToolCard
