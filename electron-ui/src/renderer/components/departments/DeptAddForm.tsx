// New-department form shown at the bottom of the sidebar panel.
//
// Templates are reached from here as well as the org chart, so the sidebar never
// has to grow its own seeding path: one dialog writes the folders.
import { useState } from 'react'
import { FolderOpen, X, FolderPlus, LayoutGrid } from 'lucide-react'
import { useDepartmentStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { DEPT_COLORS, baseName } from './deptUtils'
import DeptTemplatePicker from './DeptTemplatePicker'

export default function DeptAddForm({ onDone }: { onDone: () => void }) {
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
  const [showPresets, setShowPresets] = useState(false)

  const pickDir = async () => {
    const p = await window.electronAPI.fsShowOpenDialog()
    if (p) {
      setDirectory(p)
      if (!name.trim()) setName(baseName(p))
    }
  }

  const createFolder = async () => {
    if (!newFolderPath.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      await window.electronAPI.fsEnsureDir(newFolderPath.trim())
      setDirectory(newFolderPath.trim())
      if (!name.trim()) setName(baseName(newFolderPath.trim()))
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
      background: 'var(--bg-hover)',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-muted)',
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ flex: 1 }}>{t('dept.addTitle')}</span>
        {/* Same picker as the org chart — one code path writes the folders. */}
        <button
          onClick={() => setShowPresets(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#818cf8', fontSize: 10, textTransform: 'none', letterSpacing: 'normal',
            fontWeight: 600, padding: 0,
          }}
        >
          <LayoutGrid size={10} />{t('dept.presets.fromTemplate')}
        </button>
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
              border: '1px dashed var(--border)',
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
              e.currentTarget.style.borderColor = 'var(--border)'
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
              border: '1px dashed var(--border)',
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
              e.currentTarget.style.borderColor = 'var(--border)'
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

      {showPresets && (
        <DeptTemplatePicker
          onClose={() => setShowPresets(false)}
          onApplied={() => { setShowPresets(false); setMainView('department'); onDone() }}
        />
      )}
    </div>
  )
}
