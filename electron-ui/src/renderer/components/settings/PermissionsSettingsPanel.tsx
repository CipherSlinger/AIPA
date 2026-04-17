import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Shield, Plus, X, AlertTriangle, Info, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { useT } from '../../i18n'
import { useChatStore } from '../../store/chatStore'
import { PermissionMessage } from '../../types/app.types'

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

  // Mine permission messages from the current chat session
  const messages = useChatStore(s => s.messages)
  const permissionHistory = useMemo<PermissionMessage[]>(() => {
    const perms = messages.filter((m): m is PermissionMessage => m.role === 'permission')
    // Return up to 20 most recent, newest first
    return perms.slice(-20).reverse()
  }, [messages])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

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

  const hasConflict = useCallback((rule: string, type: 'allow' | 'deny') => {
    const otherList = type === 'allow' ? (permissions.deny || []) : (permissions.allow || [])
    return otherList.includes(rule)
  }, [permissions])

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, padding: '36px 0',
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          border: '2px solid rgba(99,102,241,0.25)',
          borderTopColor: 'rgba(99,102,241,0.8)',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {t('common.loading')}
        </span>
      </div>
    )
  }

  const allowList = permissions.allow || []
  const denyList = permissions.deny || []
  const isEmpty = allowList.length === 0 && denyList.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--glass-bg-deep)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--glass-border-md)',
          borderRadius: 8,
          padding: '9px 18px',
          fontSize: 12, color: 'var(--text-primary)', zIndex: 9999,
          boxShadow: 'var(--glass-shadow)',
          pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !addingAllow && !addingDeny && (
        <div style={{
          textAlign: 'center', padding: '32px 16px',
          background: 'var(--glass-bg-low)',
          border: '1px dashed var(--glass-border-md)',
          borderRadius: 12,
        }}>
          <Shield size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
          <div style={{
            fontSize: 13, color: 'var(--text-faint)',
            fontWeight: 500, marginBottom: 4,
          }}>
            {t('permissions.emptyState')}
          </div>
        </div>
      )}

      {/* Allow Rules */}
      <RuleSection
        title={t('permissions.allowRules')}
        rules={allowList}
        type="allow"
        color="#4ade80"
        bgColor="rgba(74,222,128,0.10)"
        borderColor="rgba(74,222,128,0.20)"
        badgeBg="rgba(34,197,94,0.12)"
        badgeBorder="rgba(34,197,94,0.28)"
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
        color="#f87171"
        bgColor="rgba(239,68,68,0.10)"
        borderColor="rgba(239,68,68,0.20)"
        badgeBg="rgba(239,68,68,0.12)"
        badgeBorder="rgba(239,68,68,0.25)"
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
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: 'var(--glass-bg-low)',
        border: '1px solid var(--glass-border)',
        borderRadius: 12, padding: '12px 14px',
      }}>
        <Info size={13} color="var(--text-faint)" style={{ marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.65 }}>
          {t('permissions.formatHelp')}
        </div>
      </div>

      {/* Session Permission History */}
      <SessionPermissionHistory permissionHistory={permissionHistory} />
    </div>
  )
}

// ── SessionPermissionHistory sub-component ──────────────────────────

interface SessionPermissionHistoryProps {
  permissionHistory: PermissionMessage[]
}

