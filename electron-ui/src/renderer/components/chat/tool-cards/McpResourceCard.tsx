import React, { useState } from 'react'
import { Database, FileInput, Check, ClipboardCopy } from 'lucide-react'

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface McpResourceItem {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

// ── Parse helpers ──────────────────────────────────────────────────────────────

/** Parse ListMcpResources result: JSON array of resource descriptors */
export function parseMcpResourceList(raw: string): McpResourceItem[] | null {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      const items = parsed.filter(
        (x): x is McpResourceItem =>
          x !== null && typeof x === 'object' && typeof (x as Record<string, unknown>).uri === 'string'
      )
      return items.length > 0 ? items : null
    }
  } catch { /* not JSON */ }
  return null
}

// ── Components ─────────────────────────────────────────────────────────────────

/** ListMcpResources result card — resource URI chips */
export function McpResourceListCard({ items, t: _t }: { items: McpResourceItem[]; t: (k: string) => string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div>
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '2px 7px', borderRadius: 6,
          background: 'rgba(99,102,241,0.14)', color: 'rgba(165,180,252,0.85)',
          fontSize: 10, fontWeight: 700, border: '1px solid rgba(99,102,241,0.28)',
          letterSpacing: '0.03em',
        }}>
          {items.length} {items.length === 1 ? 'resource' : 'resources'}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.slice(0, 20).map((item, i) => (
          <span
            key={i}
            title={item.description ?? item.uri}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 8,
              background: 'rgba(99,102,241,0.10)',
              border: '1px solid rgba(99,102,241,0.22)',
              color: 'rgba(165,180,252,0.88)',
              fontSize: 11, fontFamily: 'monospace',
              maxWidth: 260, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: 'default',
            }}
          >
            <Database size={9} style={{ flexShrink: 0, opacity: 0.65 }} />
            {item.name ?? item.uri}
          </span>
        ))}
        {items.length > 20 && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', fontFamily: 'monospace' }}>
            +{items.length - 20} more
          </span>
        )}
      </div>
    </div>
  )
}

/** ReadMcpResource result card — URI header + content preview */
export function McpResourceReadCard({ uri, content, t }: { uri: string; content: string; t: (k: string) => string }) {
  const [expanded, setExpanded] = useState(false)
  const PREVIEW_LIMIT = 300
  const isLong = content.length > PREVIEW_LIMIT
  const preview = isLong && !expanded ? content.slice(0, PREVIEW_LIMIT) + '…' : content
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* URI header chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileInput size={11} style={{ color: 'rgba(165,180,252,0.7)', flexShrink: 0 }} />
        <span style={{
          fontSize: 11, fontFamily: 'monospace', color: 'rgba(165,180,252,0.85)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {uri}
        </span>
        <button
          onClick={handleCopy}
          title={t('message.copyCode')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '1px 4px', borderRadius: 6,
            color: copied ? '#4ade80' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 9, transition: 'all 0.15s ease', flexShrink: 0,
          }}
          onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#6366f1' }}
          onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          {copied ? <Check size={10} /> : <ClipboardCopy size={10} />}
          {copied ? t('message.codeCopied') : t('message.copyCode')}
        </button>
      </div>
      {/* Content preview */}
      <div style={{ background: 'rgba(0,0,0,0.20)', borderRadius: 6, padding: '6px 10px' }}>
        <pre style={{
          margin: 0, fontSize: 11, fontFamily: 'inherit',
          color: 'var(--text-secondary)', lineHeight: 1.6,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: expanded ? 'none' : 140, overflow: expanded ? 'visible' : 'hidden',
        }}>
          {preview}
        </pre>
        {isLong && (
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
            {expanded ? 'Show less' : `Show all ${content.length} chars`}
          </button>
        )}
      </div>
    </div>
  )
}
