// One department in the sidebar list: selection, inline rename, and the
// drag-to-reorder handle. The popovers live in their own files; this row only
// owns their open/closed state.
import { useState, useEffect, useCallback, type DragEvent } from 'react'
import { MoreHorizontal, Check, X, GripVertical, ChevronRight, LogIn } from 'lucide-react'
import { useDepartmentStore, useUiStore, type Department } from '../../store'
import { useI18n } from '../../i18n'
import { DEPT_COLORS, deptDisplayName, formatRelativeTime } from './deptUtils'
import DeptRowMenu from './DeptRowMenu'
import DeptDeleteConfirm from './DeptDeleteConfirm'

interface Props {
  dept: Department
  isActive: boolean
  count: number
  lastActive: number
  forceCollapsed?: boolean | null
  draggingId: string | null
  dragOverId: string | null
  unreadCount: number
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent, id: string) => void
  onDrop: (id: string) => void
}

export default function DeptRow({
  dept, isActive, count, lastActive, forceCollapsed,
  draggingId, dragOverId, unreadCount,
  onDragStart, onDragEnd, onDragOver, onDrop,
}: Props) {
  const { t, resolvedLocale } = useI18n()
  const name = deptDisplayName(dept, resolvedLocale)
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [focused, setFocused] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const setActiveDepartmentId = useDepartmentStore(s => s.setActiveDepartmentId)
  const updateDepartment = useDepartmentStore(s => s.updateDepartment)
  const setMainView = useUiStore(s => s.setMainView)

  const select = () => {
    setActiveDepartmentId(dept.id)
    setMainView('department')
  }

  const toggleCollapse = () => {
    if (!editing) setIsCollapsed(c => !c)
  }

  const saveEdit = () => {
    if (editName.trim()) updateDepartment(dept.id, { name: editName.trim() })
    setEditing(false)
  }

  const handleDelete = () => {
    setMenuOpen(false)
    setConfirmDelete(true)
  }

  // Stable identity keeps the confirm popover from re-binding its outside-click
  // listener on every hover-driven re-render of this row.
  const closeConfirm = useCallback(() => setConfirmDelete(false), [])

  // Sync isCollapsed with forceCollapsed override from parent
  useEffect(() => {
    if (forceCollapsed !== null && forceCollapsed !== undefined) {
      setIsCollapsed(forceCollapsed)
    }
  }, [forceCollapsed])

  return (
    <div
      draggable={!editing}
      onDragStart={() => onDragStart(dept.id)}
      onDragEnd={onDragEnd}
      onDragOver={e => onDragOver(e, dept.id)}
      onDrop={() => onDrop(dept.id)}
      onClick={editing ? undefined : toggleCollapse}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); setConfirmDelete(false) }}
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={e => {
        if (editing) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggleCollapse()
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && !editing) {
          e.preventDefault()
          setMenuOpen(false)
          setConfirmDelete(true)
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 8,
        marginBottom: 2,
        cursor: editing ? 'default' : 'pointer',
        background: isActive
          ? 'rgba(99,102,241,0.10)'
          : hovered || focused
          ? 'var(--bg-hover)'
          : 'transparent',
        boxShadow: hovered || focused ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
        // Left accent bar for active/focused state
        borderLeft: isActive
          ? '3px solid rgba(99,102,241,0.75)'
          : hovered || focused
          ? `3px solid ${dept.color ? dept.color + '66' : 'rgba(99,102,241,0.4)'}`
          : '3px solid transparent',
        paddingLeft: (isActive || hovered || focused) ? 9 : 12,
        position: 'relative',
        transition: 'all 0.15s ease',
        outline: 'none',
        opacity: draggingId === dept.id ? 0.4 : 1,
        borderTop: dragOverId === dept.id && draggingId !== dept.id
          ? '2px solid #6366f1'
          : '2px solid transparent',
      }}
    >
      {/* Drag handle */}
      <GripVertical
        size={12}
        style={{
          color: 'var(--text-muted)',
          opacity: hovered ? 0.5 : 0,
          cursor: 'grab',
          flexShrink: 0,
          transition: 'opacity 0.15s',
        }}
      />

      {/* Color dot — click to cycle color */}
      <button
        onClick={e => {
          e.stopPropagation()
          const currentIdx = DEPT_COLORS.indexOf(dept.color || '#6366f1')
          const nextColor = DEPT_COLORS[(currentIdx + 1) % DEPT_COLORS.length]
          updateDepartment(dept.id, { color: nextColor })
        }}
        onMouseDown={e => e.stopPropagation()}
        title={t('dept.changeColor')}
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: dept.color || '#6366f1',
          flexShrink: 0,
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          boxShadow: hovered ? '0 0 0 2px var(--text-muted)' : '0 0 0 1.5px var(--border)',
          transition: 'box-shadow 0.15s ease, transform 0.15s ease',
          transform: hovered ? 'scale(1.2)' : 'scale(1)',
        }}
      />

      {editing ? (
        <input
          autoFocus
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1,
            background: 'var(--bg-hover)',
            border: '1px solid rgba(99,102,241,0.40)',
            borderRadius: 5,
            padding: '2px 7px',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
            boxShadow: '0 0 0 3px rgba(99,102,241,0.10)',
            transition: 'border-color 0.15s ease',
          }}
        />
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block',
            fontSize: 14,
            fontWeight: isActive ? 700 : 500,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}>
            {name}
          </span>
          {lastActive > 0 && !isCollapsed && (
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 3,
              lineHeight: 1.4,
            }}>
              {formatRelativeTime(lastActive, t, resolvedLocale)}
            </div>
          )}
        </div>
      )}

      {!editing && count > 0 && (
        <span style={{
          marginLeft: 'auto',
          fontSize: 10,
          fontWeight: 700,
          color: '#818cf8',
          background: 'rgba(99,102,241,0.15)',
          borderRadius: 6,
          padding: '1px 7px',
          lineHeight: '16px',
          flexShrink: 0,
          border: '1px solid rgba(99,102,241,0.25)',
          transition: 'all 0.15s ease',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}>
          {count}
        </span>
      )}

      {!editing && unreadCount > 0 && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.95)',
          background: '#f87171',
          borderRadius: 20,
          padding: '1px 5px',
          lineHeight: '14px',
          flexShrink: 0,
          minWidth: 14,
          textAlign: 'center',
        }}>
          {unreadCount}
        </span>
      )}

      {/* Collapse chevron indicator */}
      {!editing && (
        <ChevronRight
          size={11}
          style={{
            color: 'var(--text-muted)',
            flexShrink: 0,
            transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
            transition: 'transform 0.15s ease, opacity 0.15s ease',
            opacity: hovered || focused ? 0.7 : 0.3,
          }}
        />
      )}

      {/* "Enter" button — shown on hover, navigates into the dept */}
      {!editing && (hovered || isActive) && (
        <button
          onClick={e => { e.stopPropagation(); select() }}
          onMouseDown={e => e.stopPropagation()}
          title={t('dept.enter')}
          style={{
            border: 'none',
            background: isActive ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.12)',
            cursor: 'pointer',
            color: isActive ? '#818cf8' : 'rgba(99,102,241,0.85)',
            padding: '3px 7px',
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.04em',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.28)'
            e.currentTarget.style.color = '#818cf8'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.12)'
            e.currentTarget.style.color = isActive ? '#818cf8' : 'rgba(99,102,241,0.85)'
          }}
        >
          <LogIn size={9} />
        </button>
      )}

      {editing && (
        <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={saveEdit}
            style={{
              border: 'none',
              background: 'rgba(99,102,241,0.15)',
              cursor: 'pointer',
              color: '#6366f1',
              padding: '3px 5px',
              borderRadius: 4,
              display: 'flex',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)' }}
          >
            <Check size={11} />
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{
              border: 'none',
              background: 'var(--bg-hover)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '3px 5px',
              borderRadius: 4,
              display: 'flex',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {!editing && (hovered || menuOpen) && (
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          style={{
            border: 'none',
            background: menuOpen ? 'var(--border)' : 'none',
            cursor: 'pointer',
            color: menuOpen ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: 4,
            borderRadius: '50%',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={e => {
            if (!menuOpen) {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.color = 'var(--text-muted)'
            }
          }}
        >
          <MoreHorizontal size={13} />
        </button>
      )}

      {menuOpen && (
        <DeptRowMenu
          onRename={() => { setMenuOpen(false); setEditing(true); setEditName(name) }}
          onDelete={handleDelete}
        />
      )}

      {confirmDelete && (
        <DeptDeleteConfirm
          dept={dept}
          isActive={isActive}
          onClose={closeConfirm}
        />
      )}
    </div>
  )
}
