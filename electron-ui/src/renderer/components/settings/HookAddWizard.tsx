import React, { useState } from 'react'
import { Terminal, MessageSquare, Globe, X, ChevronRight } from 'lucide-react'
import { useT } from '../../i18n'

// ── Event type groups ──────────────────────────────────────────────────────
const EVENT_GROUP_KEYS: { labelKey: string; events: string[] }[] = [
  {
    labelKey: 'hooks.wizard.groupTool',
    events: ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'],
  },
  {
    labelKey: 'hooks.wizard.groupSession',
    events: ['SessionStart', 'SessionEnd', 'Stop', 'StopFailure'],
  },
  {
    labelKey: 'hooks.wizard.groupUser',
    events: ['UserPromptSubmit', 'Notification', 'PermissionRequest', 'PermissionDenied'],
  },
  {
    labelKey: 'hooks.wizard.groupContext',
    events: ['PreCompact', 'PostCompact'],
  },
  {
    labelKey: 'hooks.wizard.groupTask',
    events: ['SubagentStart', 'SubagentStop', 'TaskCreated', 'TaskCompleted'],
  },
  {
    labelKey: 'hooks.wizard.groupAdvanced',
    events: ['Setup', 'Elicitation', 'ElicitationResult'],
  },
]

type HookType = 'command' | 'prompt' | 'http'

interface HookAddWizardProps {
  onSave: (eventType: string, hook: Record<string, unknown>, matcher: string) => Promise<void>
  onCancel: () => void
}

