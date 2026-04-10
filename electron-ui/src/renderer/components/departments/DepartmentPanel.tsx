// DepartmentPanel — sidebar panel listing departments (部门) and allowing add/edit/delete
import React, { useState, useRef, useEffect } from 'react'
import { Building2, Plus, MoreHorizontal, Pencil, Trash2, FolderOpen, Check, X, FolderPlus } from 'lucide-react'
import { useDepartmentStore, useSessionStore, Department } from '../../store'
import { useUiStore } from '../../store'
import { useT } from '../../i18n'

// DEPARTMENT_COLORS: rotation palette for auto-assigned colors
const DEPT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

// Extract folder name from a full path (last segment)
function folderName(p: string): string {
  const norm = p.replace(/\\/g, '/')
  const parts = norm.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
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
      borderTop: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-muted)',
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
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
          border: `1px solid ${nameFocused ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
          background: 'rgba(255,255,255,0.04)',
          color: 'var(--text-primary)',
          fontSize: 12,
          marginBottom: 7,
          boxSizing: 'border-box',
          outline: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: nameFocused ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
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
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(99,102,241,0.06)',
          marginBottom: 7,
        }}>
          <FolderOpen size={11} color="var(--accent)" style={{ flexShrink: 0 }} />
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
              transition: 'color 0.12s',
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
              border: '1px solid var(--accent)',
              background: 'rgba(99,102,241,0.06)',
              color: 'var(--text-primary)',
              fontSize: 11,
              boxSizing: 'border-box',
              outline: 'none',
              fontFamily: 'monospace',
              marginBottom: 5,
              boxShadow: '0 0 0 3px rgba(99,102,241,0.12)',
            }}
          />
          {createError && (
            <div style={{
              fontSize: 10,
              color: '#ef4444',
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
                borderRadius: 5,
                border: 'none',
                background: creating ? 'rgba(255,255,255,0.08)' : 'var(--accent)',
                color: creating ? 'var(--text-muted)' : '#fff',
                fontSize: 11,
                fontWeight: 600,
                cursor: creating ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {creating ? t('dept.creating') : t('dept.createFolder')}
            </button>
            <button
              onClick={() => setNewFolderMode(false)}
              style={{
                padding: '5px 9px',
                borderRadius: 5,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
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
              transition: 'border-color 0.15s, color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.color = 'var(--accent)'
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
              transition: 'border-color 0.15s, color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.color = 'var(--accent)'
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
            borderRadius: 6,
            border: 'none',
            background: (!name.trim() || !directory) ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
            color: (!name.trim() || !directory) ? 'var(--text-muted)' : '#fff',
            fontSize: 11,
            fontWeight: 600,
            cursor: (!name.trim() || !directory) ? 'default' : 'pointer',
            transition: 'background 0.15s, box-shadow 0.15s',
            boxShadow: (!name.trim() || !directory) ? 'none' : '0 2px 8px rgba(99,102,241,0.3)',
          }}
        >
          {t('dept.create')}
        </button>
        <button
          onClick={onDone}
          style={{
            padding: '6px 11px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          {t('dept.cancel')}
        </button>
      </div>
    </div>
  )
}

// ── DepartmentRow ──────────────────────────────────────────────────────────────
function DepartmentRow({ dept, isActive }: { dept: Department; isActive: boolean }) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(dept.name)
  const menuRef = useRef<HTMLDivElement>(null)
  const setActiveDepartmentId = useDepartmentStore(s => s.setActiveDepartmentId)
  const updateDepartment = useDepartmentStore(s => s.updateDepartment)
  const removeDepartment = useDepartmentStore(s => s.removeDepartment)
  const setMainView = useUiStore(s => s.setMainView)

  const select = () => {
    setActiveDepartmentId(dept.id)
    setMainView('department')
  }

  const saveEdit = () => {
    if (editName.trim()) updateDepartment(dept.id, { name: editName.trim() })
    setEditing(false)
  }

  const handleDelete = () => {
    setMenuOpen(false)
    removeDepartment(dept.id)
    if (isActive) useUiStore.getState().setMainView('chat')
  }

  return (
    <div
      onClick={editing ? undefined : select}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false) }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 8,
        marginBottom: 2,
        cursor: editing ? 'default' : 'pointer',
        background: isActive
          ? 'rgba(99,102,241,0.12)'
          : hovered
          ? 'rgba(255,255,255,0.05)'
          : 'transparent',
        // Left accent bar for active state
        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
        paddingLeft: isActive ? 9 : 12,
        position: 'relative',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {/* Color dot */}
      <div style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: dept.color || 'var(--accent)',
        flexShrink: 0,
        boxShadow: '0 0 0 1.5px rgba(255,255,255,0.1)',
      }} />

      {editing ? (
        <input
          autoFocus
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--accent)',
            borderRadius: 5,
            padding: '2px 7px',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
            boxShadow: '0 0 0 3px rgba(99,102,241,0.15)',
          }}
        />
      ) : (
        <span style={{
          flex: 1,
          fontSize: 12,
          fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'color 0.12s',
        }}>
          {dept.name}
        </span>
      )}

      {editing && (
        <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={saveEdit}
            style={{
              border: 'none',
              background: 'rgba(99,102,241,0.15)',
              cursor: 'pointer',
              color: 'var(--accent)',
              padding: '3px 5px',
              borderRadius: 4,
              display: 'flex',
              transition: 'background 0.12s',
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
              background: 'rgba(255,255,255,0.05)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '3px 5px',
              borderRadius: 4,
              display: 'flex',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
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
            background: menuOpen ? 'rgba(255,255,255,0.1)' : 'none',
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
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
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
            border: '1px solid var(--popup-border)',
            borderRadius: 9,
            boxShadow: 'var(--popup-shadow)',
            minWidth: 135,
            padding: 4,
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
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
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
              color: '#ef4444',
              borderRadius: 6,
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >
            <Trash2 size={12} /> {t('dept.delete')}
          </button>
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
  const sessions = useSessionStore(s => s.sessions)
  const [showAddForm, setShowAddForm] = useState(false)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Building2 size={12} color="var(--text-muted)" style={{ opacity: 0.8 }} />
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {t('dept.panelTitle')}
          </span>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          title={t('dept.add')}
          style={{
            border: 'none',
            background: showAddForm ? 'rgba(99,102,241,0.15)' : 'none',
            cursor: 'pointer',
            color: showAddForm ? 'var(--accent)' : 'var(--text-muted)',
            padding: 4,
            borderRadius: 5,
            display: 'flex',
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            if (!showAddForm) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }
          }}
          onMouseLeave={e => {
            if (!showAddForm) {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.color = 'var(--text-muted)'
            }
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Department list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px 0' }}>
        {departments.length === 0 && !showAddForm ? (
          <div style={{
            padding: '28px 14px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 12,
            lineHeight: 1.65,
          }}>
            <Building2
              size={28}
              color="var(--text-muted)"
              style={{ opacity: 0.3, marginBottom: 10, display: 'block', margin: '0 auto 10px' }}
            />
            <div style={{ opacity: 0.7 }}>{t('dept.emptyHint')}</div>
          </div>
        ) : (
          departments.map(dept => (
            <DepartmentRow key={dept.id} dept={dept} isActive={dept.id === activeDepartmentId} />
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
            border: '1px dashed rgba(255,255,255,0.12)',
            borderRadius: 7,
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
            width: 'calc(100% - 20px)',
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <Plus size={12} />
          {t('dept.add')}
        </button>
      )}
    </div>
  )
}
