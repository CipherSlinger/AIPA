import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore } from '../../store/uiStore'
import {
  canForgetSource,
  forgetMemorySource,
  forgetStateAfter,
  summarizeMemoryReceipt,
  type DeptHandbookSummary,
  type MemoryReceiptSummary,
  type MemorySourceForgetState,
  type MemorySourceSummary,
  type MemoryTurnReceipt,
} from '../../lib/memoryReceipt'

/**
 * Tier ids as the assembler emits them (`MemoryContextResult.applied`), mapped
 * to the words the row uses. Unknown ids fall through to the raw id so a new
 * tier is disclosed, never hidden behind a missing translation.
 */
const TIER_LABEL_KEYS: Record<string, string> = {
  globalDoc: 'chat.memoryReceipt.tier.globalDoc',
  projectDoc: 'chat.memoryReceipt.tier.projectDoc',
  globalStructured: 'chat.memoryReceipt.tier.globalStructured',
  projectStructured: 'chat.memoryReceipt.tier.projectStructured',
  personal: 'chat.memoryReceipt.tier.personal',
}

interface Props {
  /** Absent on rows loaded from disk — unknown, not "no memory". */
  receipt?: MemoryTurnReceipt
}

/**
 * One quiet line under a user message saying what context was given to the
 * model for that turn — memory tiers and, when the conversation belongs to a
 * department, its handbook — expandable to the blocks verbatim.
 *
 * The copy reports what was *given*, never what was *used*: the receipt proves
 * the prompt contained a block, not that the assistant acted on it. "Told ·
 * project notes" is a statement about the envelope; "remembered your project
 * notes" would be a claim about behaviour that nothing here can support.
 *
 * A turn that was handed nothing renders nothing at all. In particular an
 * empty handbook is recorded on the receipt but never shown: "this department
 * has no handbook" is not something the user asked to be told on every turn.
 */
