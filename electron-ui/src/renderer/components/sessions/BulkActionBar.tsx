// BulkActionBar — bulk archive + delete actions for select mode (extracted Iteration 455)
import React from 'react'
import { Archive } from 'lucide-react'
import BulkDeleteBar from './BulkDeleteBar'
import { useT } from '../../i18n'

interface BulkActionBarProps {
  selectedCount: number
  onBulkArchive: () => void
  confirmBulkDelete: boolean
  onCancelSelect: () => void
  onBulkDelete: () => void
  onConfirmDelete: () => void
}

export default function BulkActionBar({
  selectedCount,
  onBulkArchive,
  confirmBulkDelete,
  onCancelSelect,
  onBulkDelete,
  onConfirmDelete,
}: BulkActionBarProps) {
  const t = useT()

  return (
    <>
      <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={onBulkArchive}
          title={t('session.archiveSelected')}
          style={{
            flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '5px 0', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <Archive size={11} />
          {t('session.archiveSelected')}
        </button>
      </div>
      <BulkDeleteBar
        selectedCount={selectedCount}
        confirmBulkDelete={confirmBulkDelete}
        onCancel={onCancelSelect}
        onDelete={onBulkDelete}
        onConfirm={onConfirmDelete}
      />
    </>
  )
}
