// New-department form shown at the bottom of the sidebar panel.
//
// A department is a processor, so this asks for a name and nothing else. It
// deliberately creates no folder and does not touch the working directory;
// templates are reached from here so the sidebar never grows its own seeding
// path.
import { useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { useDepartmentStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { DEPT_COLORS } from './deptUtils'
import DeptTemplatePicker from './DeptTemplatePicker'

export default function DeptAddForm({ onDone }: { onDone: () => void }) {
  const t = useT()
  const addDepartment = useDepartmentStore(s => s.addDepartment)
  const setActiveDepartmentId = useDepartmentStore(s => s.setActiveDepartmentId)
  const setMainView = useUiStore(s => s.setMainView)
  const departments = useDepartmentStore(s => s.departments)

  const [name, setName] = useState('')
  const [nameFocused, setNameFocused] = useState(false)
  const [showPresets, setShowPresets] = useState(false)

  const submit = () => {
    if (!name.trim()) return
    const color = DEPT_COLORS[departments.length % DEPT_COLORS.length]
    const dept = addDepartment({ name: name.trim(), color })
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
        {/* Same picker as the org chart — one code path registers the nodes. */}
        <button
          onClick={() => setShowPresets(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent-text)', fontSize: 10, textTransform: 'none', letterSpacing: 'normal',
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

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={submit}
          disabled={!name.trim()}
          style={{
            flex: 1,
            padding: '6px 0',
            borderRadius: 7,
            border: 'none',
            background: !name.trim()
              ? 'rgba(99,102,241,0.25)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            color: !name.trim() ? 'var(--text-muted)' : 'rgba(255,255,255,0.95)',
            fontSize: 11,
            fontWeight: 600,
            cursor: !name.trim() ? 'not-allowed' : 'pointer',
            opacity: !name.trim() ? 0.4 : 1,
            transition: 'box-shadow 0.15s ease, transform 0.15s ease',
            boxShadow: !name.trim() ? 'none' : '0 2px 8px rgba(99,102,241,0.3)',
          }}
          onMouseEnter={e => { if (name.trim()) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = name.trim() ? '0 2px 8px rgba(99,102,241,0.3)' : 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
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
