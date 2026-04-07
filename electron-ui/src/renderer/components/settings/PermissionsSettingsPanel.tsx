import React, { useCallback, useEffect, useState } from 'react'
import { Shield, Plus, X, AlertTriangle, Info } from 'lucide-react'
import { useT } from '../../i18n'

interface CLIPermissions {
  allow?: string[]
  deny?: string[]
}

export default function PermissionsSettingsPanel() {
  const t = useT()
  const [permissions, setPermissions] = useState<CLIPermissions>({ allow: [], deny: [] })
  const [loading, setLoading] = useState(true)
  const [addingAllow, setAddingAllow] = useState(false)
  const [addingDeny, setAddingDeny] = useState(false)
  const [allowInput, setAllowInput] = useState('')
  const [denyInput, setDenyInput] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  // Load permissions from CLI settings
  const loadPermissions = useCallback(async () => {
    try {
      const settings = await window.electronAPI.configReadCLISettings()
      const perms = (settings.permissions || {}) as CLIPermissions
      setPermissions({
        allow: Array.isArray(perms.allow) ? perms.allow : [],
        deny: Array.isArray(perms.deny) ? perms.deny : [],
      })
    } catch {
      showToast(t('permissions.loadError'))
    } finally {
      setLoading(false)
    }
  }, [showToast, t])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  // Persist permissions to CLI settings
  const savePermissions = useCallback(async (updated: CLIPermissions) => {
    const result = await window.electronAPI.configWriteCLISettings({
      permissions: updated,
    })
    if (result.error) {
      showToast(t('permissions.saveFailed'))
    }
  }, [showToast, t])

  const addRule = useCallback(async (type: 'allow' | 'deny', rule: string) => {
    const trimmed = rule.trim()
    if (!trimmed) return

    const list = type === 'allow' ? (permissions.allow || []) : (permissions.deny || [])
    if (list.includes(trimmed)) {
      showToast(t('permissions.ruleExists'))
      return
    }

    const updated: CLIPermissions = {
      ...permissions,
      [type]: [...list, trimmed],
    }
    setPermissions(updated)
    await savePermissions(updated)
    showToast(t('permissions.ruleAdded', { rule: trimmed }))

    if (type === 'allow') {
      setAllowInput('')
      setAddingAllow(false)
    } else {
      setDenyInput('')
      setAddingDeny(false)
    }
  }, [permissions, savePermissions, showToast, t])

  const removeRule = useCallback(async (type: 'allow' | 'deny', index: number) => {
    const list = type === 'allow' ? [...(permissions.allow || [])] : [...(permissions.deny || [])]
    const removed = list.splice(index, 1)[0]
    const updated: CLIPermissions = { ...permissions, [type]: list }
    setPermissions(updated)
    await savePermissions(updated)
    showToast(t('permissions.ruleRemoved', { rule: removed }))
  }, [permissions, savePermissions, showToast, t])

  // Check if a rule appears in both allow and deny
  const hasConflict = useCallback((rule: string, type: 'allow' | 'deny') => {
    const otherList = type === 'allow' ? (permissions.deny || []) : (permissions.allow || [])
    return otherList.includes(rule)
  }, [permissions])

  if (loading) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        {t('common.loading')}
      </div>
    )
  }

  const allowList = permissions.allow || []
  const denyList = permissions.deny || []
  const isEmpty = allowList.length === 0 && denyList.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '8px 16px', fontSize: 12, color: 'var(--text-primary)', zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !addingAllow && !addingDeny && (
        <div style={{
          textAlign: 'center', padding: '24px 16px',
          background: 'var(--action-btn-bg)', borderRadius: 8,
        }}>
          <Shield size={32} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: 12 }} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {t('permissions.emptyState')}
          </div>
        </div>
      )}

      {/* Allow Rules */}
      <RuleSection
        title={t('permissions.allowRules')}
        rules={allowList}
        type="allow"
        color="#10b981"
        bgColor="rgba(16,185,129,0.12)"
        adding={addingAllow}
        inputValue={allowInput}
        onInputChange={setAllowInput}
        onToggleAdd={() => setAddingAllow(v => !v)}
        onAdd={(rule) => addRule('allow', rule)}
        onRemove={(idx) => removeRule('allow', idx)}
        hasConflict={(rule) => hasConflict(rule, 'allow')}
        t={t}
      />

      {/* Deny Rules */}
      <RuleSection
        title={t('permissions.denyRules')}
        rules={denyList}
        type="deny"
        color="#ef4444"
        bgColor="rgba(239,68,68,0.12)"
        adding={addingDeny}
        inputValue={denyInput}
        onInputChange={setDenyInput}
        onToggleAdd={() => setAddingDeny(v => !v)}
        onAdd={(rule) => addRule('deny', rule)}
        onRemove={(idx) => removeRule('deny', idx)}
        hasConflict={(rule) => hasConflict(rule, 'deny')}
        t={t}
      />

      {/* Format help */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        background: 'var(--action-btn-bg)', borderRadius: 8, padding: '10px 14px',
      }}>
        <Info size={14} color="var(--text-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {t('permissions.formatHelp')}
        </div>
      </div>
    </div>
  )
}

