import React, { useState, useCallback } from 'react'
import { FileText, Check, Clipboard } from 'lucide-react'

const PREVIEW_CHARS = 300

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
      title={copied ? 'Copied!' : 'Copy content'}
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
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#a5b4fc' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function splitPath(filePath: string): { dir: string; basename: string } {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return { dir: '', basename: normalized }
  return {
    dir: normalized.slice(0, lastSlash + 1),
    basename: normalized.slice(lastSlash + 1),
  }
}

export interface BriefToolCardProps {
  input: Record<string, unknown>
  result?: string | null
}

export function BriefToolCard({ input, result }: BriefToolCardProps) {
  const [expanded, setExpanded] = useState(false)

  const filePath = typeof input.path === 'string' ? input.path : ''
  const { dir, basename } = splitPath(filePath)

  const hasResult = typeof result === 'string' && result.length > 0
  const needsExpand = hasResult && result!.length > PREVIEW_CHARS
  const visibleContent = needsExpand && !expanded
    ? result!.slice(0, PREVIEW_CHARS) + '…'
    : (result ?? '')

  return (
    <div style={{
      background: 'var(--bg-primary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: hasResult
        ? '2px solid rgba(100,116,139,0.5)'
        : '2px solid rgba(100,116,139,0.3)',
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'var(--section-bg)',
      }}>
        <FileText size={13} style={{ color: 'rgba(148,163,184,0.80)', flexShrink: 0 }} />

        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'rgba(148,163,184,0.70)',
          flexShrink: 0,
        }}>
          Brief
        </span>

        {filePath && (
          <div style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'baseline',
            fontFamily: 'monospace',
            fontSize: 12,
            overflow: 'hidden',
          }}>
            {dir && (
              <span style={{
                color: 'var(--text-muted)',
                fontWeight: 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 1,
                minWidth: 0,
              }}>
                {dir}
              </span>
            )}
            <span style={{
              color: 'rgba(148,163,184,0.92)',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {basename || filePath}
            </span>
          </div>
        )}

        {hasResult && (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 8,
            background: 'rgba(100,116,139,0.12)',
            border: '1px solid rgba(100,116,139,0.28)',
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            Brief loaded
          </span>
        )}
      </div>

      {hasResult && (
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
                Content
              </span>
              <CopyBtn text={result!} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <pre style={{
                margin: 0,
                fontSize: 11,
                fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
                background: 'var(--code-bg)',
                border: '1px solid var(--bg-hover)',
                borderRadius: needsExpand && !expanded ? '6px 6px 0 0' : 6,
                padding: '8px 10px',
                overflow: 'auto',
                maxHeight: expanded ? 500 : 200,
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--border) transparent',
              }}>
                {visibleContent}
              </pre>

              {needsExpand && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  style={{
                    background: 'var(--code-bg)',
                    border: '1px solid var(--bg-hover)',
                    borderTop: 'none',
                    borderRadius: '0 0 6px 6px',
                    cursor: 'pointer',
                    color: 'rgba(148,163,184,0.70)',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    padding: '3px 10px',
                    textAlign: 'left',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,0.70)' }}
                >
                  {expanded ? 'Show less' : `+ ${result!.length - PREVIEW_CHARS} more chars`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
