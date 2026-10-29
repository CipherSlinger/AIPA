import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useT } from '../../i18n'
import {
  summarizeMemoryReceipt,
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
 * One quiet line under a user message saying what memory context was given to
 * the model for that turn, expandable to the block verbatim.
 *
 * The copy reports what was *given*, never what was *used*: the receipt proves
 * the prompt contained a block, not that the assistant acted on it. "Told ·
 * project notes" is a statement about the envelope; "remembered your project
 * notes" would be a claim about behaviour that nothing here can support.
 */
export function MemoryReceiptLine({ receipt }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const summary = summarizeMemoryReceipt(receipt)

  // Absent = unknown or nothing to disclose. Rendering an empty line would
  // turn "we don't know" into "there was no memory", which is a different
  // statement.
  if (summary.kind === 'absent') return null

  if (summary.kind === 'failed') {
    return (
      <div
        data-memory-receipt="failed"
        title={receipt?.failed || t('error.unknownError')}
        style={{
          marginTop: 6,
          fontSize: 11,
          lineHeight: 1.5,
          color: 'var(--text-muted)',
          userSelect: 'none',
        }}
      >
        {t('chat.memoryReceipt.failed')}
      </div>
    )
  }

  const head = memoryHead(summary, t)
  const line = summary.unreadableCount > 0 && summaryHeadNamesBlock(summary)
    ? `${head} · ${t('chat.memoryReceipt.unreadable', { count: summary.unreadableCount })}`
    : head
  const canExpand = Boolean(receipt?.text)

  return (
    <div data-memory-receipt="told" style={{ marginTop: 6 }}>
      {canExpand ? (
        <button
          type="button"
          data-memory-receipt-toggle="true"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
          title={t('chat.memoryReceipt.expandHint')}
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
        <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text-faint)' }}>
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
          {receipt!.text}
        </pre>
      ) : null}
    </div>
  )
}

/** Does the head line already say something was given? */
function summaryHeadNamesBlock(summary: MemoryReceiptSummary): boolean {
  return summary.applied.length > 0 || summary.chars > 0
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
