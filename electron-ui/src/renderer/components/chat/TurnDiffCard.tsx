// TurnDiffCard — Codex's aggregate diff for the turn (`turn/diff/updated`).
//
// Mounted by ChatPanel as a sibling *after* MessageList, never inside the
// transcript: the message list owns scroll anchoring and virtualization, and a
// card growing underneath the last message would move its anchor.
//
// The diff is authoritative in a way the per-tool cards are not — it includes
// changes made by shell commands, which never pass through a file-edit tool.

import React, { useLayoutEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import {
  classifyTurnDiff,
  splitTurnDiff,
  summarizeTurnDiff,
  type TurnDiffLineKind,
} from '../../utils/turnDiff'

/** At most this many lines reach the DOM until the user asks for the rest. */
const MAX_RENDERED_LINES = 400

const LINE_COLOR: Record<TurnDiffLineKind, string> = {
  add: 'var(--success-text)',
  del: 'var(--danger-text)',
  hunk: 'var(--text-faint)',
  meta: 'var(--text-faint)',
  context: 'var(--text-muted)',
}

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export default function TurnDiffCard() {
  const t = useT()
  const turnDiff = useChatStore(s => s.turnDiff)
  const [expanded, setExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const bodyId = React.useId()

  const diffText = turnDiff?.diff ?? ''
  const lines = useMemo(() => splitTurnDiff(diffText), [diffText])
  const kinds = useMemo(() => classifyTurnDiff(diffText), [diffText])
  const stats = useMemo(() => summarizeTurnDiff(diffText), [diffText])

  // A new turn must not inherit the previous card's expanded state: the card
  // is cleared to null on `turn/started` (cli:messageStart), then filled again
  // as soon as the new turn changes something.
  const turnKey = turnDiff ? `${turnDiff.sessionId}:${turnDiff.turnId ?? ''}` : ''
  useLayoutEffect(() => {
    setExpanded(false)
    setShowAll(false)
  }, [turnKey])

  if (!turnDiff) return null

  const fileLabel = stats.files === 1
    ? t('codex.diff.filesOne')
    : t('codex.diff.files', { count: String(stats.files) })
  const visibleLines = showAll ? lines : lines.slice(0, MAX_RENDERED_LINES)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(diffText)
      useUiStore.getState().addToast('success', t('codex.diff.copied'))
    } catch {
      useUiStore.getState().addToast('warning', t('codex.diff.copyFailed'))
    }
  }

  return (
    <div className="chat-column" style={{ marginBottom: 6, flexShrink: 0 }}>
      <div style={{
        background: 'var(--code-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {/* Header row — the toggle is a real button, so Enter/Space and
            aria-expanded come for free. */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '2px 4px',
          background: 'var(--glass-bg-low)',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
        }}>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            aria-controls={bodyId}
            title={expanded ? t('codex.diff.collapse') : t('codex.diff.expand')}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 6px',
              background: 'none',
              border: 'none',
              borderRadius: 6,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            {expanded ? <ChevronDown size={12} style={{ flexShrink: 0 }} /> : <ChevronRight size={12} style={{ flexShrink: 0 }} />}
            <span style={{ whiteSpace: 'nowrap' }}>{t('codex.diff.title')}</span>
            <span style={{
              fontSize: 10,
              fontWeight: 400,
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
              whiteSpace: 'nowrap',
            }}>
              {fileLabel}
            </span>
            {stats.additions > 0 && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--success-text)',
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
              }}>
                +{stats.additions}
              </span>
            )}
            {stats.deletions > 0 && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--danger-text)',
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
              }}>
                −{stats.deletions}
              </span>
            )}
            {turnDiff.truncated && (
              <span
                aria-label={t('codex.diff.truncated')}
                title={t('codex.diff.truncated')}
                style={{ fontSize: 10, color: 'var(--warning-text)', flexShrink: 0 }}
              >
                …
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            title={t('codex.diff.copy')}
            aria-label={t('codex.diff.copy')}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: 3,
              background: 'none',
              border: 'none',
              borderRadius: 5,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'color 0.15s ease, background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}
          >
            <Copy size={12} />
          </button>
        </div>

        {expanded && (
          <div id={bodyId}>
            {turnDiff.truncated && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                fontSize: 10,
                color: 'var(--warning-text)',
                borderBottom: '1px solid var(--border)',
              }}>
                <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                <span>{t('codex.diff.truncated')}</span>
              </div>
            )}
            {lines.length === 0 ? (
              <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)' }}>
                {t('codex.diff.empty')}
              </div>
            ) : (
              <div
                role="region"
                aria-label={t('codex.diff.region')}
                style={{
                  overflowX: 'auto',
                  overflowY: 'auto',
                  maxHeight: 320,
                  padding: '4px 0',
                  fontFamily: MONO_FONT,
                  fontSize: 11,
                  lineHeight: 1.55,
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'var(--border) transparent',
                }}
              >
                {visibleLines.map((line, idx) => (
                  <div
                    key={idx}
                    style={{
                      // Long lines scroll horizontally instead of wrapping:
                      // re-wrapped patch lines stop looking like a patch.
                      whiteSpace: 'pre',
                      padding: '0 10px',
                      color: LINE_COLOR[kinds[idx] ?? 'context'],
                    }}
                  >
                    {line.length > 0 ? line : ' '}
                  </div>
                ))}
              </div>
            )}
            {!showAll && lines.length > MAX_RENDERED_LINES && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '4px 10px',
                  background: 'none',
                  border: 'none',
                  borderTop: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 10,
                  textAlign: 'left',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                {t('codex.diff.showAll', { count: String(lines.length) })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
