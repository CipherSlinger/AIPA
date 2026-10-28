/**
 * One quiet line on an existing tool card reporting what the engine's automatic
 * approval reviewer decided. It never says the command was safe — only what the
 * reviewer's own status word and rationale say. No entry, no line: a review for
 * an item without a card renders nothing.
 */

import React, { useSyncExternalStore } from 'react'
import { ScanLine } from 'lucide-react'
import { useT } from '../../../i18n'
import {
  autoApprovalReviewStore,
  describeAutoApprovalReview,
} from '../autoApprovalReviewStore'

export default function AutoApprovalReviewLine({ itemId }: { itemId: string }) {
  const t = useT()
  const version = useSyncExternalStore(
    autoApprovalReviewStore.subscribe,
    autoApprovalReviewStore.getVersion,
    autoApprovalReviewStore.getVersion,
  )
  // Read reactively, then fetch the entry; the version is the change signal.
  void version
  const review = autoApprovalReviewStore.getEntry(itemId)
  const text = describeAutoApprovalReview(review, t)
  if (!text || !review) return null

  return (
    <div
      role="status"
      aria-label={t('codex.autoApprovalReview.aria')}
      data-auto-approval-review={review.status}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 5,
        padding: '4px 10px',
        background: 'var(--glass-bg-mid)',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        lineHeight: 1.45,
        color: 'var(--text-muted)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      <ScanLine
        size={10}
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: 2, opacity: 0.75 }}
      />
      <span>{text}</span>
    </div>
  )
}
