// The department view's top bar: identity, breadcrumb, and the handful of
// actions that act on the whole department rather than on one employee.

import { ArrowLeft, BookOpen, ChevronRight, Download, FolderOpen, ListChecks, MessageSquarePlus, ScrollText } from 'lucide-react'
import type { Department } from '../../store'
import { useI18n } from '../../i18n'
import type { SortOrder } from './DepartmentDashboard.data'
import { deptDisplayName, kindOf } from './deptUtils'

const SORT_OPTIONS = [
  ['recent', 'dept.sortRecent'],
  ['oldest', 'dept.sortOldest'],
  ['msgs', 'dept.sortMsgs'],
] as const

// The breadcrumb names the node you are *on*, not "the level below a company".
// `parentDept` is set for any node with a parent — a department under a company,
// a team under a department, and even a company whose record somehow has a
// parent — so the label has to follow `kindOf`, the same rule the org chart uses
// to decide whether a node is a section, a card or a team strip.
const KIND_LABEL_KEY: Record<ReturnType<typeof kindOf>, string> = {
  // A tag, not the plural "teams" used in counts; capitalized like the other
  // two so the breadcrumb reads as one row of labels.
  team: 'dept.teamTag',
  department: 'dept.departmentTag',
  company: 'dept.companyTag',
}

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
  /** The brief panel is open below this header. */
  briefOpen: boolean
  onToggleBrief: () => void
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
  briefOpen,
  onToggleBrief,
  onSortChange,
  onNewSession,
}: DeptHeaderProps) {
  const { t, resolvedLocale } = useI18n()
  const deptName = deptDisplayName(dept, resolvedLocale)

  return (
    <div style={{
      // Three content rows (breadcrumb, title, directory) need ~44px. The old
      // fixed 56px box with 28px of padding left only 28px for them, so the
      // directory line fell out of the band. Let the band grow instead.
      minHeight: 56,
      height: 'auto',
      flexShrink: 0,
      background: 'var(--popup-bg)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '6px 20px',
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

      {/* Dept name + dir. `minWidth: 0` is what lets the flex child actually
          shrink: without it the title refuses to go below its content width and
          the action buttons win the space contest at 900px. */}
      <div className="dept-name-block" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {/* Breadcrumb — every nested node (department or team) is a desk of its
            own, so its page says which node it sits under and offers the way
            back up. The trailing label is the current node's kind. It truncates
            rather than wraps once the header gets tight. */}
        {parentDept && (
          <div className="dept-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-subtle)', marginBottom: 2, minWidth: 0, whiteSpace: 'nowrap' }}>
            <button
              onClick={() => onSelectDept(parentDept.id)}
              title={t('dept.backToParent')}
              style={{
                display: 'flex', alignItems: 'center', gap: 2, minWidth: 0,
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'var(--text-subtle)', fontSize: 10, maxWidth: 160,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-text)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-subtle)' }}
            >
              <ArrowLeft size={9} style={{ flexShrink: 0 }} />
              <span
                title={deptDisplayName(parentDept, resolvedLocale)}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {deptDisplayName(parentDept, resolvedLocale)}
              </span>
            </button>
            <ChevronRight size={9} style={{ opacity: 0.5, flexShrink: 0 }} />
            <span style={{ opacity: 0.7, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(KIND_LABEL_KEY[kindOf(dept)])}</span>
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
          minWidth: 0,
        }}>
          <span
            title={deptName}
            style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {deptName}
          </span>
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
          color: 'var(--text-subtle)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 1,
          minWidth: 0,
        }}>
          <FolderOpen size={10} style={{ opacity: 0.7, flexShrink: 0 }} />
          <span title={dept.directory} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dept.directory}</span>
        </div>
      </div>

      <button
        onClick={onToggleSelect}
        className="dept-action-btn"
        aria-label={selectMode ? t('session.exitSelect') : t('session.selectMode')}
        title={selectMode ? t('session.exitSelect') : t('session.selectMode')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          borderRadius: 6,
          border: `1px solid ${selectMode ? 'rgba(99,102,241,0.7)' : 'var(--border)'}`,
          background: selectMode ? 'rgba(99,102,241,0.1)' : 'transparent',
          color: selectMode ? 'var(--accent-text)' : 'var(--text-secondary)',
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
        <ListChecks size={13} style={{ flexShrink: 0 }} />
        <span className="dept-action-label">{selectMode ? t('session.exitSelect') : t('session.selectMode')}</span>
      </button>

      <button
        onClick={onExport}
        className="dept-action-btn"
        aria-label={t('dept.export')}
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
        <Download size={13} style={{ flexShrink: 0 }} />
        <span className="dept-action-label">{t('dept.export')}</span>
      </button>

      <button
        onClick={onOpenFiles}
        className="dept-action-btn"
        aria-label={t('dept.files')}
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
          e.currentTarget.style.color = 'var(--accent-text)'
          e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.color = 'var(--text-secondary)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <FolderOpen size={13} />
        <span className="dept-action-label">{t('dept.files')}</span>
      </button>

      {/* The handbook is the desk's standing rules. The dot says "there is one",
          so an empty handbook is distinguishable without opening the dialog. */}
      <button
        onClick={onOpenHandbook}
        className="dept-action-btn"
        aria-label={t('dept.handbook')}
        title={t('dept.handbook')}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 10px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'transparent',
          color: dept.handbook?.trim() ? 'var(--accent-text)' : 'var(--text-secondary)',
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
        <span className="dept-action-label">{t('dept.handbook')}</span>
        {dept.handbook?.trim() && (
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-muted)' }} />
        )}
      </button>

      {/* The brief is a read-only excerpt of what is already on disk, so it sits
          with the other department-wide actions rather than in the roster. */}
      <button
        onClick={onToggleBrief}
        className="dept-action-btn"
        aria-label={t('dept.brief.open')}
        aria-pressed={briefOpen}
        title={t('dept.brief.open')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          borderRadius: 6,
          border: `1px solid ${briefOpen ? 'rgba(99,102,241,0.7)' : 'var(--border)'}`,
          background: briefOpen ? 'rgba(99,102,241,0.1)' : 'transparent',
          color: briefOpen ? 'var(--accent-text)' : 'var(--text-secondary)',
          fontSize: 11,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => {
          if (!briefOpen) {
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
            e.currentTarget.style.color = 'var(--accent-text)'
            e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
          }
        }}
        onMouseLeave={e => {
          if (!briefOpen) {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        <ScrollText size={12} style={{ flexShrink: 0 }} />
        <span className="dept-action-label">{t('dept.brief.title')}</span>
      </button>

      <div style={{ display: 'flex', gap: 2, background: 'var(--bg-hover)', borderRadius: 6, padding: 2, flexShrink: 0 }}>
        {SORT_OPTIONS.map(([val, labelKey]) => (
          <button
            key={val}
            onClick={() => onSortChange(val)}
            style={{
              padding: '3px 7px',
              borderRadius: 4,
              border: 'none',
              background: sortOrder === val ? 'rgba(99,102,241,0.25)' : 'transparent',
              color: sortOrder === val ? 'var(--accent-text-strong)' : 'var(--text-muted)',
              fontSize: 10,
              cursor: 'pointer',
              fontWeight: sortOrder === val ? 600 : 400,
              transition: 'all 0.15s ease',
            }}
          >
            {t(labelKey)}
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
          background: 'var(--cta-gradient)',
          color: '#ffffff',
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
        <span className="dept-new-label">{t('dept.newSession')}</span>
        <kbd className="dept-new-label" style={{
          fontSize: 9,
          background: 'rgba(0,0,0,0.22)',
          color: '#ffffff',
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
