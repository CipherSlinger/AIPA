import React, { useCallback, useEffect, useState } from 'react'
import { Shield, Globe, FolderOpen, Plus, X, AlertTriangle, Info, Ban } from 'lucide-react'
import { useI18n } from '../../i18n'
import SettingsGroup from './SettingsGroup'
import Toggle from '../ui/Toggle'

// ── Types ────────────────────────────────────────────────────────────────────

interface SandboxNetwork {
  allowedDomains?: string[]
  allowManagedDomainsOnly?: boolean
  allowUnixSockets?: boolean
}

interface SandboxFilesystem {
  allowWrite?: string[]
  denyWrite?: string[]
  allowRead?: string[]
  denyRead?: string[]
}

interface SandboxConfig {
  network?: SandboxNetwork
  filesystem?: SandboxFilesystem
  autoAllowBashIfSandboxed?: boolean
  allowUnsandboxedCommands?: boolean
  ignoreViolations?: Record<string, string[]>
}

// ── ChipList ─────────────────────────────────────────────────────────────────

interface ChipListProps {
  items: string[]
  placeholder: string
  color: string
  bgColor: string
  borderColor: string
  onAdd: (item: string) => void
  onRemove: (index: number) => void
}

function ChipList({ items, placeholder, color, bgColor, borderColor, onAdd, onRemove }: ChipListProps) {
  const [adding, setAdding] = useState(false)
  const [inputValue, setInputValue] = useState('')

  const handleAdd = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setInputValue('')
    setAdding(false)
  }

  return (
    <div>
      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 24, marginBottom: 6 }}>
        {items.map((item, idx) => (
          <span
            key={`chip-${idx}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: bgColor, color,
              border: `1px solid ${borderColor}`,
              borderRadius: 5, padding: '3px 8px',
              fontSize: 11, fontWeight: 500, fontFamily: 'monospace',
            }}
          >
            {item.length > 40 ? item.slice(0, 40) + '…' : item}
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
              aria-label={`Remove ${item}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {items.length === 0 && !adding && (
          <span style={{
            fontSize: 11, color: 'var(--text-faint)',
            fontStyle: 'italic', padding: '3px 0',
          }}>
            None configured
          </span>
        )}
      </div>

      {/* Add row */}
      {adding ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') { setAdding(false); setInputValue('') }
            }}
            placeholder={placeholder}
            style={{
              flex: 1, padding: '6px 10px', fontSize: 12,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-primary)',
              fontFamily: 'monospace', outline: 'none',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!inputValue.trim()}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600,
              background: inputValue.trim()
                ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                : 'var(--bg-input)',
              border: inputValue.trim() ? 'none' : '1px solid var(--border)',
              borderRadius: 6,
              color: inputValue.trim() ? 'var(--text-bright)' : 'var(--text-faint)',
              cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
            }}
          >
            Add
          </button>
          <button
            onClick={() => { setAdding(false); setInputValue('') }}
            style={{
              padding: '6px 10px', fontSize: 11,
              background: 'var(--bg-hover)',
              border: '1px solid var(--glass-border)',
              borderRadius: 6, color: 'var(--text-faint)',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--bg-hover)',
            border: '1px solid var(--glass-border-md)',
            borderRadius: 6, padding: '4px 10px',
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
            color: 'var(--text-faint)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-faint)'
          }}
        >
          <Plus size={11} /> Add
        </button>
      )}
    </div>
  )
}

// ── ToggleField ───────────────────────────────────────────────────────────────

interface ToggleFieldProps {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  warning?: boolean
}

function ToggleField({ label, description, checked, onChange, warning }: ToggleFieldProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '8px 0',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
            {label}
          </span>
          {warning && checked && (
            <AlertTriangle size={12} color="rgba(239,68,68,0.80)" />
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.5 }}>
          {description}
        </div>
        {warning && checked && (
          <div style={{
            marginTop: 5, fontSize: 11,
            color: 'rgba(239,68,68,0.80)',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.18)',
            borderRadius: 5, padding: '3px 8px',
            lineHeight: 1.5,
          }}>
            Warning: this weakens security isolation
          </div>
        )}
      </div>
      <Toggle value={checked} onChange={onChange} />
    </div>
  )
}

// ── PathListSection ───────────────────────────────────────────────────────────