export default function HookAddWizard({ onSave, onCancel }: HookAddWizardProps) {
  const t = useT()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedEvent, setSelectedEvent] = useState('')
  const [hookType, setHookType] = useState<HookType>('command')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 3 fields
  const [matcher, setMatcher] = useState('')
  const [timeout, setTimeout_] = useState('')
  // command
  const [command, setCommand] = useState('')
  // prompt
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  // http
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState('')

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 4,
    fontWeight: 500,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--action-btn-bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '6px 8px',
    color: 'var(--text-primary)',
    fontSize: 12,
    boxSizing: 'border-box',
  }

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: 'vertical',
    minHeight: 60,
    fontFamily: 'monospace',
  }

  const handleSave = async () => {
    setError('')
    // Validate
    if (hookType === 'command' && !command.trim()) {
      setError(t('hooks.wizard.errCommandRequired'))
      return
    }
    if (hookType === 'prompt' && !prompt.trim()) {
      setError(t('hooks.wizard.errPromptRequired'))
      return
    }
    if (hookType === 'http') {
      if (!url.trim()) { setError(t('hooks.wizard.errUrlRequired')); return }
      try { new URL(url.trim()) } catch { setError(t('hooks.wizard.errUrlInvalid')); return }
    }

    const hook: Record<string, unknown> = { type: hookType }
    const t = parseInt(timeout)
    if (!isNaN(t) && t > 0) hook.timeout = t

    if (hookType === 'command') {
      hook.command = command.trim()
    } else if (hookType === 'prompt') {
      hook.prompt = prompt.trim()
      if (model.trim()) hook.model = model.trim()
    } else if (hookType === 'http') {
      hook.url = url.trim()
      if (headers.trim()) {
        const parsed: Record<string, string> = {}
        for (const line of headers.split('\n')) {
          const eq = line.indexOf('=')
          if (eq > 0) {
            parsed[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
          }
        }
        hook.headers = parsed
      }
    }

    setSaving(true)
    try {
      await onSave(selectedEvent, hook, matcher.trim())
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const stepIndicator = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14 }}>
      {([1, 2, 3] as const).map((s) => (
        <React.Fragment key={s}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: step >= s ? 'var(--accent)' : 'var(--action-btn-bg)',
            border: '1px solid ' + (step >= s ? 'var(--accent)' : 'var(--border)'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600,
            color: step >= s ? '#fff' : 'var(--text-muted)',
          }}>{s}</div>
          {s < 3 && <ChevronRight size={12} color="var(--text-muted)" />}
        </React.Fragment>
      ))}
      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        {step === 1 ? t('hooks.wizard.selectEvent') : step === 2 ? t('hooks.wizard.selectType') : t('hooks.wizard.configure')}
      </span>
    </div>
  )

  return (
    <div style={{
      background: 'var(--popup-bg)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 16px',
      marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t('hooks.wizard.title')}</span>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      {stepIndicator}

      {/* Step 1: Select event type */}
      {step === 1 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
            {t('hooks.wizard.chooseEventHint')}
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {EVENT_GROUP_KEYS.map(group => (
              <div key={group.labelKey}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  {t(group.labelKey)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {group.events.map(ev => (
                    <button
                      key={ev}
                      onClick={() => { setSelectedEvent(ev); setStep(2) }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 5,
                        border: '1px solid ' + (selectedEvent === ev ? 'var(--accent)' : 'var(--border)'),
                        background: selectedEvent === ev ? 'var(--accent)' : 'var(--action-btn-bg)',
                        color: selectedEvent === ev ? '#fff' : 'var(--text-primary)',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontWeight: selectedEvent === ev ? 600 : 400,
                      }}
                    >
                      {ev}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Select hook type */}
      {step === 2 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
            {t('hooks.wizard.chooseTypeHint', { event: selectedEvent })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { type: 'command' as HookType, icon: <Terminal size={18} />, label: t('hooks.wizard.typeCommand'), desc: t('hooks.wizard.typeCommandDesc') },
              { type: 'prompt' as HookType, icon: <MessageSquare size={18} />, label: t('hooks.wizard.typePrompt'), desc: t('hooks.wizard.typePromptDesc') },
              { type: 'http' as HookType, icon: <Globe size={18} />, label: t('hooks.wizard.typeHttp'), desc: t('hooks.wizard.typeHttpDesc') },
            ]).map(({ type, icon, label, desc }) => (
              <button
                key={type}
                onClick={() => { setHookType(type); setStep(3) }}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  borderRadius: 8,
                  border: '1px solid ' + (hookType === type ? 'var(--accent)' : 'var(--border)'),
                  background: hookType === type ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--action-btn-bg)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 0.1s ease',
                }}
              >
                <span style={{ color: hookType === type ? 'var(--accent)' : 'var(--text-muted)' }}>{icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{desc}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(1)} style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}>
            {t('hooks.wizard.back')}
          </button>
        </div>
      )}

      {/* Step 3: Configure params */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('hooks.wizard.configureHint', { event: selectedEvent, type: hookType })}
          </div>

          {/* command fields */}
          {hookType === 'command' && (
            <div>
              <label style={labelStyle}>{t('hooks.wizard.labelCommand')} <span style={{ color: '#ef4444' }}>*</span></label>
              <textarea
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder="e.g. echo hello"
                style={textareaStyle}
              />
            </div>
          )}

          {/* prompt fields */}
          {hookType === 'prompt' && (
            <>
              <div>
                <label style={labelStyle}>{t('hooks.wizard.labelPrompt')} <span style={{ color: '#ef4444' }}>*</span></label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g. Summarize the tool result"
                  style={textareaStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t('hooks.wizard.labelModel')}</label>
                <input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. claude-haiku-3-5" style={inputStyle} />
              </div>
            </>
          )}

          {/* http fields */}
          {hookType === 'http' && (
            <>
              <div>
                <label style={labelStyle}>{t('hooks.wizard.labelUrl')} <span style={{ color: '#ef4444' }}>*</span></label>
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/webhook" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{t('hooks.wizard.labelHeaders')}</label>
                <textarea
                  value={headers}
                  onChange={e => setHeaders(e.target.value)}
                  placeholder={'Authorization=Bearer token\nContent-Type=application/json'}
                  style={{ ...textareaStyle, minHeight: 48 }}
                />
              </div>
            </>
          )}

          {/* shared optional fields */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{t('hooks.wizard.labelMatcher')}</label>
              <input value={matcher} onChange={e => setMatcher(e.target.value)} placeholder="e.g. Bash" style={inputStyle} />
            </div>
            <div style={{ width: 80 }}>
              <label style={labelStyle}>{t('hooks.wizard.labelTimeout')}</label>
              <input value={timeout} onChange={e => setTimeout_(e.target.value)} placeholder="10" type="number" min="1" style={inputStyle} />
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 11, color: '#ef4444', padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 4 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={() => setStep(2)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}>
              {t('hooks.wizard.back')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1,
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 6,
                padding: '5px 12px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? t('hooks.wizard.saving') : t('hooks.wizard.save')}
            </button>
            <button onClick={onCancel} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}>
              {t('hooks.wizard.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
