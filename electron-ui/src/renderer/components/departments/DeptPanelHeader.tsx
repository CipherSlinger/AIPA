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
      borderBottom: '1px solid var(--bg-hover)',
      paddingBottom: 10,
      marginBottom: 0,
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
          background: '#6366f1',
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
        {departmentCount > 0 && (
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            color: '#6366f1',
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 10,
            padding: '0px 5px',
            lineHeight: '14px',
            flexShrink: 0,
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
              padding: '4px 6px',
              borderRadius: 4,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            {forceCollapsed === true ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
          </button>
        )}
        <button
          onClick={onToggleAddForm}
          title={t('dept.add')}
          style={{
            border: `1px solid ${showAddForm ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.3)'}`,
            background: showAddForm
              ? 'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.3))'
              : 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))',
            cursor: 'pointer',
            color: 'rgba(99,102,241,1)',
            padding: 4,
            borderRadius: 8,
            display: 'flex',
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.38), rgba(139,92,246,0.32))'
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.25)'
          }}
          onMouseLeave={e => {
            if (!showAddForm) {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))'
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'
              e.currentTarget.style.boxShadow = 'none'
            }
          }}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
