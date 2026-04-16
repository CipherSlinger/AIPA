/**
 * SearchResultCard.tsx
 * Extracted from ToolUseBlock.tsx (Iteration 578)
 *
 * Contains:
 *   - GlobPathRow        — single file path row with dimmed directory prefix
 *   - GrepMatchRow       — single grep match row with file:line:content layout
 *   - SearchResultSummary — Glob/Grep results list with count badge + fold
 *   - extractUrls        — extract unique http(s) URLs from text
 *   - WebResultBlock     — URL chips + content preview for WebSearch/WebFetch
 */

import React, { useState } from 'react'
import { Globe } from 'lucide-react'

// ── GlobPathRow ───────────────────────────────────────────────────────────────

interface GlobPathRowProps {
  line: string
}

/** Renders a single file path with the directory portion dimmed */
export function GlobPathRow({ line }: GlobPathRowProps) {
  const normalized = line.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : ''
  const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
  return (
    <div style={{
      fontSize: 11,
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      lineHeight: 1.6,
    }}>
      {dir && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{dir}</span>}
      <span style={{ color: 'rgba(165,180,252,0.90)', fontWeight: 600 }}>{fileName}</span>
    </div>
  )
}

// ── GrepMatchRow ──────────────────────────────────────────────────────────────

interface GrepMatchRowProps {
  line: string
}

/** Renders a single grep result line highlighting the file:lineNum: prefix */
export function GrepMatchRow({ line }: GrepMatchRowProps) {
  const match = line.match(/^([^:]+):(\d+):(.*)$/)
  if (match) {
    const [, filePath, lineNum, content] = match
    return (
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 0,
        fontSize: 11,
        fontFamily: 'monospace',
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        <span style={{ color: 'rgba(165,180,252,0.70)', flexShrink: 0 }}>{filePath}</span>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>:{lineNum}:</span>
        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{content}</span>
      </div>
    )
  }

  return (
    <div style={{
      fontSize: 11,
      fontFamily: 'monospace',
      color: 'var(--text-secondary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      lineHeight: 1.6,
    }}>
      {line}
    </div>
  )
}

// ── SearchResultSummary ───────────────────────────────────────────────────────

interface SearchResultSummaryProps {
  resultText: string
  toolName: string
}

const PREVIEW_LIMIT = 10

/** Glob/Grep result summary with count badge and fold-to-show-all */
export function SearchResultSummary({ resultText, toolName }: SearchResultSummaryProps) {
  const [showAll, setShowAll] = useState(false)
  const lines = resultText.split('\n').filter(l => l.trim().length > 0)
  const total = lines.length
  const visibleLines = (!showAll && total > PREVIEW_LIMIT) ? lines.slice(0, PREVIEW_LIMIT) : lines
  const isGlob = toolName === 'Glob'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      transition: 'all 0.15s ease',
    }}>
      {/* Count badge */}
      <div>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 7px',
          borderRadius: 6,
          background: 'rgba(34,197,94,0.15)',
          color: 'rgba(34,197,94,0.80)',
          fontSize: 10,
          fontWeight: 700,
          border: '1px solid rgba(34,197,94,0.25)',
          letterSpacing: '0.03em',
        }}>
          {isGlob ? `${total} files` : `${total} matches`}
        </span>
      </div>
      {/* Results list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visibleLines.map((line, idx) => (
          isGlob
            ? <GlobPathRow key={idx} line={line} />
            : <GrepMatchRow key={idx} line={line} />
        ))}
        {total > PREVIEW_LIMIT && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(165,180,252,0.70)',
              fontSize: 11,
              fontFamily: 'monospace',
              padding: '2px 0',
              textAlign: 'left',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.70)' }}
          >
            + {total - PREVIEW_LIMIT} more...
          </button>
        )}
      </div>
    </div>
  )
}

// ── extractUrls ───────────────────────────────────────────────────────────────

/** Extract unique http/https URLs from text */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s"'<>)}\]]+/g
  return Array.from(new Set(text.match(urlRegex) ?? []))
}

// ── WebResultBlock ────────────────────────────────────────────────────────────

interface WebResultBlockProps {
  resultText: string
  toolName: string
}

const SUMMARY_LIMIT = 200

/** URL chips + content preview for WebSearch/WebFetch results */
export function WebResultBlock({ resultText, toolName }: WebResultBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const urls = extractUrls(resultText)
  const isSearch = toolName === 'WebSearch'
  const preview = resultText.length > SUMMARY_LIMIT && !expanded
    ? resultText.slice(0, SUMMARY_LIMIT) + '…'
    : resultText

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* URL chips */}
      {urls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            {isSearch ? 'Sources' : 'URL'}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {urls.slice(0, 5).map((url, i) => {
              let host = url
              try { host = new URL(url).hostname } catch { /* use full url */ }
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { e.preventDefault(); window.open(url, '_blank') }}
                  title={url}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 7px',
                    borderRadius: 8,
                    background: 'rgba(99,102,241,0.12)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    color: 'rgba(165,180,252,0.90)',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    textDecoration: 'none',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.22)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
                >
                  <Globe size={9} style={{ flexShrink: 0, opacity: 0.7 }} />
                  {host}
                </a>
              )
            })}
            {urls.length > 5 && (
              <span style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                alignSelf: 'center',
                fontFamily: 'monospace',
              }}>
                +{urls.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Content preview */}
      <div style={{
        background: 'var(--tool-card-bg)',
        borderRadius: 6,
        padding: '6px 10px',
      }}>
        <pre style={{
          margin: 0,
          fontSize: 11,
          fontFamily: 'inherit',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: expanded ? 'none' : 160,
          overflow: expanded ? 'visible' : 'hidden',
        }}>
          {preview}
        </pre>
        {resultText.length > SUMMARY_LIMIT && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              marginTop: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(165,180,252,0.70)',
              fontSize: 11,
              fontFamily: 'monospace',
              padding: '2px 0',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.70)' }}
          >
            {expanded ? 'Show less' : `Show all ${resultText.length} chars`}
          </button>
        )}
      </div>
    </div>
  )
}
