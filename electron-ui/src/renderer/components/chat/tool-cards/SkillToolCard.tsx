import React, { useState, useCallback } from 'react'
import { Zap, Check, Clipboard } from 'lucide-react'

interface CopyBtnProps {
  text: string
}

function CopyBtn({ text }: CopyBtnProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [text])

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy result'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: 6,
        color: copied ? '#4ade80' : 'var(--text-muted)',
        fontSize: 10,
        transition: 'color 0.15s ease',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#22c55e' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export interface SkillToolCardProps {
  input: Record<string, unknown>
  result?: string | null
  isLoading?: boolean
}

export function SkillToolCard({ input, result, isLoading }: SkillToolCardProps) {
  const [showFullResult, setShowFullResult] = useState(false)

  const skillName = typeof input.skill === 'string' ? input.skill
    : typeof input.skill_name === 'string' ? input.skill_name
    : ''

  const args = input.args != null ? input.args : null

  const hasResult = typeof result === 'string' && result.length > 0
  const isDone = !isLoading && hasResult

  const PREVIEW_CHARS = 200

  const borderColor = isLoading
    ? 'rgba(34,197,94,0.70)'
    : isDone
    ? 'rgba(34,197,94,0.50)'
    : 'rgba(34,197,94,0.35)'

  const previewText = hasResult && result!.length > PREVIEW_CHARS && !showFullResult
    ? result!.slice(0, PREVIEW_CHARS) + '…'
    : result ?? ''

  return (
    <div style={{
      background: 'var(--bg-primary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: `2px solid ${borderColor}`,
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      transition: 'border-color 0.2s ease',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'var(--section-bg)',
      }}>
        <Zap size={13} style={{ color: 'rgba(34,197,94,0.85)', flexShrink: 0 }} />

        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(34,197,94,0.90)',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {skillName || '(unnamed skill)'}
        </span>

        {isLoading && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 500,
            color: 'rgba(34,197,94,0.80)',
            fontStyle: 'italic',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}>
            Running...
          </span>
        )}

        {isDone && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 8,
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.28)',
            color: '#4ade80',
            fontSize: 10,
            fontWeight: 500,
            flexShrink: 0,
          }}>
            <Check size={9} style={{ flexShrink: 0 }} />
            Skill executed
          </span>
        )}
      </div>

      {args !== null && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 6,
            }}>
              Args
            </div>
            <pre style={{
              fontSize: 11,
              margin: 0,
              fontFamily: 'monospace',
              background: 'var(--code-bg)',
              border: '1px solid var(--bg-hover)',
              borderRadius: 4,
              padding: '6px 8px',
              overflow: 'auto',
              maxHeight: 120,
              color: 'rgba(34,197,94,0.80)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {isDone && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>
                Output
              </span>
              <CopyBtn text={result!} />
            </div>
            <pre style={{
              fontSize: 11,
              margin: 0,
              fontFamily: 'monospace',
              background: 'var(--code-bg)',
              border: '1px solid var(--bg-hover)',
              borderRadius: 4,
              padding: '6px 8px',
              overflow: 'auto',
              maxHeight: 200,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {previewText}
            </pre>
            {result!.length > PREVIEW_CHARS && (
              <button
                onClick={() => setShowFullResult(!showFullResult)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 10,
                  color: 'rgba(34,197,94,0.70)',
                  padding: '2px 0',
                  marginTop: 2,
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(34,197,94,1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(34,197,94,0.70)' }}
              >
                {showFullResult ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
