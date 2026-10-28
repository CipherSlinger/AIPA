// Sidebar department panel header: title, count, collapse-all and add toggles.
import { Building2, Plus, ChevronsUpDown, ChevronsDownUp } from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  departmentCount: number
  showAddForm: boolean
  forceCollapsed: boolean | null
  onToggleCollapseAll: () => void
  onToggleAddForm: () => void
}

export default function DeptPanelHeader({
  departmentCount,
  showAddForm,
  forceCollapsed,
  onToggleCollapseAll,
  onToggleAddForm,
}: Props) {
  const t = useT()

  return (
    <div style={{
      padding: '14px 14px 10px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 2,
          height: 14,
          borderRadius: 2,
          background: 'var(--accent)',
          opacity: 0.7,
          flexShrink: 0,
        }} />
        <Building2 size={12} color="var(--text-muted)" style={{ opacity: 0.8 }} />
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}>
          {t('dept.panelTitle')}
        </span>
        {/* A quiet count chip: the section title must stay the one bold thing
            on this line. Same chip as the archive group headers. */}
        {departmentCount > 0 && (
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--text-muted)',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '0 6px',
            lineHeight: '16px',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {departmentCount}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {departmentCount > 0 && (
          <button
            onClick={onToggleCollapseAll}
            title={forceCollapsed === true ? t('dept.expandAll') : t('dept.collapseAll')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              width: 24,
              height: 24,
              borderRadius: 6,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            {forceCollapsed === true ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
          </button>
        )}
        <button
          onClick={onToggleAddForm}
          title={t('dept.add')}
          style={{
            border: `1px solid ${showAddForm ? 'var(--accent)' : 'var(--accent-border)'}`,
            background: showAddForm ? 'var(--accent-bg)' : 'transparent',
            cursor: 'pointer',
            color: 'var(--accent-text)',
            padding: 0,
            borderRadius: 6,
            display: 'flex',
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--accent-bg)'
            e.currentTarget.style.borderColor = 'var(--accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = showAddForm ? 'var(--accent-bg)' : 'transparent'
            e.currentTarget.style.borderColor = showAddForm ? 'var(--accent)' : 'var(--accent-border)'
          }}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