export function MemoryReceiptLine({ receipt }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  // The path awaiting the one confirmation click, if any.
  const [confirming, setConfirming] = useState<string | null>(null)
  // Path → outcome of a forget attempt. A deleted file stays in the list: the
  // receipt describes what was sent, and deleting the file does not unsend it.
  const [forgetStates, setForgetStates] = useState<Record<string, MemorySourceForgetState>>({})
  const summary = summarizeMemoryReceipt(receipt)
  const dept = summary.department

  // Absent = unknown or nothing to disclose. Rendering an empty line would
  // turn "we don't know" into "there was no memory", which is a different
  // statement.
  if (summary.kind === 'absent' && !dept) return null

  const clauses: string[] = []
  if (summary.kind === 'failed') {
    clauses.push(t('chat.memoryReceipt.failed'))
  } else if (summary.kind === 'told') {
    const head = memoryHead(summary, t)
    clauses.push(summary.unreadableCount > 0 && summaryHeadNamesBlock(summary)
      ? `${head} · ${t('chat.memoryReceipt.unreadable', { count: summary.unreadableCount })}`
      : head)
  }
  if (dept?.kind === 'told') clauses.push(deptHead(dept, t))
  else if (dept?.kind === 'unreadable') {
    clauses.push(t('chat.memoryReceipt.dept.unreadable', { dept: dept.deptName }))
  }
  if (clauses.length === 0) return null

  const line = clauses.join(' · ')
  const reasons = [receipt?.failed, dept?.kind === 'unreadable' ? dept.reason : undefined]
    .filter((reason): reason is string => typeof reason === 'string' && reason.trim() !== '')
  // A failed assembly applied nothing, whatever the stored receipt still says:
  // `summarizeMemoryReceipt` zeroes the block and the sources in that case, and
  // reading the raw `text` here would put the block back — offering an expand
  // toggle under a sentence that says the turn ran without memory. Only the
  // handbook half may still expand, because it is a separate, truthful record.
  const blockText = [
    summary.kind === 'failed' ? undefined : receipt?.text,
    dept?.kind === 'told' ? receipt?.department?.text : undefined,
  ]
    .filter((block): block is string => typeof block === 'string' && block !== '')
    .join('\n\n')
  // A receipt with provenance but no text is still worth expanding so the user
  // can see which files it names; an old receipt without sources expands only
  // when there is a block, exactly as before.
  const canExpand = blockText !== '' || summary.sources.length > 0

  /**
   * Delete one reported file. The delete channel is the existing
   * `memory:delete`; nothing here invents a second path. The row only stops
   * offering Forget after a success — a refusal keeps it offered, with reason.
   */
  const forget = async (source: MemorySourceSummary) => {
    const filePath = source.path
    if (!filePath) return
    setConfirming(null)
    const result = await forgetMemorySource(source, {
      deleteFile: (path) => window.electronAPI.memoryDelete(path),
    })
    setForgetStates((previous) => ({ ...previous, [filePath]: forgetStateAfter(result) }))
  }

  const openMemoryConsole = () => {
    useUiStore.getState().openSettingsAt('memory')
  }

  return (
    <div
      data-memory-receipt={summary.kind === 'failed' ? 'failed' : 'told'}
      data-dept-handbook={dept?.kind === 'told' ? 'told' : dept?.kind === 'unreadable' ? 'unreadable' : undefined}
      title={reasons.length > 0 ? reasons.join('\n') : undefined}
      style={{ marginTop: 6 }}
    >
      {canExpand ? (
        <button
          type="button"
          data-memory-receipt-toggle="true"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
          title={dept?.kind === 'told'
            ? t('chat.memoryReceipt.expandHintTurn')
            : t('chat.memoryReceipt.expandHint')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            maxWidth: '100%',
            padding: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            lineHeight: 1.5,
            color: 'var(--text-faint)',
            textAlign: 'left',
          }}
        >
          <span>{line}</span>
          {expanded ? <ChevronUp size={10} style={{ flexShrink: 0 }} /> : <ChevronDown size={10} style={{ flexShrink: 0 }} />}
        </button>
      ) : (
        <div style={{
          fontSize: 11,
          lineHeight: 1.5,
          // A pure failure is a warning-shaped row, not the quiet disclosure
          // line — same colour the failed memory receipt has always used.
          color: summary.kind === 'failed' && !dept ? 'var(--text-muted)' : 'var(--text-faint)',
          userSelect: summary.kind === 'failed' && !dept ? 'none' : undefined,
        }}>
          {line}
        </div>
      )}
      {expanded && canExpand ? (
        <div>
          {summary.kind === 'told' && summary.sources.length > 0 ? (
            <div
              data-memory-receipt-sources="true"
              style={{
                marginTop: 4,
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--action-btn-bg)',
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--text-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                maxHeight: 180,
                overflow: 'auto',
              }}
            >
              {/* The one rule the user must not have to guess: forgetting is a
                  change to future turns, not a retraction of this message. */}
              <div data-memory-source-note="alreadySent" style={{ color: 'var(--text-faint)' }}>
                {t('chat.memoryReceipt.source.alreadySent')}
              </div>
              {summary.sources.map((source, index) => (
                <MemorySourceRow
                  key={`${source.tier}:${source.path ?? source.label ?? index}`}
                  source={source}
                  state={source.path ? forgetStates[source.path] : undefined}
                  confirming={confirming !== null && confirming === source.path}
                  t={t}
                  onAsk={() => { if (source.path) setConfirming(source.path) }}
                  onCancel={() => setConfirming(null)}
                  onConfirm={() => { void forget(source) }}
                  onOpenConsole={openMemoryConsole}
                />
              ))}
            </div>
          ) : null}
          {blockText !== '' ? (
            <pre
              data-memory-receipt-text="true"
              style={{
                marginTop: 4,
                marginBottom: 0,
                maxHeight: 240,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--text-muted)',
                background: 'var(--action-btn-bg)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 8px',
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
              }}
            >
              {blockText}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface SourceRowProps {
  source: MemorySourceSummary
  state?: MemorySourceForgetState
  confirming: boolean
  t: ReturnType<typeof useT>
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
  onOpenConsole: () => void
}

/**
 * One provenance row: the file (or note) its tier and the characters it added.
 *
 * Forget is offered only for a source the assembler marked deletable; the
 * memory console link covers personal notes and consolidation files, which the
 * receipt must not pretend to delete itself. A document tier cannot be managed
 * from either surface and simply says so.
 */
function MemorySourceRow({
  source, state, confirming, t, onAsk, onCancel, onConfirm, onOpenConsole,
}: SourceRowProps) {
  const name = source.path ?? source.label ?? ''
  const deleted = state?.deleted === true
  const error = state && !state.deleted ? state.error : undefined

  return (
    <div
      data-memory-source="true"
      data-memory-source-tier={source.tier}
      data-memory-source-path={source.path}
      data-memory-source-omitted={source.omitted ? 'true' : undefined}
      data-memory-source-deleted={deleted ? 'true' : undefined}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 }}
    >
      <span
        title={source.path}
        style={{
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: source.path ? "'Cascadia Code', 'Fira Code', Consolas, monospace" : undefined,
          color: 'var(--text-muted)',
        }}
      >
        {name}
      </span>
      <span style={{ color: 'var(--text-faint)' }}>{tierLabel(source.tier, t)}</span>
      <span style={{ color: 'var(--text-faint)' }}>
        {t('chat.memoryReceipt.source.chars', { chars: source.chars })}
      </span>
      {source.truncated ? (
        <span data-memory-source-truncated="true" style={{ color: 'var(--text-faint)' }}>
          {t('chat.memoryReceipt.source.truncated')}
        </span>
      ) : null}
      {source.omitted ? (
        <span data-memory-source-skipped="true" style={{ color: 'var(--text-faint)' }}>
          {t('chat.memoryReceipt.source.omitted')}
        </span>
      ) : null}
      {deleted ? (
        <span data-memory-source-state="deleted" style={{ color: 'var(--text-faint)' }}>
          {t('chat.memoryReceipt.source.deleted')}
        </span>
      ) : (
        <>
          {error ? (
            <span data-memory-source-state="refused" title={error} style={{ color: 'var(--text-muted)' }}>
              {t('chat.memoryReceipt.source.refused', { reason: error })}
            </span>
          ) : null}
          {canForgetSource(source) ? (
            confirming ? (
              <span data-memory-source-state="confirming" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
                <span>{t('chat.memoryReceipt.source.confirm')}</span>
                <button type="button" data-memory-source-forget="confirm" onClick={onConfirm} style={sourceButtonStyle}>
                  {t('chat.memoryReceipt.source.forget')}
                </button>
                <button type="button" data-memory-source-forget="confirm" onClick={onCancel} style={sourceButtonStyle}>
                  {t('chat.memoryReceipt.source.cancel')}
                </button>
              </span>
            ) : (
              <button type="button" data-memory-source-forget="true" onClick={onAsk} style={sourceButtonStyle}>
                {t('chat.memoryReceipt.source.forget')}
              </button>
            )
          ) : source.console ? (
            <button type="button" data-memory-source-console="true" onClick={onOpenConsole} style={sourceButtonStyle}>
              {t('chat.memoryReceipt.source.openConsole')}
            </button>
          ) : (
            <span data-memory-source-state="not-forgettable" style={{ color: 'var(--text-faint)' }}>
              {t('chat.memoryReceipt.source.notForgettable')}
            </span>
          )}
        </>
      )}
    </div>
  )
}

const sourceButtonStyle: React.CSSProperties = {
  padding: '0 4px',
  fontSize: 11,
  lineHeight: 1.4,
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-muted)',
  cursor: 'pointer',
}

