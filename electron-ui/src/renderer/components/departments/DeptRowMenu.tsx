// Rename / delete dropdown for one department row.
import { Pencil, Trash2 } from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  onRename: () => void
  onDelete: () => void
}

export default function DeptRowMenu({ onRename, onDelete }: Props) {
  const t = useT()

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        right: 8,
        top: '100%',
        zIndex: 200,
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        borderRadius: 9,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        minWidth: 135,
        padding: 4,
        animation: 'slideUp 0.15s ease',
      }}
    >
      <button
        onClick={onRename}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '7px 11px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--text-primary)',
          borderRadius: 6,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
      >
        <Pencil size={12} /> {t('dept.rename')}
      </button>
      <button
        onClick={onDelete}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '7px 11px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: 12,
          color: '#f87171',
          borderRadius: 6,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
      >
        <Trash2 size={12} /> {t('dept.delete')}
      </button>
    </div>
  )
}
