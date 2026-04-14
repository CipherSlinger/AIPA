import React, { useState, useEffect } from 'react'
import { useI18n, useT } from '../../i18n'
import Toggle from '../ui/Toggle'
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { usePrefsStore } from '../../store'

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
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.12)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border-md)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          <input
            value={p.value}
            placeholder={valPlaceholder}
            onChange={e => set(i, 'value', e.target.value)}
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.12)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border-md)'; e.currentTarget.style.boxShadow = 'none' }}
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
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--glass-border-md)',
  borderRadius: 7,
  color: 'var(--text-primary)',
  fontSize: 11,
  padding: '5px 10px',
  outline: 'none',
  transition: 'all 0.15s ease',
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--cta-gradient)',
  border: 'none',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.95)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  padding: '7px 14px',
  transition: 'all 0.15s ease',
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--glass-border-md)',
  borderRadius: 6,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '5px 12px',
  transition: 'all 0.15s ease',
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.3)',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: '0 4px',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
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
        border: `1px solid ${w.type === type ? 'rgba(99,102,241,0.6)' : 'var(--glass-border)'}`,
        borderRadius: 8,
        padding: '10px 14px',
        cursor: 'pointer',
        background: w.type === type ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
        flex: 1,
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{description}</div>
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
      background: 'var(--glass-bg-mid)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(99,102,241,0.30)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      boxShadow: 'var(--glass-shadow)',
    }}>
      {/* Progress indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {([1, 2, 3] as const).map((s, i) => (
          <React.Fragment key={s}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
      background: w.step >= s ? 'var(--cta-gradient)' : 'var(--glass-border)',
              color: w.step >= s ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, flexShrink: 0,
            }}>{s}</div>
            {i < 2 && <div style={{ flex: 1, height: 1, background: w.step > s ? 'rgba(99,102,241,0.6)' : 'var(--glass-border)' }} />}
          </React.Fragment>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 4 }}>
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
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.12)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border-md)'; e.currentTarget.style.boxShadow = 'none' }}
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
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.12)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border-md)'; e.currentTarget.style.boxShadow = 'none' }}
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
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', borderColor: w.urlError ? 'rgba(239,68,68,0.60)' : undefined }}
              onFocus={e => { if (!w.urlError) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.12)' } }}
              onBlur={e => { e.currentTarget.style.borderColor = w.urlError ? 'rgba(239,68,68,0.60)' : 'var(--glass-border-md)'; e.currentTarget.style.boxShadow = 'none' }}
              autoFocus
            />
            {w.urlError && <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 3 }}>{w.urlError}</div>}
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
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', borderColor: w.nameError ? 'rgba(239,68,68,0.60)' : undefined }}
              onFocus={e => { if (!w.nameError) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.12)' } }}
              onBlur={e => { e.currentTarget.style.borderColor = w.nameError ? 'rgba(239,68,68,0.60)' : 'var(--glass-border-md)'; e.currentTarget.style.boxShadow = 'none' }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            />
            {w.nameError && <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 3 }}>{w.nameError}</div>}
          </div>
          {/* Summary */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
            {w.type === 'stdio'
              ? `${w.command} ${w.args}`
              : w.url}
          </div>
          {w.submitError && (
            <div style={{ fontSize: 11, color: '#fca5a5' }}>{w.submitError}</div>
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
          <button onClick={handleSubmit} style={{ ...primaryBtnStyle, opacity: w.submitting ? 0.4 : 1 }} disabled={w.submitting}>
            {w.submitting ? t('mcp.adding') : t('mcp.addServerBtn')}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Server card ────────────────────────��─────────────────────────────────────

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
  const [hoveredDelete, setHoveredDelete] = useState(false)
  const [hoveredReconnect, setHoveredReconnect] = useState(false)
  const [cardHovered, setCardHovered] = useState(false)
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

  // Derive connection status from server fields
  const isDisabled = !!srv.disabled
  const isLoading = !isDisabled && srv.status === 'loading'
  const hasError = !isDisabled && !isLoading && (srv.status === 'error' || (srv.toolCount === 0 && srv.status != null && srv.status !== 'connected'))

  // Status pill styles & labels
  const statusPill: React.CSSProperties = isDisabled
    ? { background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border-md)', color: 'var(--text-faint)' }
    : isLoading
    ? { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: 'rgba(165,180,252,0.7)' }
    : hasError
    ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: 'rgba(248,113,113,0.9)' }
    : { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.30)', color: 'rgba(74,222,128,0.9)' }

  const statusLabel = isDisabled ? '○ 已禁用' : isLoading ? '◌ 连接中' : hasError ? '● 错误' : '● 已连接'

  return (
    <div
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => setCardHovered(false)}
      style={{
      background: 'var(--glass-bg-low)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--glass-border)',
      borderRadius: 10,
      marginBottom: 8,
      overflow: 'hidden',
      boxShadow: cardHovered
        ? 'var(--glass-shadow)'
        : '0 2px 8px rgba(0,0,0,0.3)',
      transition: 'all 0.15s ease',
    }}>
      {/* Row */}      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
        {/* Expand chevron */}
        <button onClick={handleExpand} style={{ ...iconBtnStyle, padding: 0 }} title={t('mcp.showTools')}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {/* Name + command + status pill row */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {srv.name}
            {/* Connection status pill */}
            <span style={{
              ...statusPill,
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.01em',
              display: 'inline-flex',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              {statusLabel}
            </span>
            {/* Tool count badge */}
            {srv.toolCount != null && srv.toolCount > 0 && (
              <span style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
                flexShrink: 0,
              }}>
                {srv.toolCount} {t('mcp.tools')}
              </span>
            )}
          </div>
          {srv.command && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {srv.command}
            </div>
          )}
        </div>

        {/* Reconnect */}
        <button
          onClick={onReconnect}
          title={t('mcp.reconnect')}
          onMouseEnter={() => setHoveredReconnect(true)}
          onMouseLeave={() => setHoveredReconnect(false)}
          style={{
            ...iconBtnStyle,
            display: 'flex', alignItems: 'center',
            color: hoveredReconnect ? 'var(--text-primary)' : 'var(--text-faint)',
            background: hoveredReconnect ? 'var(--glass-border)' : 'none',
            borderRadius: 8, padding: '3px 5px',
            transition: 'all 0.15s ease',
          }}
        >
          <RefreshCw size={13} />
        </button>

        {/* Delete */}
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#fca5a5' }}>{t('mcp.removeConfirm')}</span>
            <button onClick={onDelete} style={{ ...primaryBtnStyle, background: 'rgba(239,68,68,0.20)', border: '1px solid rgba(239,68,68,0.35)', padding: '2px 8px', fontSize: 10, color: '#fca5a5' }}>{t('mcp.removeYes')}</button>
            <button onClick={() => setConfirmDelete(false)} style={{ ...secondaryBtnStyle, padding: '2px 8px', fontSize: 10 }}>{t('mcp.removeNo')}</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            title={t('mcp.removeServer')}
            onMouseEnter={() => setHoveredDelete(true)}
            onMouseLeave={() => setHoveredDelete(false)}
            style={{
              ...iconBtnStyle,
              display: 'flex', alignItems: 'center',
              color: hoveredDelete ? '#fca5a5' : 'rgba(239,68,68,0.60)',
              background: hoveredDelete ? 'rgba(239,68,68,0.10)' : 'none',
              borderRadius: 8, padding: '3px 5px',
              transition: 'all 0.15s ease',
            }}
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
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '6px 14px 10px' }}>
          {loadingTools ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <style>{`@keyframes mcp-dot-pulse { 0%,80%,100%{opacity:0.25;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }`}</style>
              {[0, 150, 300].map((delay, i) => (
                <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(165,180,252,0.7)', display: 'inline-block', animation: `mcp-dot-pulse 1.2s ease-in-out ${delay}ms infinite` }} />
              ))}
              <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 2 }}>{t('mcp.loadingTools')}</span>
            </div>
          ) : tools && tools.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {tools.map(tool => (
                <div key={tool.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <Wrench size={11} style={{ color: '#818cf8', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{tool.name}</span>
                    {tool.description && (
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{tool.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
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

// ─── Live session status area ──────────────────────────────────────────────────

interface McpToolInfo {
  name: string
  description?: string
}

interface ActiveMcpServer {
  name: string
  status: string
  tools?: McpToolInfo[] | string[] | number
  error?: string
}

function ServerToolList({ tools }: { tools: McpToolInfo[] }) {
  const [expanded, setExpanded] = useState(false)
  const count = tools.length

  if (count === 0) {
    return (
      <div style={{
        marginTop: 6,
        padding: '5px 8px',
        background: 'rgba(255,255,255,0.03)',
        borderLeft: '2px solid rgba(165,180,252,0.20)',
        borderRadius: '0 4px 4px 0',
        fontSize: 10,
        color: 'var(--text-faint)',
        fontStyle: 'italic',
        transition: 'all 0.15s ease',
      }}>
        暂无工具信息
      </div>
    )
  }

  return (
    <div style={{ marginTop: 6, transition: 'all 0.15s ease' }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          color: 'rgba(165,180,252,0.60)',
          fontSize: 10,
          fontWeight: 600,
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ fontSize: 9, transition: 'all 0.15s ease' }}>{expanded ? '▾' : '▸'}</span>
        {expanded ? '收起' : `展开 ${count} 个工具`}
      </button>
      {expanded && (
        <div style={{
          marginTop: 4,
          padding: '6px 8px',
          background: 'rgba(255,255,255,0.03)',
          borderLeft: '2px solid rgba(165,180,252,0.20)',
          borderRadius: '0 4px 4px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          transition: 'all 0.15s ease',
        }}>
          {tools.map((tool, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(165,180,252,0.82)' }}>
                {tool.name}
              </span>
              {tool.description && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {tool.description.length > 60
                    ? tool.description.slice(0, 60) + '…'
                    : tool.description}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LiveSessionStatus({ servers }: { servers: ActiveMcpServer[] }) {
  if (servers.length === 0) {
    return (
      <div style={{
        background: 'var(--glass-bg-low)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(255,255,255,0.18)',
        }} />
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic' }}>
          启动新会话后将显示 MCP 连接状态
        </span>
      </div>
    )
  }
  return (
    <div style={{
      background: 'var(--glass-bg-low)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--glass-border)',
      borderRadius: 12,
      padding: '12px 16px',
      marginBottom: 16,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-faint)', marginBottom: 10,
      }}>
        当前会话连接状态
      </div>
      {servers.map((srv, i) => {
        const isConnected = srv.status === 'connected'
        const isFailed = srv.status === 'failed' || srv.status === 'error'
        const dotColor = isConnected
          ? 'rgba(34,197,94,0.90)'
          : isFailed
            ? 'rgba(239,68,68,0.90)'
            : 'rgba(251,191,36,0.90)'
        const dotShadow = isConnected ? '0 0 6px rgba(34,197,94,0.50)' : 'none'
        const statusLabel = isConnected ? '已连接' : isFailed ? '失败' : '连接中'
        const statusColor = isConnected
          ? 'rgba(34,197,94,0.82)'
          : isFailed
            ? 'rgba(252,165,165,0.82)'
            : 'rgba(251,191,36,0.82)'
        // Normalize tools: CLI may send [{name, description}] objects or string[] or a count number
        const rawTools = srv.tools
        const toolObjects: McpToolInfo[] = Array.isArray(rawTools)
          ? rawTools.map(t =>
              typeof t === 'string'
                ? { name: t }
                : (t as McpToolInfo)
            )
          : []
        const toolCount = Array.isArray(rawTools)
          ? rawTools.length
          : typeof rawTools === 'number'
            ? rawTools
            : null
        return (
          <div key={i} style={{
            padding: '8px 0',
            borderBottom: i < servers.length - 1 ? '1px solid var(--glass-border)' : 'none',
          }}>
            {/* 服务器头部行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 状态指示灯 */}
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: dotColor,
                boxShadow: dotShadow,
              }} />
              {/* 服务器名 */}
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                {srv.name || `MCP Server ${i + 1}`}
              </span>
              {/* 工具数徽标 */}
              {toolCount !== null && toolCount > 0 && (
                <span style={{
                  fontSize: 10, color: 'rgba(165,180,252,0.82)',
                  background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.20)',
                  borderRadius: 6, padding: '1px 6px',
                }}>
                  {toolCount} 个工具
                </span>
              )}
              {/* 失败原因 */}
              {isFailed && srv.error && (
                <span style={{ fontSize: 10, color: 'rgba(252,165,165,0.80)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {srv.error}
                </span>
              )}
              {/* 状态标签 */}
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                textTransform: 'uppercase' as const,
                color: statusColor,
              }}>
                {statusLabel}
              </span>
            </div>
            {/* 工具列表（仅对已连接且有工具对象信息时展示） */}
            {isConnected && toolObjects.length > 0 && (
              <ServerToolList tools={toolObjects} />
            )}
            {/* 已连接但没有工具对象信息（只有数量）时展示暂无工具信息 */}
            {isConnected && toolObjects.length === 0 && toolCount === null && (
              <div style={{
                marginTop: 6,
                padding: '5px 8px',
                background: 'rgba(255,255,255,0.03)',
                borderLeft: '2px solid rgba(165,180,252,0.20)',
                borderRadius: '0 4px 4px 0',
                fontSize: 10,
                color: 'var(--text-faint)',
                fontStyle: 'italic',
                transition: 'all 0.15s ease',
              }}>
                暂无工具信息
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsMcp() {
  const { t } = useI18n()
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const [showWizard, setShowWizard] = useState(false)
  const [reconnectMsg, setReconnectMsg] = useState<string | null>(null)
  const rawActiveMcpServers = usePrefsStore(s => s.activeMcpServers)
  const activeMcpServers = rawActiveMcpServers as unknown as ActiveMcpServer[]

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
      {/* Live session MCP status */}
      <LiveSessionStatus servers={activeMcpServers} />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
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
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.30)',
          color: '#fca5a5',
          borderRadius: 8,
          padding: '6px 12px',
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
        <div style={{ textAlign: 'center', padding: '32px 24px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <Wrench size={20} style={{ color: '#818cf8' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            {t('settings.noMcpServers')}
          </div>
          <span style={{ fontSize: 11, display: 'block', color: 'var(--text-faint)' }}>{t('settings.mcpHint')}</span>
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
