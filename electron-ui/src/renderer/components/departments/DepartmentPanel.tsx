// DepartmentPanel — sidebar panel listing departments (部门) and allowing add/edit/delete
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Building2, Plus, MoreHorizontal, Pencil, Trash2, FolderOpen, Check, X, FolderPlus, ChevronsUpDown, ChevronsDownUp, GripVertical, ChevronRight, LogIn } from 'lucide-react'
import { useDepartmentStore, useSessionStore, Department } from '../../store'
import { useUiStore } from '../../store'
import { useT } from '../../i18n'

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

// DEPARTMENT_COLORS: rotation palette for auto-assigned colors
const DEPT_COLORS = ['#6366f1', '#fbbf24', '#4ade80', '#f87171', '#818cf8', '#a78bfa', '#ec4899', '#14b8a6']

// Extract folder name from a full path (last segment)
function folderName(p: string): string {
  const norm = p.replace(/\\/g, '/')
  const parts = norm.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}

function normalizePath(p: string, homeDir?: string): string {
  let normalized = p.replace(/\\/g, '/')
  if (homeDir && normalized.startsWith('~/')) {
    normalized = homeDir.replace(/\/+$/, '') + normalized.slice(1)
  } else if (homeDir && normalized === '~') {
    normalized = homeDir.replace(/\/+$/, '')
  }
  return normalized.replace(/\/+$/, '')
}

function formatLastActive(ts: number, t: (key: string) => string): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return t('dept.justNow')
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

