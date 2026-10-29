/**
 * FileEditCard.tsx
 * Renders the CLI's Edit / str_replace_editor tool use in a structured inline card.
 *
 * Input fields (Claude CLI Edit tool):
 *   file_path: string       — the file being edited
 *   old_string: string      — the text to replace (also accepted as old_str)
 *   new_string: string      — the replacement text (also accepted as new_str)
 *   replace_all?: boolean   — whether to replace all occurrences
 *
 * Visual design:
 *   - Orange left border (4px solid rgba(251,146,60,0.35))
 *   - Pencil icon in orange, "Edit" action badge
 *   - File path: directory muted, basename bold in orange tint
 *   - replace_all badge when applicable
 *   - Stacked diff: "Before" (red-tinted) / "After" (green-tinted) panels
 *   - "Edit applied" green badge when result is present
 */

import React, { useState, useCallback, useMemo, useSyncExternalStore } from 'react'
import { FilePen, Check, Clipboard, ChevronDown, ChevronRight } from 'lucide-react'
import { useT } from '../../../i18n'
import { useFindDeep } from '../findDeep'
import {
  itemIdFromToolId,
  parsePartialUnifiedDiff,
  resolveLiveChange,
  type NormalizedPatchChange,
  type PartialDiffView,
} from '../fileChangePatch'
import { liveFilePatchStore } from '../liveFilePatchStore'
import AutoApprovalReviewLine from './AutoApprovalReviewLine'

// ── Constants ─────────────────────────────────────────────────────────────────

const PREVIEW_LINES = 10

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract basename and directory from a file path string */
function splitPath(filePath: string): { dir: string; basename: string } {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return { dir: '', basename: normalized }
  return {
    dir: normalized.slice(0, lastSlash + 1),
    basename: normalized.slice(lastSlash + 1),
  }
}

