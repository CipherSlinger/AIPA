// DepartmentPanel — sidebar panel listing departments (部门) and allowing add/edit/delete
import { useState, useEffect, useMemo, type DragEvent } from 'react'
import { Plus } from 'lucide-react'
import { useDepartmentStore, useSessionStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { sessionMatchesDir } from './deptUtils'
import DeptPanelHeader from './DeptPanelHeader'
import DeptAddForm from './DeptAddForm'
import DeptRow from './DeptRow'

const SCROLLBAR_STYLE = `
  .dept-panel-scroll::-webkit-scrollbar,
  .sidebar-session-scroll::-webkit-scrollbar { width: 4px; }
  .dept-panel-scroll::-webkit-scrollbar-thumb,
  .sidebar-session-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
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
    const stats: Record<string, { count: number; lastActive: number; unreadCount: number }> = {}
    for (const dept of departments) {
      const dir = dept.directory
      const deptSessions = sessions.filter(s => sessionMatchesDir(s, dir, homeDir))
      const unreadCount = deptSessions.filter(s => (unreadCounts[s.sessionId] ?? 0) > 0).length
      stats[dept.id] = {
        count: deptSessions.length,
        lastActive: deptSessions.length > 0 ? Math.max(...deptSessions.map(s => s.timestamp)) : 0,
        unreadCount,
      }
    }
    return stats
  }, [departments, sessions, homeDir, unreadCounts])

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
      <div className="dept-panel-scroll sidebar-session-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', scrollbarWidth: 'thin' }}>
        {departments.length === 0 && !showAddForm ? (
          <div style={{
            padding: '32px 16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.15)',
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
                border: '1px solid rgba(99,102,241,0.4)',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.06))',
                color: '#6366f1',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(99,102,241,0.12))'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.2)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.06))'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
                e.currentTarget.style.boxShadow = 'none'
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
              opacity: 0.6,
            }}>
              <span>{t('dept.pressToCreate')}</span>
              <kbd style={{ fontSize: 9, background: 'var(--border)', borderRadius: 3, padding: '0 4px', border: '1px solid var(--border)' }}>N</kbd>
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
            border: '1px dashed rgba(99,102,241,0.3)',
            borderRadius: 7,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.05))',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
            width: 'calc(100% - 20px)',
            transition: 'border-color 0.15s ease, color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)'
            e.currentTarget.style.color = '#6366f1'
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(99,102,241,0.08))'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.1)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.05))'
            e.currentTarget.style.boxShadow = 'none'
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