function SessionPermissionHistory({ permissionHistory }: SessionPermissionHistoryProps) {
  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const decisionIcon = (decision: PermissionMessage['decision']) => {
    if (decision === 'allowed') return <CheckCircle2 size={12} color="#4ade80" style={{ flexShrink: 0 }} />
    if (decision === 'denied') return <XCircle size={12} color="#f87171" style={{ flexShrink: 0 }} />
    return <Clock size={12} color="var(--text-faint)" style={{ flexShrink: 0 }} />
  }

  const decisionBadge = (decision: PermissionMessage['decision']): { text: string; color: string } => {
    if (decision === 'allowed') return { text: '已允许', color: '#4ade80' }
    if (decision === 'denied') return { text: '已拒绝', color: '#f87171' }
    return { text: '待决定', color: 'var(--text-faint)' }
  }

  return (
    <div style={{
      background: 'var(--glass-bg-low)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Shield size={13} color="var(--text-faint)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          会话权限历史
        </span>
        {permissionHistory.length > 0 && (
          <span style={{
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.25)',
            color: 'rgba(99,102,241,0.9)',
            borderRadius: 20, padding: '1px 8px',
            fontSize: 10, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {permissionHistory.length}
          </span>
        )}
      </div>

      {/* Empty state */}
      {permissionHistory.length === 0 ? (
        <div style={{
          fontSize: 11, color: 'var(--text-faint)',
          fontStyle: 'italic', padding: '4px 0',
          textAlign: 'center',
        }}>
          当前会话暂无工具权限请求记录
        </div>
      ) : (
        <div style={{
          maxHeight: 200,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          {permissionHistory.map((perm) => {
            const badge = decisionBadge(perm.decision)
            return (
              <div
                key={perm.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 8px',
                  background: 'var(--glass-bg-deep)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 7,
                }}
              >
                {decisionIcon(perm.decision)}
                {/* Tool name */}
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  fontFamily: 'monospace',
                  color: 'var(--text-primary)',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {perm.toolName}
                </span>
                {/* Decision badge */}
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: badge.color,
                  flexShrink: 0,
                }}>
                  {badge.text}
                </span>
                {/* Timestamp */}
                <span style={{
                  fontSize: 10, color: 'var(--text-faint)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                }}>
                  {formatTime(perm.timestamp)}
                </span>
              </div>
            )
          })}
        </div>
      )}
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
  borderColor: string
  badgeBg: string
  badgeBorder: string
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
  title, rules, type, color, bgColor, borderColor, badgeBg, badgeBorder,
  adding, inputValue, onInputChange,
  onToggleAdd, onAdd, onRemove, hasConflict, t,
}: RuleSectionProps) {
  return (
    <div style={{
      background: 'var(--glass-bg-low)',
      border: '1px solid var(--glass-border)',
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {title}
          </span>
          {/* Count badge */}
          <span style={{
            background: badgeBg,
            border: `1px solid ${badgeBorder}`,
            color,
            borderRadius: 20, padding: '1px 8px',
            fontSize: 10, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {rules.length}
          </span>
        </div>
        <button
          onClick={onToggleAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: adding ? 'var(--glass-border-md)' : 'var(--bg-input)',
            border: '1px solid var(--glass-border-md)',
            borderRadius: 6, padding: '4px 10px',
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
            color: 'var(--text-secondary)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--glass-border-md)'
            e.currentTarget.style.color = 'var(--text-primary)'
            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = adding ? 'var(--glass-border-md)' : 'var(--bg-input)'
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
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
              border: `1px solid ${borderColor}`,
              borderRadius: 6, padding: '4px 10px',
              fontSize: 12, fontWeight: 500, fontFamily: 'monospace',
            }}
          >
            {hasConflict(rule) && (
              <span title={t('permissions.conflictHint')} style={{ display: 'inline-flex' }}>
                <AlertTriangle size={11} color="#fbbf24" />
              </span>
            )}
            {rule}
            <button
              onClick={() => onRemove(idx)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, display: 'inline-flex',
                color: 'inherit', opacity: 0.55,
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.55' }}
              aria-label={t('common.remove')}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {rules.length === 0 && !adding && (
          <span style={{
            fontSize: 11, color: 'var(--text-faint)',
            fontStyle: 'italic', padding: '4px 0',
          }}>
            {t('permissions.noRules')}
          </span>
        )}
      </div>

      {/* Inline add input */}
      {adding && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
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
              flex: 1, padding: '7px 10px', fontSize: 13,
              background: 'var(--bg-input)',
              border: '1px solid var(--glass-border-md)',
              borderRadius: 7, color: 'var(--text-primary)',
              fontFamily: 'monospace', outline: 'none',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border-md)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          <button
            onClick={() => onAdd(inputValue)}
            disabled={!inputValue.trim()}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 600,
              background: inputValue.trim()
                ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                : 'var(--bg-input)',
              border: inputValue.trim() ? 'none' : '1px solid var(--glass-border-md)',
              borderRadius: 7,
              color: inputValue.trim() ? 'var(--text-bright)' : 'var(--text-faint)',
              cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
            }}
          >
            {t('common.add')}
          </button>
        </div>
      )}
    </div>
  )
}