interface PathListSectionProps {
  label: string
  description: string
  items: string[]
  placeholder: string
  color: string
  bgColor: string
  borderColor: string
  onAdd: (item: string) => void
  onRemove: (index: number) => void
}

function PathListSection({ label, description, items, placeholder, color, bgColor, borderColor, onAdd, onRemove }: PathListSectionProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color,
        }}>
          {label}
        </span>
        {items.length > 0 && (
          <span style={{
            background: bgColor, color,
            border: `1px solid ${borderColor}`,
            borderRadius: 10, padding: '0px 6px',
            fontSize: 9, fontWeight: 700,
          }}>
            {items.length}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 6 }}>{description}</div>
      <ChipList
        items={items}
        placeholder={placeholder}
        color={color}
        bgColor={bgColor}
        borderColor={borderColor}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────

function parseIgnoreViolations(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      result[k] = v.filter((x): x is string => typeof x === 'string')
    }
  }
  return result
}

// ── IgnoreViolationsSection ───────────────────────────────────────────────────

interface IgnoreViolationsSectionProps {
  violations: Record<string, string[]>
  onAdd: (toolName: string, types: string[]) => void
  onRemoveEntry: (toolName: string) => void
  onRemoveType: (toolName: string, typeIdx: number) => void
  t: (key: string) => string
}

