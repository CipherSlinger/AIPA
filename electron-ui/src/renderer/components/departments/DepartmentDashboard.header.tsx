// The department view's top bar: identity, breadcrumb, and the handful of
// actions that act on the whole department rather than on one employee.

import { ArrowLeft, BookOpen, ChevronRight, FolderOpen, MessageSquarePlus } from 'lucide-react'
import type { Department } from '../../store'
import { useT } from '../../i18n'
import type { SortOrder } from './DepartmentDashboard.data'

const SORT_OPTIONS = [
  ['recent', '↓Time'],
  ['oldest', '↑Time'],
  ['msgs', 'Msgs'],
] as const

interface DeptHeaderProps {
  dept: Department
  parentDept: Department | null
  /** A session of this department is open in chat right now. */
  active: boolean
  selectMode: boolean
  sortOrder: SortOrder
  onBack: () => void
  onSelectDept: (deptId: string) => void
  onToggleSelect: () => void
  onExport: () => void
  onOpenFiles: () => void
  onOpenHandbook: () => void
  onSortChange: (order: SortOrder) => void
  onNewSession: () => void
}

export default function DeptHeader({
  dept,
  parentDept,
  active,
  selectMode,
  sortOrder,
  onBack,
  onSelectDept,
  onToggleSelect,
  onExport,
  onOpenFiles,
  onOpenHandbook,
  onSortChange,
  onNewSession,
}: DeptHeaderProps) {
  const t = useT()

  return (
    <div style={{
      height: 56,
      flexShrink: 0,
      background: 'var(--popup-bg)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '14px 20px',
      gap: 10,
      position: 'relative',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      {/* Dept color accent bar */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 3,
        background: dept.color || '#6366f1',
        opacity: 0.75,
        borderRadius: '0 0 0 0',
      }} />
      {/* Back button — icon-only with hover background */}
      <button
        onClick={onBack}
        title={t('dept.backToOrgChart')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 6,
          flexShrink: 0,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--border)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'none'
          e.currentTarget.style.color = 'var(--text-muted)'
        }}
      >
        <ArrowLeft size={15} />
      </button>

      {/* Color dot */}
      <div style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: dept.color || '#6366f1',
        flexShrink: 0,
        boxShadow: `0 0 0 2px var(--border)`,
      }} />

      {/* Dept name + dir */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {/* Breadcrumb — a team is a desk of its own, so its page needs to say
            which department it belongs to and offer the way back up. */}
        {parentDept && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
            <button
              onClick={() => onSelectDept(parentDept.id)}
              title={t('dept.backToParent')}
              style={{
                display: 'flex', alignItems: 'center', gap: 2,
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 10, maxWidth: 160,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#818cf8' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <ArrowLeft size={9} />
              {parentDept.name}
            </button>
            <ChevronRight size={9} style={{ opacity: 0.5, flexShrink: 0 }} />
            <span style={{ opacity: 0.7 }}>{t('dept.team')}</span>
          </div>
        )}
        <div style={{
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1.3,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          {dept.name}
          {active && (
            <div style={{
              width: 7, height: 7,
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 0 2px rgba(34,197,94,0.25)',
              animation: 'dept-active-pulse 2s ease-in-out infinite',
              flexShrink: 0,
              marginLeft: 4,
            }} />
          )}
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 1,
        }}>
          <FolderOpen size={10} style={{ opacity: 0.7, flexShrink: 0 }} />
          {dept.directory}
        </div>
      </div>

      <button
        onClick={onToggleSelect}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          borderRadius: 6,
          border: `1px solid ${selectMode ? 'rgba(99,102,241,0.7)' : 'var(--border)'}`,
          background: selectMode ? 'rgba(99,102,241,0.1)' : 'transparent',
          color: selectMode ? '#818cf8' : 'var(--text-secondary)',
          fontSize: 11,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => {
          if (!selectMode) {
            e.currentTarget.style.borderColor = 'var(--text-muted)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }
        }}
        onMouseLeave={e => {
          if (!selectMode) {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }
        }}
      >
        {selectMode ? t('session.exitSelect') : t('session.selectMode')}
      </button>

      <button
        onClick={onExport}
        title={t('dept.exportSessionsTitle')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 10px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontSize: 11,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(34,197,94,0.4)'
          e.currentTarget.style.color = '#22c55e'
          e.currentTarget.style.background = 'rgba(34,197,94,0.06)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.color = 'var(--text-secondary)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {t('dept.export')}
      </button>

      <button
        onClick={onOpenFiles}
        title={t('dept.files')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 11px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontSize: 12,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'
          e.currentTarget.style.color = '#818cf8'
          e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.color = 'var(--text-secondary)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <FolderOpen size={13} />
        {t('dept.files')}
      </button>

      {/* The handbook is the desk's standing rules. The dot says "there is one",
          so an empty handbook is distinguishable without opening the dialog. */}
      <button
        onClick={onOpenHandbook}
        title={t('dept.handbook')}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 10px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'transparent',
          color: dept.handbook?.trim() ? '#818cf8' : 'var(--text-secondary)',
          fontSize: 11, cursor: 'pointer', flexShrink: 0,
          transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
          e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <BookOpen size={12} />
        {t('dept.handbook')}
        {dept.handbook?.trim() && (
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#818cf8' }} />
        )}
      </button>

      <div style={{ display: 'flex', gap: 2, background: 'var(--bg-hover)', borderRadius: 6, padding: 2, flexShrink: 0 }}>
        {SORT_OPTIONS.map(([val, label]) => (
          <button
            key={val}
            onClick={() => onSortChange(val)}
            style={{
              padding: '3px 7px',
              borderRadius: 4,
              border: 'none',
              background: sortOrder === val ? 'rgba(99,102,241,0.25)' : 'transparent',
              color: sortOrder === val ? '#6366f1' : 'var(--text-muted)',
              fontSize: 10,
              cursor: 'pointer',
              fontWeight: sortOrder === val ? 600 : 400,
              transition: 'all 0.15s ease',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        onClick={onNewSession}
        title={t('dept.newSession')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '9px 20px',
          borderRadius: 8,
          border: 'none',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
          color: 'rgba(255,255,255,0.95)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'opacity 0.15s, box-shadow 0.15s',
          boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.opacity = '0.88'
          e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.45)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.opacity = '1'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.35)'
        }}
      >
        <MessageSquarePlus size={13} />
        {t('dept.newSession')}
        <kbd style={{
          fontSize: 9,
          background: 'var(--bg-input)',
          borderRadius: 3,
          padding: '0px 4px',
          lineHeight: '14px',
          fontFamily: 'monospace',
          marginLeft: 2,
        }}>N</kbd>
      </button>
    </div>
  )
}
