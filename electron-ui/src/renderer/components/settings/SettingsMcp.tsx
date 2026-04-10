import React, { useState, useEffect } from 'react'
import { useI18n, useT } from '../../i18n'
import Toggle from '../ui/Toggle'
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, Wrench } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface McpServer {
  name: string
  command?: string
  disabled?: boolean
  toolCount?: number
  status?: string
}

type ServerType = 'stdio' | 'http' | 'sse'

interface EnvPair { key: string; value: string }

interface WizardState {
  step: 1 | 2 | 3
  type: ServerType
  // stdio
  command: string
  args: string
  envPairs: EnvPair[]
  // http / sse
  url: string
  headerPairs: EnvPair[]
  // step 3
  name: string
  nameError: string
  urlError: string
  submitting: boolean
  submitError: string
}

function freshWizard(): WizardState {
  return {
    step: 1,
    type: 'stdio',
    command: '',
    args: '',
    envPairs: [{ key: '', value: '' }],
    url: '',
    headerPairs: [{ key: '', value: '' }],
    name: '',
    nameError: '',
    urlError: '',
    submitting: false,
    submitError: '',
  }
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function isValidUrl(s: string): boolean {
  try { new URL(s); return true } catch { return false }
}

function KVEditor({
  pairs,
  onChange,
  keyPlaceholder,
  valPlaceholder,
}: {
  pairs: EnvPair[]
  onChange: (pairs: EnvPair[]) => void
  keyPlaceholder: string
  valPlaceholder: string
}) {
  const t = useT()
  const set = (i: number, field: 'key' | 'value', v: string) => {
    const next = pairs.map((p, idx) => idx === i ? { ...p, [field]: v } : p)
    onChange(next)
  }
  const add = () => onChange([...pairs, { key: '', value: '' }])
  const remove = (i: number) => onChange(pairs.filter((_, idx) => idx !== i))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {pairs.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            value={p.key}
            placeholder={keyPlaceholder}
            onChange={e => set(i, 'key', e.target.value)}
            style={inputStyle}
          />
          <input
            value={p.value}
            placeholder={valPlaceholder}
            onChange={e => set(i, 'value', e.target.value)}
            style={inputStyle}
          />
          {pairs.length > 1 && (
            <button onClick={() => remove(i)} style={iconBtnStyle} title={t('mcp.removeRow')}>×</button>
          )}
        </div>
      ))}
      <button onClick={add} style={{ ...secondaryBtnStyle, alignSelf: 'flex-start', fontSize: 10, padding: '2px 8px' }}>
        + {t('mcp.addRow')}
      </button>
    </div>
  )
}

// ─── Style constants ──────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--action-btn-bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 11,
  padding: '4px 6px',
  outline: 'none',
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
  padding: '5px 12px',
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'var(--action-btn-bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '5px 12px',
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: '0 4px',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  marginBottom: 3,
  display: 'block',
}

// ─── Add Wizard ───────────────────────────────────────────────────────────────

