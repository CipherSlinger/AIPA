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
      background: 'rgba(15,15,25,0.96)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
    }}>
      <span style={{
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.82)',
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum"',
      }}>
        {selectedCount}
      </span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.60)', flex: 1 }}>
        {t('session.selectedCount', { count: String(selectedCount) })}
      </span>
      <button
        onClick={onCancel}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.45)',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.82)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
      >
        <X size={11} />
        {t('common.cancel')}
      </button>
      {confirmBulkDelete ? (
        <button
          onClick={onDelete}
          style={{
            background: 'rgba(239,68,68,0.20)',
            border: '1px solid rgba(239,68,68,0.40)',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 12,
            color: '#f87171',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontWeight: 600,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.30)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.20)')}
        >
          <Trash2 size={11} />
          {t('session.confirmBulkDelete', { count: String(selectedCount) })}
        </button>
      ) : (
        <button
          onClick={onConfirm}
          style={{
            background: 'rgba(239,68,68,0.20)',
            border: '1px solid rgba(239,68,68,0.40)',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 12,
            color: '#f87171',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.30)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.20)')}
        >
          <Trash2 size={11} />
          {t('session.deleteSelected')}
        </button>
      )}
    </div>
  )
}
