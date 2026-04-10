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
      padding: '12px 10px',
      background: 'var(--bg-input, rgba(255,255,255,0.04))',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {t('dept.addTitle')}
      </div>
      <input
        autoFocus
        placeholder={t('dept.namePlaceholder')}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onDone() }}
        style={{
          width: '100%',
          padding: '5px 8px',
          borderRadius: 5,
          border: '1px solid var(--border)',
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
          fontSize: 12,
          marginBottom: 6,
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />

      {/* Directory selection */}
      {directory ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', borderRadius: 5,
          border: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.03)',
          marginBottom: 6,
        }}>
          <FolderOpen size={11} color="var(--accent)" />
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {directory}
          </span>
          <button onClick={() => setDirectory('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 1, display: 'flex' }}>
            <X size={10} />
          </button>
        </div>
      ) : newFolderMode ? (
        /* New folder path input */
        <div style={{ marginBottom: 6 }}>
          <input
            autoFocus
            placeholder={t('dept.newFolderPath')}
            value={newFolderPath}
            onChange={e => setNewFolderPath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setNewFolderMode(false) }}
            style={{
              width: '100%', padding: '5px 8px', borderRadius: 5,
              border: '1px solid var(--accent)', background: 'var(--bg-input)',
              color: 'var(--text-primary)', fontSize: 11, boxSizing: 'border-box', outline: 'none',
              fontFamily: 'monospace', marginBottom: 4,
            }}
          />
          {createError && <div style={{ fontSize: 10, color: '#ef4444', marginBottom: 4 }}>{createError}</div>}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={createFolder}
              disabled={creating || !newFolderPath.trim()}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 4, border: 'none',
                background: creating ? 'var(--border)' : 'var(--accent)',
                color: '#fff', fontSize: 10, fontWeight: 600, cursor: creating ? 'default' : 'pointer',
              }}
            >
              {creating ? t('dept.creating') : t('dept.createFolder')}
            </button>
            <button
              onClick={() => setNewFolderMode(false)}
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}
            >
              {t('dept.cancel')}
            </button>
          </div>
        </div>
      ) : (
        /* Directory pick buttons */
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <button
            onClick={pickDir}
            style={{
              flex: 1, padding: '5px 8px', borderRadius: 5,
              border: '1px dashed var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <FolderOpen size={11} />
            {t('dept.pickDirectory')}
          </button>
          <button
            onClick={() => setNewFolderMode(true)}
            title={t('dept.newFolder')}
            style={{
              padding: '5px 8px', borderRadius: 5,
              border: '1px dashed var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
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
            flex: 1, padding: '5px 0', borderRadius: 5, border: 'none',
            background: (!name.trim() || !directory) ? 'var(--border)' : 'var(--accent)',
            color: '#fff', fontSize: 11, fontWeight: 600,
            cursor: (!name.trim() || !directory) ? 'default' : 'pointer',
          }}
        >
          {t('dept.create')}
        </button>
        <button
          onClick={onDone}
          style={{
            padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
          }}
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
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 6, marginBottom: 2,
        cursor: editing ? 'default' : 'pointer',
        background: isActive ? 'rgba(255,255,255,0.08)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        position: 'relative',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dept.color || 'var(--accent)', flexShrink: 0 }} />

      {editing ? (
        <input
          autoFocus
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1, background: 'var(--bg-input)', border: '1px solid var(--accent)',
            borderRadius: 4, padding: '2px 6px', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
          }}
        />
      ) : (
        <span style={{
          flex: 1, fontSize: 12, fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {dept.name}
        </span>
      )}

      {editing && (
        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={saveEdit} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 2 }}>
            <Check size={12} />
          </button>
          <button onClick={() => setEditing(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={12} />
          </button>
        </div>
      )}

      {!editing && (hovered || menuOpen) && (
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, borderRadius: 3, display: 'flex', flexShrink: 0 }}
        >
          <MoreHorizontal size={13} />
        </button>
      )}

      {menuOpen && (
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', right: 8, top: '100%', zIndex: 200,
            background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
            borderRadius: 8, boxShadow: 'var(--popup-shadow)', minWidth: 130, padding: 4,
          }}
        >
          <button
            onClick={() => { setMenuOpen(false); setEditing(true); setEditName(dept.name) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', borderRadius: 5 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >
            <Pencil size={12} /> {t('dept.rename')}
          </button>
          <button
            onClick={handleDelete}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444', borderRadius: 5 }}
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
        padding: '10px 10px 6px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Building2 size={13} color="var(--text-muted)" />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('dept.panelTitle')}
          </span>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          title={t('dept.add')}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 3, borderRadius: 4, display: 'flex' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Department list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px 0' }}>
        {departments.length === 0 && !showAddForm ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
            <Building2 size={28} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: 8 }} />
            <div>{t('dept.emptyHint')}</div>
          </div>
        ) : (
          departments.map(dept => (
            <DepartmentRow key={dept.id} dept={dept} isActive={dept.id === activeDepartmentId} />
          ))
        )}
      </div>

      {showAddForm && <AddDepartmentForm onDone={() => setShowAddForm(false)} />}

      {!showAddForm && departments.length > 0 && (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            margin: '6px 10px 10px', padding: '6px 10px',
            border: '1px dashed var(--border)', borderRadius: 6,
            background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <Plus size={12} />
          {t('dept.add')}
        </button>
      )}
    </div>
  )
}