function McpAddWizard({
  existingNames,
  onDone,
  onCancel,
}: {
  existingNames: string[]
  onDone: () => void
  onCancel: () => void
}) {
  const t = useT()
  const [w, setW] = useState<WizardState>(freshWizard())
  const set = (patch: Partial<WizardState>) => setW(prev => ({ ...prev, ...patch }))

  // Step 1 — type selection
  const typeCard = (type: ServerType, label: string, description: string) => (
    <div
      key={type}
      onClick={() => set({ type })}
      style={{
        border: `1px solid ${w.type === type ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 6,
        padding: '8px 12px',
        cursor: 'pointer',
        background: w.type === type ? 'rgba(var(--accent-rgb,99,102,241),0.08)' : 'var(--action-btn-bg)',
        flex: 1,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{description}</div>
    </div>
  )

  const validateStep2 = (): boolean => {
    if ((w.type === 'http' || w.type === 'sse') && !isValidUrl(w.url.trim())) {
      set({ urlError: t('mcp.errorUrlRequired') })
      return false
    }
    if (w.type === 'stdio' && !w.command.trim()) {
      return false
    }
    set({ urlError: '' })
    return true
  }

  const validateStep3 = (): boolean => {
    const n = w.name.trim()
    if (!n) { set({ nameError: t('mcp.errorNameRequired') }); return false }
    if (existingNames.includes(n)) { set({ nameError: t('mcp.errorNameExists') }); return false }
    set({ nameError: '' })
    return true
  }

  const handleNext = () => {
    if (w.step === 1) { set({ step: 2 }); return }
    if (w.step === 2) { if (validateStep2()) set({ step: 3 }); return }
  }

  const handleBack = () => {
    if (w.step === 2) { set({ step: 1 }); return }
    if (w.step === 3) { set({ step: 2 }); return }
  }

  const handleSubmit = async () => {
    if (!validateStep3()) return
    set({ submitting: true, submitError: '' })
    try {
      let config: Record<string, unknown>
      if (w.type === 'stdio') {
        const args = w.args.trim() ? w.args.split(',').map(s => s.trim()).filter(Boolean) : []
        const env: Record<string, string> = {}
        for (const p of w.envPairs) { if (p.key.trim()) env[p.key.trim()] = p.value }
        config = { command: w.command.trim(), args, env }
      } else {
        const headers: Record<string, string> = {}
        for (const p of w.headerPairs) { if (p.key.trim()) headers[p.key.trim()] = p.value }
        config = Object.keys(headers).length > 0
          ? { url: w.url.trim(), headers }
          : { url: w.url.trim() }
      }
      const result = await window.electronAPI.mcpAdd(w.name.trim(), w.type, config)
      if (result?.success === false) {
        set({ submitting: false, submitError: result.error || 'Failed to add server' })
        return
      }
      onDone()
    } catch (err) {
      set({ submitting: false, submitError: String(err) })
    }
  }

  return (
    <div style={{
      border: '1px solid var(--accent)',
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
      background: 'var(--action-btn-bg)',
    }}>
      {/* Progress indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {([1, 2, 3] as const).map((s, i) => (
          <React.Fragment key={s}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: w.step >= s ? 'var(--accent)' : 'var(--border)',
              color: w.step >= s ? '#fff' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, flexShrink: 0,
            }}>{s}</div>
            {i < 2 && <div style={{ flex: 1, height: 1, background: w.step > s ? 'var(--accent)' : 'var(--border)' }} />}
          </React.Fragment>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
          {w.step === 1 ? t('mcp.chooseType') : w.step === 2 ? t('mcp.configure') : t('mcp.nameAndFinish')}
        </span>
      </div>

      {/* Step 1: type */}
      {w.step === 1 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {typeCard('stdio', t('mcp.typeStdio'), t('mcp.typeStdioDesc'))}
          {typeCard('http', t('mcp.typeHttp'), t('mcp.typeHttpDesc'))}
          {typeCard('sse', t('mcp.typeSse'), t('mcp.typeSseDesc'))}
        </div>
      )}

      {/* Step 2: params */}
      {w.step === 2 && w.type === 'stdio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}>{t('mcp.fieldCommandRequired')}</label>
            <input
              value={w.command}
              onChange={e => set({ command: e.target.value })}
              placeholder="e.g. npx"
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>{t('mcp.fieldArgs')}</label>
            <input
              value={w.args}
              onChange={e => set({ args: e.target.value })}
              placeholder={t('mcp.fieldArgsPlaceholder')}
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('mcp.fieldEnvVars')}</label>
            <KVEditor
              pairs={w.envPairs}
              onChange={pairs => set({ envPairs: pairs })}
              keyPlaceholder="KEY"
              valPlaceholder="value"
            />
          </div>
        </div>
      )}

      {w.step === 2 && (w.type === 'http' || w.type === 'sse') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}>{t('mcp.fieldUrlRequired')}</label>
            <input
              value={w.url}
              onChange={e => set({ url: e.target.value, urlError: '' })}
              placeholder="https://api.example.com/mcp"
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', borderColor: w.urlError ? 'var(--error)' : undefined }}
              autoFocus
            />
            {w.urlError && <div style={{ fontSize: 10, color: 'var(--error)', marginTop: 3 }}>{w.urlError}</div>}
          </div>
          {w.type === 'http' && (
            <div>
              <label style={labelStyle}>{t('mcp.fieldHeaders')}</label>
              <KVEditor
                pairs={w.headerPairs}
                onChange={pairs => set({ headerPairs: pairs })}
                keyPlaceholder="Header-Name"
                valPlaceholder="value"
              />
            </div>
          )}
        </div>
      )}

      {/* Step 3: name */}
      {w.step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}>{t('mcp.fieldServerNameRequired')}</label>
            <input
              value={w.name}
              onChange={e => set({ name: e.target.value, nameError: '' })}
              placeholder="my-mcp-server"
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', borderColor: w.nameError ? 'var(--error)' : undefined }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            />
            {w.nameError && <div style={{ fontSize: 10, color: 'var(--error)', marginTop: 3 }}>{w.nameError}</div>}
          </div>
          {/* Summary */}
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 4, padding: '6px 8px', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {w.type === 'stdio'
              ? `${w.command} ${w.args}`
              : w.url}
          </div>
          {w.submitError && (
            <div style={{ fontSize: 11, color: 'var(--error)' }}>{w.submitError}</div>
          )}
        </div>
      )}

      {/* Navigation buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button onClick={w.step === 1 ? onCancel : handleBack} style={secondaryBtnStyle}>
          {w.step === 1 ? t('mcp.cancel') : t('mcp.back')}
        </button>
        {w.step < 3 ? (
          <button
            onClick={handleNext}
            style={{
              ...primaryBtnStyle,
              opacity: (w.step === 2 && w.type === 'stdio' && !w.command.trim()) ? 0.5 : 1,
            }}
            disabled={w.step === 2 && w.type === 'stdio' && !w.command.trim()}
          >
            {t('mcp.nextStep')}
          </button>
        ) : (
          <button onClick={handleSubmit} style={{ ...primaryBtnStyle, opacity: w.submitting ? 0.6 : 1 }} disabled={w.submitting}>
            {w.submitting ? t('mcp.adding') : t('mcp.addServerBtn')}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Server card ──────────────────────────────────────────────────────────────

function ServerCard({
  srv,
  onToggle,
  onDelete,
  onReconnect,
}: {
  srv: McpServer
  onToggle: (enabled: boolean) => void
  onDelete: () => void
  onReconnect: () => void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [tools, setTools] = useState<{ name: string; description?: string }[] | null>(null)
  const [loadingTools, setLoadingTools] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleExpand = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && tools === null) {
      setLoadingTools(true)
      try {
        const result = await window.electronAPI.mcpGetTools(srv.name)
        setTools(result?.tools ?? [])
      } catch {
        setTools([])
      } finally {
        setLoadingTools(false)
      }
    }
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 6,
      marginBottom: 6,
      overflow: 'hidden',
    }}>
      {/* Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        {/* Expand chevron */}
        <button onClick={handleExpand} style={{ ...iconBtnStyle, color: 'var(--text-muted)', padding: 0 }} title={t('mcp.showTools')}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {/* Name + command */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {srv.name}
            {srv.toolCount != null && srv.toolCount > 0 && (
              <span style={{
                fontSize: 9, background: 'var(--accent)', color: '#fff',
                borderRadius: 10, padding: '1px 5px', fontWeight: 700,
              }}>
                {srv.toolCount} {t('mcp.tools')}
              </span>
            )}
          </div>
          {srv.command && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {srv.command}
            </div>
          )}
        </div>

        {/* Reconnect */}
        <button
          onClick={onReconnect}
          title={t('mcp.reconnect')}
          style={{ ...iconBtnStyle, display: 'flex', alignItems: 'center' }}
        >
          <RefreshCw size={13} />
        </button>

        {/* Delete */}
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--error)' }}>{t('mcp.removeConfirm')}</span>
            <button onClick={onDelete} style={{ ...primaryBtnStyle, background: 'var(--error)', padding: '2px 8px', fontSize: 10 }}>{t('mcp.removeYes')}</button>
            <button onClick={() => setConfirmDelete(false)} style={{ ...secondaryBtnStyle, padding: '2px 8px', fontSize: 10 }}>{t('mcp.removeNo')}</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            title={t('mcp.removeServer')}
            style={{ ...iconBtnStyle, display: 'flex', alignItems: 'center', color: 'var(--error)' }}
          >
            <Trash2 size={13} />
          </button>
        )}

        {/* Enable/disable toggle */}
        <Toggle
          value={!srv.disabled}
          onChange={onToggle}
        />
      </div>

      {/* Expanded tools section */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '6px 12px 8px' }}>
          {loadingTools ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('mcp.loadingTools')}</div>
          ) : tools && tools.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {tools.map(tool => (
                <div key={tool.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <Wrench size={11} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{tool.name}</span>
                    {tool.description && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{tool.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wrench size={11} style={{ opacity: 0.4 }} />
              {t('mcp.noToolInfo')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsMcp() {
  const { t } = useI18n()
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const [showWizard, setShowWizard] = useState(false)
  const [reconnectMsg, setReconnectMsg] = useState<string | null>(null)

  const reload = () => {
    window.electronAPI.mcpList().then(list => setMcpServers(list as McpServer[]))
  }

  useEffect(() => { reload() }, [])

  const handleDelete = async (name: string) => {
    await window.electronAPI.mcpRemove(name)
    reload()
  }

  const handleReconnect = async (name: string) => {
    const result = await window.electronAPI.mcpReconnect(name)
    if (result && !result.success) {
      setReconnectMsg(result.error ?? 'Reconnect failed')
      setTimeout(() => setReconnectMsg(null), 3000)
    }
  }

  const handleToggle = async (name: string, enabled: boolean) => {
    await window.electronAPI.mcpSetEnabled(name, enabled)
    setMcpServers(prev => prev.map(s => s.name === name ? { ...s, disabled: !enabled } : s))
  }

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {mcpServers.length !== 1 ? t('mcp.serversConfiguredPlural', { count: String(mcpServers.length) }) : t('mcp.serversConfigured', { count: String(mcpServers.length) })}
        </span>
        {!showWizard && (
          <button
            onClick={() => setShowWizard(true)}
            style={{ ...primaryBtnStyle, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Plus size={12} /> {t('mcp.addServer')}
          </button>
        )}
      </div>

      {/* Reconnect toast */}
      {reconnectMsg && (
        <div style={{
          background: 'var(--error)',
          color: '#fff',
          borderRadius: 4,
          padding: '6px 10px',
          fontSize: 11,
          marginBottom: 8,
        }}>
          {reconnectMsg}
        </div>
      )}

      {/* Wizard */}
      {showWizard && (
        <McpAddWizard
          existingNames={mcpServers.map(s => s.name)}
          onDone={() => { setShowWizard(false); reload() }}
          onCancel={() => setShowWizard(false)}
        />
      )}

      {/* Server list */}
      {mcpServers.length === 0 && !showWizard ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
          {t('settings.noMcpServers')}<br />
          <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>{t('settings.mcpHint')}</span>
        </div>
      ) : (
        mcpServers.map(srv => (
          <ServerCard
            key={srv.name}
            srv={srv}
            onToggle={v => handleToggle(srv.name, v)}
            onDelete={() => handleDelete(srv.name)}
            onReconnect={() => handleReconnect(srv.name)}
          />
        ))
      )}
    </div>
  )
}
