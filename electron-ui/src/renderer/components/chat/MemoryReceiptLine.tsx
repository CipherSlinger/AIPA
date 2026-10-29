import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useT } from '../../i18n'
import {
  summarizeMemoryReceipt,
  type DeptHandbookSummary,
  type MemoryReceiptSummary,
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
  const blockText = [receipt?.text, dept?.kind === 'told' ? receipt?.department?.text : undefined]
    .filter((block): block is string => typeof block === 'string' && block !== '')
    .join('\n\n')
  const canExpand = blockText !== ''

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
  )
}

/** Does the head line already say something was given? */
function summaryHeadNamesBlock(summary: MemoryReceiptSummary): boolean {
  return summary.applied.length > 0 || summary.chars > 0
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
    const labels = summary.applied.map(tier => {
      const key = TIER_LABEL_KEYS[tier]
      return key ? t(key) : tier
    })
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