/** Truncate a string to N lines, returning { visible, hiddenCount } */
function truncateLines(
  text: string,
  maxLines: number
): { visible: string; hiddenCount: number } {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return { visible: text, hiddenCount: 0 }
  return {
    visible: lines.slice(0, maxLines).join('\n'),
    hiddenCount: lines.length - maxLines,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
      title={copied ? 'Copied!' : 'Copy'}
      className={`card-action${copied ? ' is-copied' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: 6,
        color: copied ? 'var(--success-text)' : 'var(--text-muted)',
        fontSize: 10,
        transition: 'color 0.15s ease',
        flexShrink: 0,
      }}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/** A single diff panel: "Before" or "After" */
interface DiffPanelProps {
  label: string
  text: string
  variant: 'old' | 'new'
}

function DiffPanel({ label, text, variant }: DiffPanelProps) {
  const [expanded, setExpanded] = useState(false)
  // A deep find shows the whole before/after text: the truncated tail exists
  // nowhere else in the DOM, so leaving it out would be a false negative.
  const deepFind = useFindDeep()
  const { visible, hiddenCount } = truncateLines(text, PREVIEW_LINES)
  const needsExpand = hiddenCount > 0
  const displayText = expanded || deepFind ? text : visible

  const isOld = variant === 'old'
  // Diff ink is 11px text on a tinted row, so it needs the readable semantic
  // tokens rather than a 0.85-alpha pastel (≈2:1 on the light theme).
  const accentColor = isOld ? 'var(--danger-text)' : 'var(--success-text)'
  const bgColor = isOld ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)'
  const borderColor = isOld ? 'rgba(239,68,68,0.20)' : 'rgba(34,197,94,0.20)'
  const labelColor = accentColor

  if (!text) {
    return (
      <div style={{
        flex: 1,
        minWidth: 0,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '3px 8px',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: labelColor,
          background: bgColor,
        }}>
          {label}
        </div>
        <div style={{
          padding: '6px 8px',
          fontSize: 11,
          fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
          color: 'var(--text-faint)',
          fontStyle: 'italic',
        }}>
          (empty)
        </div>
      </div>
    )
  }

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      overflow: 'hidden',
      background: bgColor,
    }}>
      {/* Panel label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '3px 8px',
        borderBottom: `1px solid ${borderColor}`,
      }}>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: labelColor,
        }}>
          {label}
        </span>
        <CopyBtn text={text} />
      </div>

      {/* Code block */}
      <pre style={{
        margin: 0,
        padding: '6px 8px',
        fontSize: 11,
        fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
        color: accentColor,
        background: 'transparent',
        overflow: 'auto',
        maxHeight: 200,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        lineHeight: 1.5,
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent',
      }}>
        {displayText}
      </pre>

      {/* Show more toggle, hidden during a deep find: the full text is
          already rendered, so the control would describe a preview. */}
      {needsExpand && !deepFind && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderTop: `1px solid ${borderColor}`,
            cursor: 'pointer',
            color: labelColor,
            fontSize: 10,
            fontFamily: 'monospace',
            padding: '3px 8px',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
        >
          {expanded
            ? <><ChevronDown size={10} /> Show less</>
            : <><ChevronRight size={10} /> +{hiddenCount} more lines</>}
        </button>
      )}
    </div>
  )
}

// ── Live patch preview ────────────────────────────────────────────────────────

interface LiveDiffPreviewProps {
  view: PartialDiffView
  truncated: boolean
}

/**
 * Compact unified-diff view of the snapshot Codex is still writing.
 * Deliberately shows no success/failure state: a partial hunk is not a result.
 */
function LiveDiffPreview({ view, truncated }: LiveDiffPreviewProps) {
  const t = useT()
  return (
    <div>
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'rgba(13,13,20,0.35)',
      }}>
        <div style={{
          maxHeight: 220,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--border) transparent',
          fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
          fontSize: 11,
          lineHeight: 1.5,
        }}>
          {view.lines.map((line, idx) => {
            const isAdd = line.type === 'add'
            const isDel = line.type === 'del'
            return (
              <div key={idx} style={{
                display: 'flex',
                gap: 6,
                padding: '0 8px',
                background: isAdd
                  ? 'rgba(34,197,94,0.10)'
                  : isDel
                    ? 'rgba(239,68,68,0.08)'
                    : 'transparent',
                color: isAdd
                  ? 'var(--success-text)'
                  : isDel
                    ? 'var(--danger-text)'
                    : 'var(--text-muted)',
              }}>
                <span style={{ flexShrink: 0, opacity: 0.7, userSelect: 'none' }}>
                  {isAdd ? '+' : isDel ? '-' : ' '}
                </span>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 0 }}>
                  {line.content || ' '}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {(view.hiddenLines > 0 || truncated) && (
        <div style={{
          marginTop: 4,
          fontSize: 10,
          color: 'var(--text-faint)',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          {view.hiddenLines > 0 && (
            <span>{t('chat.fileEdit.hiddenLines', { count: String(view.hiddenLines) })}</span>
          )}
          {truncated && <span>{t('chat.fileEdit.partialTruncated')}</span>}
        </div>
      )}
    </div>
  )
}

/**
 * Subscribe to the live snapshot for this card. The store is keyed by the
 * Codex item id; a multi-file patch opens one card per change (`itemId:idx`).
 * `getVersion` is the reactive value — entries themselves are read after the
 * re-render, which keeps the subscription cheap and stable.
 */
function useLiveChange(toolId: string, filePath: string): NormalizedPatchChange | null {
  const version = useSyncExternalStore(
    liveFilePatchStore.subscribe,
    liveFilePatchStore.getVersion,
  )
  // `version` is intentionally read only to tie the render to store changes.
  void version
  return resolveLiveChange(
    liveFilePatchStore.getEntry(itemIdFromToolId(toolId)),
    toolId,
    filePath,
  )
}

// ── FileEditCard ──────────────────────────────────────────────────────────────

export interface FileEditCardProps {
  input: Record<string, unknown>
  result?: string | null
  isStreaming?: boolean
  /** Tool card id (`itemId` or `itemId:index`) used to find live snapshots. */
  toolId?: string
}

/**
 * Structured card for the CLI's Edit (str_replace) tool.
 * Shows file path with orange icon, before/after diff panels,
 * replace_all badge, and "Edit applied" confirmation on result.
 */
export function FileEditCard({ input, result, isStreaming, toolId = '' }: FileEditCardProps) {
  const t = useT()
  // Accept both old_string/new_string and old_str/new_str (CLI variants)
  const filePath =
    typeof input.file_path === 'string' ? input.file_path :
    typeof input.path === 'string' ? input.path : ''

  const oldString =
    typeof input.old_string === 'string' ? input.old_string :
    typeof input.old_str === 'string' ? input.old_str : ''

  const newString =
    typeof input.new_string === 'string' ? input.new_string :
    typeof input.new_str === 'string' ? input.new_str : ''

  const replaceAll = input.replace_all === true

  const { dir, basename } = splitPath(filePath)
  const hasResult = typeof result === 'string' && result.length > 0
  const hasDiff = oldString.length > 0 || newString.length > 0

  // A live snapshot is only a progress view. Once the item resolves — or the
  // store has already cleared it — the card's own input/result is the
  // authoritative diff, and a stale partial patch must never win.
  const liveChange = useLiveChange(toolId, filePath)
  const liveView = useMemo(
    () => (liveChange ? parsePartialUnifiedDiff(liveChange.diff) : null),
    [liveChange],
  )
  const showLive = Boolean(isStreaming) && !hasResult && liveView !== null

  return (
    <div style={{
      background: 'var(--bg-primary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: '2px solid rgba(251,146,60,0.35)',
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      boxShadow: 'var(--code-shadow)',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'var(--section-bg)',
      }}>
        <FilePen
          size={13}
          style={{ color: 'var(--warning-text)', flexShrink: 0 }}
        />

        {/* "Edit" action badge */}
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          padding: '2px 7px',
          borderRadius: 8,
          background: 'rgba(251,146,60,0.15)',
          border: '1px solid rgba(251,146,60,0.30)',
          color: 'var(--warning-text)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          Edit
        </span>

        {/* File path: directory muted, basename bold in orange tint */}
        <div style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'baseline',
          gap: 0,
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
            color: 'var(--warning-text)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {basename || filePath}
          </span>
        </div>

        {/* replace_all badge */}
        {replaceAll && (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 8,
            background: 'rgba(251,146,60,0.12)',
            border: '1px solid rgba(251,146,60,0.28)',
            color: 'var(--warning-text)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            replace all
          </span>
        )}

        {/* "Edit applied" badge when result is present */}
        {hasResult && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 9,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 8,
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.28)',
            color: 'var(--success-text)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            <Check size={9} />
            Edit applied
          </span>
        )}

        {/* Editing indicator (streaming state) */}
        {isStreaming && !hasResult && (
          <span style={{
            fontSize: 10,
            color: 'var(--warning-text)',
            fontStyle: 'italic',
            flexShrink: 0,
          }}>
            Editing…
          </span>
        )}
      </div>

      {/* Reviewer verdict for the item this card was opened for (`itemId`, or
          `itemId:N` for later files of a multi-file patch). */}
      <AutoApprovalReviewLine itemId={toolId} />

      {/* Diff section: live snapshot while writing, authoritative before/after
          once the item resolves. Never both — a partial patch must not look
          like the final edit. */}
      {(hasDiff || showLive) && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            {/* Section label */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span>{showLive ? t('chat.fileEdit.liveDiff') : 'Changes'}</span>
              {showLive && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 400,
                  letterSpacing: 'normal',
                  textTransform: 'none',
                  color: 'var(--warning-text)',
                  fontStyle: 'italic',
                }}>
                  {t('chat.fileEdit.liveHint')}
                </span>
              )}
            </div>

            {showLive && liveView && liveChange ? (
              <LiveDiffPreview view={liveView} truncated={liveChange.truncated} />
            ) : (
              /* Before / After panels stacked vertically for readability */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <DiffPanel label="Before" text={oldString} variant="old" />
                <DiffPanel label="After" text={newString} variant="new" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
