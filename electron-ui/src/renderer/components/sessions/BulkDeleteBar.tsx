import React from 'react'
import { Trash2, X } from 'lucide-react'
import { useT } from '../../i18n'

interface BulkDeleteBarProps {
  selectedCount: number
  confirmBulkDelete: boolean
  onCancel: () => void
  onDelete: () => void
  onConfirm: () => void
}

export default function BulkDeleteBar({
  selectedCount,
  confirmBulkDelete,
  onCancel,
  onDelete,
  onConfirm,
}: BulkDeleteBarProps) {
  const t = useT()

  return (
    <div style={{
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderTop: '1px solid var(--border)',
      background: 'var(--popup-bg)',
    }}>
      <span style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        flex: 1,
      }}>
        {t('session.selectedCount', { count: String(selectedCount) })}
      </span>
      <button
        onClick={onCancel}
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '4px 10px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <X size={11} />
        {t('common.cancel')}
      </button>
      {confirmBulkDelete ? (
        <button
          onClick={onDelete}
          style={{
            background: 'var(--error)',
            border: 'none',
            borderRadius: 4,
            padding: '4px 10px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Trash2 size={11} />
          {t('session.confirmBulkDelete', { count: String(selectedCount) })}
        </button>
      ) : (
        <button
          onClick={onConfirm}
          style={{
            background: 'none',
            border: '1px solid var(--error)',
            borderRadius: 4,
            padding: '4px 10px',
            color: 'var(--error)',
            cursor: 'pointer',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Trash2 size={11} />
          {t('session.deleteSelected')}
        </button>
      )}
    </div>
  )
}