// ── RuleSection sub-component ──────────────────────────

interface RuleSectionProps {
  title: string
  rules: string[]
  type: 'allow' | 'deny'
  color: string
  bgColor: string
  adding: boolean
  inputValue: string
  onInputChange: (v: string) => void
  onToggleAdd: () => void
  onAdd: (rule: string) => void
  onRemove: (index: number) => void
  hasConflict: (rule: string) => boolean
  t: (key: string, params?: Record<string, string>) => string
}

function RuleSection({
  title, rules, type, color, bgColor,
  adding, inputValue, onInputChange,
  onToggleAdd, onAdd, onRemove, hasConflict, t,
}: RuleSectionProps) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </span>
        <button
          onClick={onToggleAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '3px 10px', cursor: 'pointer', fontSize: 11,
            color: 'var(--text-muted)',
          }}
          aria-label={t('permissions.addRule')}
        >
          <Plus size={12} /> {t('permissions.addRule')}
        </button>
      </div>

      {/* Rule tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 28 }}>
        {rules.map((rule, idx) => (
          <span
            key={`${type}-${idx}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: bgColor, color,
              borderRadius: 6, padding: '4px 10px',
              fontSize: 12, fontWeight: 500, fontFamily: 'monospace',
            }}
          >
            {hasConflict(rule) && (
              <span title={t('permissions.conflictHint')} style={{ display: 'inline-flex' }}><AlertTriangle size={12} color="#f59e0b" /></span>
            )}
            {rule}
            <button
              onClick={() => onRemove(idx)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, display: 'flex', color: 'inherit', opacity: 0.7,
              }}
              aria-label={t('common.remove')}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {rules.length === 0 && !adding && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {t('permissions.noRules')}
          </span>
        )}
      </div>

      {/* Inline add input */}
      {adding && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            autoFocus
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAdd(inputValue)
              if (e.key === 'Escape') onToggleAdd()
            }}
            placeholder={t('permissions.rulePlaceholder')}
            style={{
              flex: 1, padding: '6px 10px', fontSize: 12,
              background: 'var(--action-btn-bg)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-primary)',
              fontFamily: 'monospace', outline: 'none',
            }}
          />
          <button
            onClick={() => onAdd(inputValue)}
            disabled={!inputValue.trim()}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 500,
              background: inputValue.trim() ? 'var(--accent)' : 'var(--action-btn-bg)',
              border: 'none', borderRadius: 6,
              color: inputValue.trim() ? '#fff' : 'var(--text-muted)',
              cursor: inputValue.trim() ? 'pointer' : 'default',
            }}
          >
            {t('common.add')}
          </button>
        </div>
      )}
    </div>
  )
}