function IgnoreViolationsSection({
  violations, onAdd, onRemoveEntry, onRemoveType, t,
}: IgnoreViolationsSectionProps) {
  const [adding, setAdding] = useState(false)
  const [toolInput, setToolInput] = useState('')
  const [typesInput, setTypesInput] = useState('')

  const handleAdd = () => {
    const tool = toolInput.trim()
    if (!tool) return
    const types = typesInput.split(',').map(s => s.trim()).filter(Boolean)
    onAdd(tool, types)
    setToolInput('')
    setTypesInput('')
    setAdding(false)
  }

  const entries = Object.entries(violations)

  return (
    <div>
      {entries.length === 0 && !adding && (
        <div style={{
          fontSize: 11, color: 'var(--text-faint)',
          fontStyle: 'italic', padding: '4px 0 8px',
        }}>
          {t('sandbox.noViolationExemptions')}
        </div>
      )}

      {entries.map(([toolName, types]) => (
        <div
          key={toolName}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '6px 0',
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'rgba(99,102,241,0.12)', color: 'rgba(129,140,248,1)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 5, padding: '3px 8px',
            fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
            flexShrink: 0, marginTop: 2,
          }}>
            {toolName}
          </span>

          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 24 }}>
            {types.map((vt, idx) => (
              <span
                key={`${toolName}-vt-${idx}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'rgba(251,191,36,0.10)', color: '#fbbf24',
                  border: '1px solid rgba(251,191,36,0.22)',
                  borderRadius: 4, padding: '2px 7px',
                  fontSize: 10, fontWeight: 500, fontFamily: 'monospace',
                }}
              >
                {vt}
                <button
                  onClick={() => onRemoveType(toolName, idx)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, display: 'inline-flex',
                    color: 'inherit', opacity: 0.55,
                  }}
                  aria-label={`${t('sandbox.removeViolationType')} ${vt}`}
                >
                  <X size={9} />
                </button>
              </span>
            ))}
            {types.length === 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic', paddingTop: 3 }}>
                (all violations)
              </span>
            )}
          </div>

          <button
            onClick={() => onRemoveEntry(toolName)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '3px 4px', display: 'inline-flex',
              color: 'var(--text-faint)', opacity: 0.60,
              flexShrink: 0, marginTop: 1,
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.60' }}
            aria-label={`${t('sandbox.removeExemption')} ${toolName}`}
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {adding ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={toolInput}
              onChange={e => setToolInput(e.target.value)}
              placeholder={t('sandbox.toolName')}
              style={{
                width: 140, padding: '6px 10px', fontSize: 12,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-primary)',
                fontFamily: 'monospace', outline: 'none',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)'
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            <input
              value={typesInput}
              onChange={e => setTypesInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') { setAdding(false); setToolInput(''); setTypesInput('') }
              }}
              placeholder={t('sandbox.violationTypes')}
              style={{
                flex: 1, padding: '6px 10px', fontSize: 12,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-primary)',
                fontFamily: 'monospace', outline: 'none',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)'
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleAdd}
              disabled={!toolInput.trim()}
              style={{
                padding: '6px 12px', fontSize: 11, fontWeight: 600,
                background: toolInput.trim()
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                  : 'var(--bg-input)',
                border: toolInput.trim() ? 'none' : '1px solid var(--border)',
                borderRadius: 6,
                color: toolInput.trim() ? 'var(--text-bright)' : 'var(--text-faint)',
                cursor: toolInput.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Add
            </button>
            <button
              onClick={() => { setAdding(false); setToolInput(''); setTypesInput('') }}
              style={{
                padding: '6px 10px', fontSize: 11,
                background: 'var(--bg-hover)',
                border: '1px solid var(--glass-border)',
                borderRadius: 6, color: 'var(--text-faint)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--bg-hover)',
            border: '1px solid var(--glass-border-md)',
            borderRadius: 6, padding: '4px 10px',
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
            color: 'var(--text-faint)', marginTop: entries.length > 0 ? 8 : 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-faint)'
          }}
        >
          <Plus size={11} /> {t('sandbox.addViolationExemption')}
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsSandbox() {
  const { t } = useI18n()
  const [config, setConfig] = useState<SandboxConfig>({
    network: { allowedDomains: [], allowManagedDomainsOnly: false, allowUnixSockets: true },
    filesystem: { allowWrite: [], denyWrite: [], allowRead: [], denyRead: [] },
    autoAllowBashIfSandboxed: false,
    allowUnsandboxedCommands: false,
    ignoreViolations: {},
  })
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const settings = await window.electronAPI.configReadCLISettings()
        const raw = (settings.sandbox ?? {}) as Record<string, unknown>
        const net = (raw.network ?? {}) as Record<string, unknown>
        const fs_ = (raw.filesystem ?? {}) as Record<string, unknown>
        setConfig({
          network: {
            allowedDomains: Array.isArray(net.allowedDomains) ? (net.allowedDomains as string[]) : [],
            allowManagedDomainsOnly: !!net.allowManagedDomainsOnly,
            allowUnixSockets: net.allowUnixSockets !== false,
          },
          filesystem: {
            allowWrite: Array.isArray(fs_.allowWrite) ? (fs_.allowWrite as string[]) : [],
            denyWrite: Array.isArray(fs_.denyWrite) ? (fs_.denyWrite as string[]) : [],
            allowRead: Array.isArray(fs_.allowRead) ? (fs_.allowRead as string[]) : [],
            denyRead: Array.isArray(fs_.denyRead) ? (fs_.denyRead as string[]) : [],
          },
          autoAllowBashIfSandboxed: !!raw.autoAllowBashIfSandboxed,
          allowUnsandboxedCommands: !!raw.allowUnsandboxedCommands,
          ignoreViolations: parseIgnoreViolations(raw.ignoreViolations),
        })
      } catch {
        showToast(t('sandbox.loadError'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showToast, t])

  const persist = useCallback(async (updated: SandboxConfig) => {
    try {
      const result = await window.electronAPI.configWriteCLISettings({ sandbox: updated as unknown as Record<string, unknown> })
      if (result.error) showToast(t('sandbox.saveFailed'))
      else showToast(t('sandbox.saveSuccess'))
    } catch {
      showToast(t('sandbox.saveFailed'))
    }
  }, [showToast, t])

  const handleTopToggle = useCallback((field: 'autoAllowBashIfSandboxed' | 'allowUnsandboxedCommands') => {
    setConfig(prev => {
      const updated = { ...prev, [field]: !prev[field] }
      persist(updated)
      return updated
    })
  }, [persist])

  const handleNetworkToggle = useCallback((field: keyof SandboxNetwork) => {
    setConfig(prev => {
      const updated: SandboxConfig = {
        ...prev,
        network: { ...prev.network, [field]: !prev.network?.[field] },
      }
      persist(updated)
      return updated
    })
  }, [persist])

  const handleDomainAdd = useCallback((domain: string) => {
    setConfig(prev => {
      const existing = prev.network?.allowedDomains ?? []
      if (existing.includes(domain)) { showToast(t('sandbox.itemExists')); return prev }
      const updated: SandboxConfig = { ...prev, network: { ...prev.network, allowedDomains: [...existing, domain] } }
      persist(updated)
      return updated
    })
  }, [persist, showToast, t])

  const handleDomainRemove = useCallback((idx: number) => {
    setConfig(prev => {
      const list = [...(prev.network?.allowedDomains ?? [])]
      list.splice(idx, 1)
      const updated: SandboxConfig = { ...prev, network: { ...prev.network, allowedDomains: list } }
      persist(updated)
      return updated
    })
  }, [persist])

  const makeFsHandlers = useCallback((field: keyof SandboxFilesystem) => ({
    add: (path: string) => {
      setConfig(prev => {
        const existing = prev.filesystem?.[field] ?? []
        if (existing.includes(path)) { showToast(t('sandbox.itemExists')); return prev }
        const updated: SandboxConfig = { ...prev, filesystem: { ...prev.filesystem, [field]: [...existing, path] } }
        persist(updated)
        return updated
      })
    },
    remove: (idx: number) => {
      setConfig(prev => {
        const list = [...(prev.filesystem?.[field] ?? [])]
        list.splice(idx, 1)
        const updated: SandboxConfig = { ...prev, filesystem: { ...prev.filesystem, [field]: list } }
        persist(updated)
        return updated
      })
    },
  }), [persist, showToast, t])

  const allowWriteH = makeFsHandlers('allowWrite')
  const denyWriteH = makeFsHandlers('denyWrite')
  const allowReadH = makeFsHandlers('allowRead')
  const denyReadH = makeFsHandlers('denyRead')

  const handleViolationAdd = useCallback((toolName: string, types: string[]) => {
    setConfig(prev => {
      const existing = prev.ignoreViolations ?? {}
      const current = existing[toolName] ?? []
      const merged = Array.from(new Set([...current, ...types]))
      const updated: SandboxConfig = {
        ...prev,
        ignoreViolations: { ...existing, [toolName]: merged },
      }
      persist(updated)
      return updated
    })
  }, [persist])

  const handleViolationRemoveEntry = useCallback((toolName: string) => {
    setConfig(prev => {
      const existing = { ...(prev.ignoreViolations ?? {}) }
      delete existing[toolName]
      const updated: SandboxConfig = { ...prev, ignoreViolations: existing }
      persist(updated)
      return updated
    })
  }, [persist])

  const handleViolationRemoveType = useCallback((toolName: string, typeIdx: number) => {
    setConfig(prev => {
      const existing = prev.ignoreViolations ?? {}
      const types = [...(existing[toolName] ?? [])]
      types.splice(typeIdx, 1)
      const updated: SandboxConfig = {
        ...prev,
        ignoreViolations: { ...existing, [toolName]: types },
      }
      persist(updated)
      return updated
    })
  }, [persist])

  if (loading) return (
    <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
      {t('common.loading')}
    </div>
  )

  const network = config.network ?? {}
  const filesystem = config.filesystem ?? {}

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--glass-bg-high)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--glass-border-md)',
          borderRadius: 8, padding: '9px 18px',
          fontSize: 12, color: 'var(--text-primary)', zIndex: 9999,
          boxShadow: 'var(--glass-shadow)', pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}

      {/* Header info */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        background: 'var(--glass-shimmer)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8, padding: '10px 12px',
        marginBottom: 12,
      }}>
        <Info size={12} color="var(--text-faint)" style={{ marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          {t('sandbox.subtitle')}
        </div>
      </div>

      {/* Section: General */}
      <SettingsGroup title={t('sandbox.title')} icon={<Shield size={14} />} groupKey="sandbox-general">
        <ToggleField
          label={t('sandbox.autoAllowBash')}
          description={t('sandbox.autoAllowBashDesc')}
          checked={!!config.autoAllowBashIfSandboxed}
          onChange={() => handleTopToggle('autoAllowBashIfSandboxed')}
        />
        <div style={{ height: 1, background: 'var(--glass-border)', margin: '4px 0' }} />
        <ToggleField
          label={t('sandbox.allowUnsandboxed')}
          description={t('sandbox.allowUnsandboxedDesc')}
          checked={!!config.allowUnsandboxedCommands}
          onChange={() => handleTopToggle('allowUnsandboxedCommands')}
          warning
        />
      </SettingsGroup>

      {/* Section: Network */}
      <SettingsGroup title={t('sandbox.network')} icon={<Globe size={14} />} groupKey="sandbox-network">
        <ToggleField
          label={t('sandbox.allowManagedOnly')}
          description={t('sandbox.allowManagedOnlyDesc')}
          checked={!!network.allowManagedDomainsOnly}
          onChange={() => handleNetworkToggle('allowManagedDomainsOnly')}
        />
        <div style={{ height: 1, background: 'var(--glass-border)', margin: '4px 0' }} />
        <ToggleField
          label={t('sandbox.allowUnixSockets')}
          description={t('sandbox.allowUnixSocketsDesc')}
          checked={network.allowUnixSockets !== false}
          onChange={() => handleNetworkToggle('allowUnixSockets')}
        />
        <div style={{ height: 1, background: 'var(--glass-border)', margin: '8px 0' }} />
        <PathListSection
          label={t('sandbox.allowedDomains')}
          description={t('sandbox.allowedDomainsDesc')}
          items={network.allowedDomains ?? []}
          placeholder={t('sandbox.addDomain')}
          color="#67e8f9"
          bgColor="rgba(103,232,249,0.10)"
          borderColor="rgba(103,232,249,0.20)"
          onAdd={handleDomainAdd}
          onRemove={handleDomainRemove}
        />
      </SettingsGroup>

      {/* Section: Filesystem */}
      <SettingsGroup title={t('sandbox.filesystem')} icon={<FolderOpen size={14} />} groupKey="sandbox-fs">
        <PathListSection
          label={t('sandbox.allowWrite')}
          description={t('sandbox.allowWriteDesc')}
          items={filesystem.allowWrite ?? []}
          placeholder={t('sandbox.addPath')}
          color="#4ade80"
          bgColor="rgba(74,222,128,0.10)"
          borderColor="rgba(74,222,128,0.20)"
          onAdd={allowWriteH.add}
          onRemove={allowWriteH.remove}
        />
        <PathListSection
          label={t('sandbox.denyWrite')}
          description={t('sandbox.denyWriteDesc')}
          items={filesystem.denyWrite ?? []}
          placeholder={t('sandbox.addPath')}
          color="#f87171"
          bgColor="rgba(239,68,68,0.10)"
          borderColor="rgba(239,68,68,0.20)"
          onAdd={denyWriteH.add}
          onRemove={denyWriteH.remove}
        />
        <PathListSection
          label={t('sandbox.allowRead')}
          description={t('sandbox.allowReadDesc')}
          items={filesystem.allowRead ?? []}
          placeholder={t('sandbox.addPath')}
          color="#a78bfa"
          bgColor="rgba(167,139,250,0.10)"
          borderColor="rgba(167,139,250,0.20)"
          onAdd={allowReadH.add}
          onRemove={allowReadH.remove}
        />
        <PathListSection
          label={t('sandbox.denyRead')}
          description={t('sandbox.denyReadDesc')}
          items={filesystem.denyRead ?? []}
          placeholder={t('sandbox.addPath')}
          color="#fbbf24"
          bgColor="rgba(251,191,36,0.10)"
          borderColor="rgba(251,191,36,0.20)"
          onAdd={denyReadH.add}
          onRemove={denyReadH.remove}
        />
      </SettingsGroup>

      {/* Section: Ignore Violations */}
      <SettingsGroup title={t('sandbox.ignoreViolations')} icon={<Ban size={14} />} groupKey="sandbox-ignore-violations">
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 10, lineHeight: 1.5 }}>
          {t('sandbox.ignoreViolationsDesc')}
        </div>
        <IgnoreViolationsSection
          violations={config.ignoreViolations ?? {}}
          onAdd={handleViolationAdd}
          onRemoveEntry={handleViolationRemoveEntry}
          onRemoveType={handleViolationRemoveType}
          t={t}
        />
      </SettingsGroup>

      {/* Footer note */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '10px 12px',
        background: 'var(--glass-shimmer)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8, marginTop: 4,
      }}>
        <Shield size={12} color="var(--text-faint)" style={{ marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          Settings are written to{' '}
          <code style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.85 }}>~/.claude/settings.json</code>
          {' '}under the{' '}
          <code style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.85 }}>sandbox</code>
          {' '}key and take effect on the next CLI invocation.
        </div>
      </div>
    </>
  )
}
