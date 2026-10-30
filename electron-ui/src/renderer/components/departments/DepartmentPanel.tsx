// DepartmentPanel — sidebar panel listing departments (部门) and allowing add/edit/delete
import { useState, useEffect, useMemo, type DragEvent } from 'react'
import { Plus } from 'lucide-react'
import { useDepartmentStore, useSessionStore, useTaskStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { groupSessionsByResolvedDept } from './deptBrief.data'
import DeptPanelHeader from './DeptPanelHeader'
import DeptAddForm from './DeptAddForm'
import DeptRow from './DeptRow'

// The list shares the global 6px scrollbar so its right gutter lines up with
// the archive ledger's: same thumb width, same 3px radius, same track.
const SCROLLBAR_STYLE = `
  .dept-panel-scroll::-webkit-scrollbar,
  .sidebar-session-scroll::-webkit-scrollbar { width: 6px; }
  .dept-panel-scroll::-webkit-scrollbar-thumb,
  .sidebar-session-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  .dept-panel-scroll::-webkit-scrollbar-track,
  .sidebar-session-scroll::-webkit-scrollbar-track { background: transparent; }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
`

export default function DepartmentPanel() {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const activeDepartmentId = useDepartmentStore(s => s.activeDepartmentId)
  const reorderDepartments = useDepartmentStore(s => s.reorderDepartments)
  const sessions = useSessionStore(s => s.sessions)
  const homeDir = useSessionStore(s => s.homeDir)
  // A manual filing changes which row a conversation is counted under, so the
  // sidebar subscribes to the map rather than reading it once.
  const filings = useDepartmentStore(s => s.filings)
  // Task conversations count for the department their task is routed to, so the
  // sidebar's headcounts follow routes as well as folders and filings.
  const tasks = useTaskStore(s => s.tasks)
  const unreadCounts = useUiStore(s => s.unreadCounts)
  const [showAddForm, setShowAddForm] = useState(false)
  // null = respect individual row state, true = all collapsed, false = all expanded
  const [forceCollapsed, setForceCollapsed] = useState<boolean | null>(null)

  // Drag-to-reorder state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const handleDragStart = (deptId: string) => setDraggingId(deptId)
  const handleDragEnd = () => { setDraggingId(null); setDragOverId(null) }
  const handleDragOver = (e: DragEvent, deptId: string) => {
    e.preventDefault()
    setDragOverId(deptId)
  }
  const handleDrop = (targetDeptId: string) => {
    if (!draggingId || draggingId === targetDeptId) return
    const depts = [...departments]
    const fromIdx = depts.findIndex(d => d.id === draggingId)
    const toIdx = depts.findIndex(d => d.id === targetDeptId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = depts.splice(fromIdx, 1)
    depts.splice(toIdx, 0, moved)
    reorderDepartments(depts)
    setDraggingId(null)
    setDragOverId(null)
  }

  const deptStats = useMemo(() => {
    // Exact node ownership, unchanged from the old directory predicate: the
    // sidebar never folded a team's conversations into its department.
    const { byDept } = groupSessionsByResolvedDept(sessions, {
      departments,
      filings,
      homeDir,
      tasks,
    })
    const stats: Record<string, { count: number; lastActive: number; unreadCount: number }> = {}
    for (const dept of departments) {
      const deptSessions = byDept[dept.id] ?? []
      const unreadCount = deptSessions.filter(s => (unreadCounts[s.sessionId] ?? 0) > 0).length
      stats[dept.id] = {
        count: deptSessions.length,
        lastActive: deptSessions.length > 0 ? Math.max(...deptSessions.map(s => s.timestamp)) : 0,
        unreadCount,
      }
    }
    return stats
  }, [departments, sessions, filings, homeDir, tasks, unreadCounts])

  // Keyboard shortcut: press N to open the create-department form
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setShowAddForm(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}>
      <style>{SCROLLBAR_STYLE}</style>
      <DeptPanelHeader
        departmentCount={departments.length}
        showAddForm={showAddForm}
        forceCollapsed={forceCollapsed}
        onToggleCollapseAll={() => setForceCollapsed(fc => fc === true ? false : true)}
        onToggleAddForm={() => setShowAddForm(!showAddForm)}
      />

      {/* Department list */}
      {/* No `scrollbarWidth: 'thin'` here: in Chromium it overrides the
          ::-webkit-scrollbar rules above and left this list with a narrower
          bar than the archive ledger. */}
      <div className="dept-panel-scroll sidebar-session-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {departments.length === 0 && !showAddForm ? (
          <div style={{
            padding: '32px 16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
          }}>
            {/* Same 64px / 16px-radius tile as the archive's empty states. */}
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              fontSize: 28,
              flexShrink: 0,
              padding: 16,
            }}>
              📂
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              {t('dept.panelTitle')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6, maxWidth: 180 }}>
              {t('dept.emptyHint')}
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                padding: '7px 18px',
                borderRadius: 6,
                border: '1px solid var(--accent-border)',
                background: 'var(--accent-bg)',
                color: 'var(--accent-text)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--accent-border)'
                e.currentTarget.style.borderColor = 'var(--accent)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--accent-bg)'
                e.currentTarget.style.borderColor = 'var(--accent-border)'
              }}
            >
              + {t('dept.create')}
            </button>
            <div style={{
              marginTop: 14,
              fontSize: 10,
              color: 'var(--text-muted)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span>{t('dept.pressToCreate')}</span>
              <kbd style={{ fontSize: 9, background: 'var(--bg-active)', borderRadius: 3, padding: '0 4px', border: '1px solid var(--border)' }}>N</kbd>
              <span>{t('dept.toCreate')}</span>
            </div>
          </div>
        ) : (
          departments.map(dept => (
            <DeptRow
              key={dept.id}
              dept={dept}
              isActive={dept.id === activeDepartmentId}
              count={deptStats[dept.id]?.count ?? 0}
              lastActive={deptStats[dept.id]?.lastActive ?? 0}
              unreadCount={deptStats[dept.id]?.unreadCount ?? 0}
              forceCollapsed={forceCollapsed}
              draggingId={draggingId}
              dragOverId={dragOverId}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          ))
        )}
      </div>

      {showAddForm && <DeptAddForm onDone={() => setShowAddForm(false)} />}

      {/* Add department button — full width dashed */}
      {!showAddForm && departments.length > 0 && (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            margin: '6px 10px 10px',
            padding: '7px 10px',
            border: '1px dashed var(--accent-border)',
            borderRadius: 6,
            background: 'var(--accent-bg)',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
            width: 'calc(100% - 20px)',
            transition: 'border-color 0.15s ease, color 0.15s ease, background 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent-text)'
            e.currentTarget.style.background = 'var(--accent-border)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--accent-border)'
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.background = 'var(--accent-bg)'
          }}
        >
          <Plus size={12} />
          {t('dept.add')}
          <kbd style={{
            fontSize: 9,
            background: 'var(--bg-active)',
            borderRadius: 3,
            padding: '0px 4px',
            lineHeight: '14px',
            fontFamily: 'monospace',
            marginLeft: 4,
            color: 'var(--text-muted)',
          }}>N</kbd>
        </button>
      )}
    </div>
  )
}
