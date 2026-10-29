import React, { useState } from 'react'
import { Database, FileInput, Check, ClipboardCopy } from 'lucide-react'
import { useFindDeep } from '../findDeep'

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
  // A deep find lists every resource: the first 20 are all that exist in the
  // DOM otherwise, and a phrase in resource 21 would answer "No matches".
  const deepFind = useFindDeep()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div>
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '2px 7px', borderRadius: 6,
          background: 'var(--accent-bg)', color: 'var(--accent-text)',
          fontSize: 10, fontWeight: 700, border: '1px solid var(--accent-border)',
          letterSpacing: '0.03em',
        }}>
          {items.length} {items.length === 1 ? 'resource' : 'resources'}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {(deepFind ? items : items.slice(0, 20)).map((item, i) => (
          <span
            key={i}
            title={item.description ?? item.uri}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 8,
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent-border)',
              color: 'var(--accent-text)',
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
        {items.length > 20 && !deepFind && (
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
  // A deep find renders the whole resource: the tail past the preview exists
  // nowhere else in the DOM.
  const deepFind = useFindDeep()
  const PREVIEW_LIMIT = 300
  const isLong = content.length > PREVIEW_LIMIT
  const preview = isLong && !expanded && !deepFind ? content.slice(0, PREVIEW_LIMIT) + '…' : content
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
        <FileInput size={11} style={{ color: 'var(--accent-muted)', flexShrink: 0 }} />
        <span style={{
          fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {uri}
        </span>
        <button
          onClick={handleCopy}
          title={t('message.copyCode')}
          className={`card-action${copied ? ' is-copied' : ''}`}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            // 2px/6px matches every other card copy button; 1px/4px made this
            // one visibly smaller than the Read/Skill cards next to it.
            padding: '2px 6px', borderRadius: 6,
            color: copied ? 'var(--success-text)' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 10, transition: 'all 0.15s ease', flexShrink: 0,
          }}
        >
          {copied ? <Check size={10} /> : <ClipboardCopy size={10} />}
          {copied ? t('message.codeCopied') : t('message.copyCode')}
        </button>
      </div>
      {/* Content preview */}
      <div style={{ background: 'var(--tool-card-bg)', borderRadius: 6, padding: '6px 10px' }}>
        <pre style={{
          margin: 0, fontSize: 11, fontFamily: 'inherit',
          color: 'var(--text-secondary)', lineHeight: 1.6,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: expanded || deepFind ? 'none' : 140, overflow: expanded || deepFind ? 'visible' : 'hidden',
        }}>
          {preview}
        </pre>
        {/* Hidden during a deep find: everything is already rendered. */}
        {isLong && !deepFind && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              marginTop: 4, background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent-muted)', fontSize: 11, fontFamily: 'monospace',
              padding: '2px 0', transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-text-strong)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent-muted)' }}
          >
            {expanded ? 'Show less' : `Show all ${content.length} chars`}
          </button>
        )}
      </div>
    </div>
  )
}