/** Does the head line already say something was given? */
function summaryHeadNamesBlock(summary: MemoryReceiptSummary): boolean {
  return summary.applied.length > 0 || summary.chars > 0
}

function tierLabel(tier: string, t: ReturnType<typeof useT>): string {
  const key = TIER_LABEL_KEYS[tier]
  return key ? t(key) : tier
}

/**
 * The handbook clause. It says how much text the model was handed and, when
 * the ceiling cut the handbook, names the real size — a cut must never read
 * like the whole document.
 */
function deptHead(dept: DeptHandbookSummary, t: ReturnType<typeof useT>): string {
  if (dept.truncated) {
    return t('chat.memoryReceipt.dept.toldCut', {
      dept: dept.deptName,
      chars: dept.chars,
      sourceChars: dept.sourceChars,
    })
  }
  return t('chat.memoryReceipt.dept.told', { dept: dept.deptName, chars: dept.chars })
}

function memoryHead(summary: MemoryReceiptSummary, t: ReturnType<typeof useT>): string {
  if (summary.applied.length > 0) {
    const labels = summary.applied.map(tier => tierLabel(tier, t))
    return t('chat.memoryReceipt.told', { tiers: labels.join(' · ') })
  }
  // A block with characters but no named tier: say it was given without
  // inventing a tier count.
  if (summary.chars > 0) {
    return t('chat.memoryReceipt.toldChars', { chars: summary.chars })
  }
  // Nothing was applied; only unreadable paths were recorded. That is a fact
  // about the user's files, not a disclosure of prompt content.
  return t('chat.memoryReceipt.unreadableOnly', { count: summary.unreadableCount })
}
