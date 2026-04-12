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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        flexShrink: 0,
        background: 'rgba(15,15,25,0.96)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
      }}>
        {/* Selected count badge — indigo pill */}
        <span style={{
          background: 'rgba(99,102,241,0.20)',
          border: '1px solid rgba(99,102,241,0.30)',
          borderRadius: 20,
          padding: '1px 8px',
          fontSize: 11,
          fontWeight: 700,
          color: '#818cf8',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
          letterSpacing: '0.02em',
        }}>
          {selectedCount}
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.60)', flex: 1 }}>
          {t('session.archiveSelected')}
        </span>
        {/* Archive button — ghost */}
        <button
          onClick={onBulkArchive}
          title={t('session.archiveSelected')}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 12,
            color: 'rgba(255,255,255,0.82)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
          }}
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