// ── AddDepartmentForm ──────────────────────────────────────────────────────────
function AddDepartmentForm({ onDone }: { onDone: () => void }) {
  const t = useT()
  const addDepartment = useDepartmentStore(s => s.addDepartment)
  const setActiveDepartmentId = useDepartmentStore(s => s.setActiveDepartmentId)
  const setMainView = useUiStore(s => s.setMainView)
  const departments = useDepartmentStore(s => s.departments)

  const [name, setName] = useState('')
  const [directory, setDirectory] = useState('')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderPath, setNewFolderPath] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [nameFocused, setNameFocused] = useState(false)

  const pickDir = async () => {
    const p = await window.electronAPI.fsShowOpenDialog()
    if (p) {
      setDirectory(p)
      if (!name.trim()) setName(folderName(p))
    }
  }

  const createFolder = async () => {
    if (!newFolderPath.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      await window.electronAPI.fsEnsureDir(newFolderPath.trim())
      setDirectory(newFolderPath.trim())
      if (!name.trim()) setName(folderName(newFolderPath.trim()))
      setNewFolderMode(false)
    } catch (e) {
      setCreateError(String(e))
    } finally {
      setCreating(false)
    }
  }

  const submit = () => {
    if (!name.trim() || !directory) return
    const color = DEPT_COLORS[departments.length % DEPT_COLORS.length]
    const dept = addDepartment({ name: name.trim(), directory, color })
    setActiveDepartmentId(dept.id)
    setMainView('department')
    onDone()
  }

  return (
    <div style={{
      padding: '14px 12px',
      background: 'rgba(255,255,255,0.025)',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-muted)',
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
      }}>
        {t('dept.addTitle')}
      </div>

      {/* Name input */}
      <input
        autoFocus
        placeholder={t('dept.namePlaceholder')}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onDone() }}
        onFocus={() => setNameFocused(true)}
        onBlur={() => setNameFocused(false)}
        style={{
          width: '100%',
          padding: '6px 9px',
          borderRadius: 6,
          border: `1px solid ${nameFocused ? 'rgba(99,102,241,0.40)' : 'var(--border)'}`,
          background: 'var(--bg-hover)',
          color: 'var(--text-primary)',
          fontSize: 12,
          marginBottom: 7,
          boxSizing: 'border-box',
          outline: 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: nameFocused ? '0 0 0 3px rgba(99,102,241,0.10)' : 'none',
        }}
      />

      {/* Directory selection */}
      {directory ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 9px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'rgba(99,102,241,0.06)',
          marginBottom: 7,
        }}>
          <FolderOpen size={11} color="#6366f1" style={{ flexShrink: 0 }} />
          <span style={{
            flex: 1,
            fontSize: 10,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {directory}
          </span>
          <button
            onClick={() => setDirectory('')}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 2,
              display: 'flex',
              borderRadius: 3,
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <X size={10} />
          </button>
        </div>
      ) : newFolderMode ? (
        /* New folder path input */
        <div style={{ marginBottom: 7 }}>
          <input
            autoFocus
            placeholder={t('dept.newFolderPath')}
            value={newFolderPath}
            onChange={e => setNewFolderPath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setNewFolderMode(false) }}
            style={{
              width: '100%',
              padding: '6px 9px',
              borderRadius: 6,
              border: '1px solid rgba(99,102,241,0.40)',
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              fontSize: 11,
              boxSizing: 'border-box',
              outline: 'none',
              fontFamily: 'monospace',
              marginBottom: 5,
              boxShadow: '0 0 0 3px rgba(99,102,241,0.10)',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          />
          {createError && (
            <div style={{
              fontSize: 10,
              color: '#f87171',
              marginBottom: 5,
              padding: '3px 6px',
              background: 'rgba(239,68,68,0.08)',
              borderRadius: 4,
            }}>
              {createError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              onClick={createFolder}
              disabled={creating || !newFolderPath.trim()}
              style={{
                flex: 1,
                padding: '5px 0',
                borderRadius: 7,
                border: 'none',
                background: creating
                  ? 'var(--border)'
                  : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                color: creating ? 'var(--text-muted)' : 'rgba(255,255,255,0.95)',
                fontSize: 11,
                fontWeight: 600,
                cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating ? 0.4 : 1,
                transition: 'box-shadow 0.15s ease, transform 0.15s ease',
              }}
              onMouseEnter={e => { if (!creating) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              {creating ? t('dept.creating') : t('dept.createFolder')}
            </button>
            <button
              onClick={() => setNewFolderMode(false)}
              style={{
                padding: '5px 9px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg-hover)',
                color: 'var(--text-muted)',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              {t('dept.cancel')}
            </button>
          </div>
        </div>
      ) : (
        /* Directory pick buttons */
        <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
          <button
            onClick={pickDir}
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px dashed rgba(255,255,255,0.15)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'border-color 0.15s ease, color 0.15s ease, background 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#6366f1'
              e.currentTarget.style.color = '#6366f1'
              e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <FolderOpen size={11} />
            {t('dept.pickDirectory')}
          </button>
          <button
            onClick={() => setNewFolderMode(true)}
            title={t('dept.newFolder')}
            style={{
              padding: '6px 9px',
              borderRadius: 6,
              border: '1px dashed rgba(255,255,255,0.15)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'border-color 0.15s ease, color 0.15s ease, background 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#6366f1'
              e.currentTarget.style.color = '#6366f1'
              e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <FolderPlus size={11} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={submit}
          disabled={!name.trim() || !directory}
          style={{
            flex: 1,
            padding: '6px 0',
            borderRadius: 7,
            border: 'none',
            background: (!name.trim() || !directory)
              ? 'rgba(99,102,241,0.25)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            color: (!name.trim() || !directory) ? 'var(--text-muted)' : 'rgba(255,255,255,0.95)',
            fontSize: 11,
            fontWeight: 600,
            cursor: (!name.trim() || !directory) ? 'not-allowed' : 'pointer',
            opacity: (!name.trim() || !directory) ? 0.4 : 1,
            transition: 'box-shadow 0.15s ease, transform 0.15s ease',
            boxShadow: (!name.trim() || !directory) ? 'none' : '0 2px 8px rgba(99,102,241,0.3)',
          }}
          onMouseEnter={e => { if (name.trim() && directory) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = name.trim() && directory ? '0 2px 8px rgba(99,102,241,0.3)' : 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          {t('dept.create')}
        </button>
        <button
          onClick={onDone}
          style={{
            padding: '6px 11px',
            borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'var(--bg-hover)',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          {t('dept.cancel')}
        </button>
      </div>
    </div>
  )
}

// ── DepartmentRow ──────────────────────────────────────────────────────────────
function DepartmentRow({
  dept, isActive, count, lastActive, forceCollapsed,
  draggingId, dragOverId, unreadCount,
  onDragStart, onDragEnd, onDragOver, onDrop,
}: {
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
  onDragOver: (e: React.DragEvent, id: string) => void
  onDrop: (id: string) => void
}) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(dept.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [focused, setFocused] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const confirmDeleteRef = useRef<HTMLDivElement>(null)
  const setActiveDepartmentId = useDepartmentStore(s => s.setActiveDepartmentId)
  const updateDepartment = useDepartmentStore(s => s.updateDepartment)
  const removeDepartment = useDepartmentStore(s => s.removeDepartment)
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

  useEffect(() => {
    if (!confirmDelete) return
    const handleClickOutside = (e: MouseEvent) => {
      if (confirmDeleteRef.current && !confirmDeleteRef.current.contains(e.target as Node)) {
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [confirmDelete])

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
          const colors = ['#6366f1', '#fbbf24', '#4ade80', '#f87171', '#818cf8', '#a78bfa', '#ec4899', '#14b8a6']
          const currentIdx = colors.indexOf(dept.color || '#6366f1')
          const nextColor = colors[(currentIdx + 1) % colors.length]
          updateDepartment(dept.id, { color: nextColor })
        }}
        onMouseDown={e => e.stopPropagation()}
        title="Click to change color"
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
            {dept.name}
          </span>
          {lastActive > 0 && !isCollapsed && (
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 3,
              lineHeight: 1.4,
            }}>
              {formatLastActive(lastActive, t)}
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
        <div
          ref={menuRef}
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
            onClick={() => { setMenuOpen(false); setEditing(true); setEditName(dept.name) }}
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
            onClick={handleDelete}
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
      )}

      {confirmDelete && (
        <div
          ref={confirmDeleteRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', right: 8, top: '100%', zIndex: 200,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 9, padding: '10px 12px', minWidth: 200,
            boxShadow: '0 12px 40px rgba(0,0,0,0.65), 0 4px 16px rgba(239,68,68,0.12)',
            animation: 'slideUp 0.15s ease',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>{t('dept.confirmDelete')}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { removeDepartment(dept.id); setConfirmDelete(false); if (isActive) useUiStore.getState().setMainView('chat') }}
              style={{ flex: 1, padding: '5px 0', borderRadius: 5, border: 'none', background: '#f87171', color: 'rgba(255,255,255,0.95)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.85)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f87171' }}
            >
              {t('dept.deleteConfirm')}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s ease' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {t('dept.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── DepartmentPanel ────────────────────────────────────────────────────────────
export default function DepartmentPanel() {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const activeDepartmentId = useDepartmentStore(s => s.activeDepartmentId)
  const addDepartment = useDepartmentStore(s => s.addDepartment)
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
  const handleDragOver = (e: React.DragEvent, deptId: string) => {
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
      const deptDir = normalizePath(dept.directory, homeDir)
      const deptSessions = sessions.filter(s => normalizePath(s.project, homeDir) === deptDir)
      const unreadCount = deptSessions.filter(s => (unreadCounts[s.sessionId] ?? 0) > 0).length
      stats[dept.id] = {
        count: deptSessions.length,
        lastActive: deptSessions.length > 0 ? Math.max(...deptSessions.map(s => s.timestamp)) : 0,
        unreadCount,
      }
    }
    return stats
  }, [departments, sessions, homeDir, unreadCounts])

  // Auto-import sessions into departments by project directory when no departments exist
  useEffect(() => {
    if (departments.length > 0) return
    if (sessions.length === 0) return

    // Collect unique project directories from sessions
    const dirs = new Map<string, string>() // directory → derived name
    for (const s of sessions) {
      if (s.project && !dirs.has(s.project)) {
        dirs.set(s.project, folderName(s.project))
      }
    }
    if (dirs.size === 0) return

    let colorIdx = 0
    dirs.forEach((name, directory) => {
      addDepartment({ name, directory, color: DEPT_COLORS[colorIdx++ % DEPT_COLORS.length] })
    })
  }, [sessions, departments.length]) // only run when sessions load or departments change

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
      {/* Header */}
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
          {departments.length > 0 && (
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
              {departments.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {departments.length > 0 && (
            <button
              onClick={() => setForceCollapsed(fc => fc === true ? false : true)}
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
            onClick={() => setShowAddForm(!showAddForm)}
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
              <kbd style={{ fontSize: 9, background: 'var(--border)', borderRadius: 3, padding: '0 4px', border: '1px solid rgba(255,255,255,0.15)' }}>N</kbd>
              <span>{t('dept.toCreate')}</span>
            </div>
          </div>
        ) : (
          departments.map(dept => (
            <DepartmentRow
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

      {showAddForm && <AddDepartmentForm onDone={() => setShowAddForm(false)} />}

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
            color: 'rgba(255,255,255,0.6)',
          }}>N</kbd>
        </button>
      )}
    </div>
  )
}
