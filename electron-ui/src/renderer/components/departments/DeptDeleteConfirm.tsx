// Cascade warning before a department row is deleted.
//
// Deleting a node takes its subtree with it. Say so before it happens — the
// folders stay on disk, but the records do not come back.
import { useEffect, useMemo, useRef } from 'react'
import { useDepartmentStore, useUiStore, descendantIds, type Department } from '../../store'
import { useT } from '../../i18n'

interface Props {
  dept: Department
  isActive: boolean
  onClose: () => void
}

export default function DeptDeleteConfirm({ dept, isActive, onClose }: Props) {
  const t = useT()
  const removeDepartment = useDepartmentStore(s => s.removeDepartment)
  const allDepts = useDepartmentStore(s => s.departments)
  const wrapRef = useRef<HTMLDivElement>(null)

  const childCount = useMemo(
    () => descendantIds(allDepts, dept.id).size - 1,
    [allDepts, dept.id],
  )

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={wrapRef}
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
      {childCount > 0 && (
        <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8, lineHeight: 1.5 }}>
          {t('dept.deleteCascade', { count: String(childCount) })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => { removeDepartment(dept.id); onClose(); if (isActive) useUiStore.getState().setMainView('chat') }}
          style={{ flex: 1, padding: '5px 0', borderRadius: 5, border: 'none', background: '#f87171', color: 'rgba(255,255,255,0.95)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.85)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#f87171' }}
        >
          {t('dept.deleteConfirm')}
        </button>
        <button onClick={onClose}
          style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s ease' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          {t('dept.cancel')}
        </button>
      </div>
    </div>
  )
}
