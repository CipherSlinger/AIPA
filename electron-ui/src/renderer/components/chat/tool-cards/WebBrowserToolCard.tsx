import React, { useState } from 'react'
import { Globe, Check, X } from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Detect if a string looks like a base64-encoded image */
export function isBase64Image(s: string): boolean {
  return s.startsWith('data:image/') || /^[A-Za-z0-9+/]{100,}={0,2}$/.test(s.slice(0, 200))
}

// ── Components ─────────────────────────────────────────────────────────────────

/** Input section for browser automation tools */
export function WebBrowserInputCard({ input }: { input: Record<string, unknown> }) {
  const action = typeof input.action === 'string' ? input.action : null
  const url = typeof input.url === 'string' ? input.url : null
  const selector = typeof input.selector === 'string' ? input.selector : null
  const text = typeof input.text === 'string' ? input.text : null

  const ACTION_STYLE: Record<string, { bg: string; border: string; color: string }> = {
    navigate:   { bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.35)', color: '#a5b4fc' },
    click:      { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.30)', color: '#fcd34d' },
    type:       { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.30)',  color: '#4ade80' },
    screenshot: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.30)', color: '#93c5fd' },
    scroll:     { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.30)', color: '#c4b5fd' },
    wait:       { bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.35)', color: '#94a3b8' },
  }
  const style = action ? (ACTION_STYLE[action] ?? { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.25)', color: '#a5b4fc' }) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {/* Action badge */}
      {action && style && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 9px', borderRadius: 6,
            background: style.bg, border: `1px solid ${style.border}`,
            color: style.color, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            {action}
          </span>
        </div>
      )}
      {/* URL */}
      {url && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Globe size={11} style={{ color: 'rgba(165,180,252,0.60)', flexShrink: 0 }} />
          <span style={{
            fontSize: 11, fontFamily: 'monospace',
            color: 'rgba(147,197,253,0.85)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            {url}
          </span>
        </div>
      )}
      {/* CSS selector */}
      {selector && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>selector</span>
          <code style={{
            fontSize: 11, fontFamily: 'monospace',
            background: 'var(--tool-card-bg)', border: '1px solid rgba(99,102,241,0.20)',
            borderRadius: 4, padding: '1px 6px',
            color: 'rgba(196,181,253,0.85)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            {selector}
          </code>
        </div>
      )}
      {/* Type text preview */}
      {text && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>text</span>
          <span style={{
            fontSize: 11, fontFamily: 'monospace',
            color: 'rgba(74,222,128,0.80)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            &ldquo;{text.length > 80 ? text.slice(0, 80) + '\u2026' : text}&rdquo;
          </span>
        </div>
      )}
      {/* Fallback: show raw input if no fields recognised */}
      {!action && !url && !selector && !text && (
        <pre style={{ fontSize: 11, margin: 0, fontFamily: 'monospace', background: 'var(--bg-primary)', border: '1px solid var(--bg-hover)', borderRadius: 4, padding: '6px 8px', overflow: 'auto', maxHeight: 120, color: '#a5b4fc', lineHeight: 1.5 }}>
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  )
}

/** Result section for browser automation tools */
export function WebBrowserResultCard({ result, status, t: _t }: { result: string; status: string | undefined; t: (k: string) => string }) {
  const [expanded, setExpanded] = useState(false)
  const isError = status === 'error'

  // Check if result is a screenshot (base64 or data URL)
  const isScreenshot = isBase64Image(result)
  const imgSrc = result.startsWith('data:image/')
    ? result
    : isScreenshot
    ? `data:image/png;base64,${result}`
    : null

  const PREVIEW_LIMIT = 200
  const preview = !expanded && result.length > PREVIEW_LIMIT
    ? result.slice(0, PREVIEW_LIMIT) + '\u2026'
    : result

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Status badge */}
      <div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 6,
          background: isError ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
          border: `1px solid ${isError ? 'rgba(239,68,68,0.28)' : 'rgba(34,197,94,0.28)'}`,
          color: isError ? '#fca5a5' : '#4ade80',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          {isError
            ? <><X size={9} style={{ flexShrink: 0 }} /> error</>
            : <><Check size={9} style={{ flexShrink: 0 }} /> success</>
          }
        </span>
      </div>
      {/* Screenshot thumbnail */}
      {imgSrc ? (
        <div>
          <img
            src={imgSrc}
            alt="Browser screenshot"
            style={{
              maxWidth: 200, maxHeight: 140,
              borderRadius: 6, border: '1px solid rgba(99,102,241,0.25)',
              objectFit: 'contain', display: 'block',
            }}
          />
        </div>
      ) : result ? (
        /* Text result preview */
        <div style={{ background: 'var(--tool-card-bg)', borderRadius: 6, padding: '6px 10px' }}>
          <pre style={{
            margin: 0, fontSize: 11, fontFamily: 'monospace',
            color: isError ? '#fca5a5' : 'var(--text-secondary)',
            lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: expanded ? 'none' : 140,
            overflow: expanded ? 'visible' : 'hidden',
          }}>
            {preview}
          </pre>
          {result.length > PREVIEW_LIMIT && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                marginTop: 4, background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(165,180,252,0.70)', fontSize: 11, fontFamily: 'monospace',
                padding: '2px 0', transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.70)' }}
            >
              {expanded ? 'Show less' : `Show all ${result.length} chars`}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
