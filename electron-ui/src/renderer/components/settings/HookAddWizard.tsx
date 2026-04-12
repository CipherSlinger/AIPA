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
    events: ['SubagentStart', 'SubagentStop', 'TaskCreated', 'TaskCompleted', 'TeammateIdle'],
  },
  {
    labelKey: 'hooks.wizard.groupSystem',
    events: ['InstructionsLoaded', 'CwdChanged', 'FileChanged', 'ConfigChange'],
  },
  {
    labelKey: 'hooks.wizard.groupWorktree',
    events: ['WorktreeCreate', 'WorktreeRemove'],
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

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.38)',
  marginBottom: 8,
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
  // advanced fields
  const [once, setOnce] = useState(false)
  const [asyncMode, setAsyncMode] = useState(false)
  const [shell, setShell] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.60)',
    marginBottom: 5,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 7,
    padding: '8px 10px',
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
  }

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: 'vertical',
    minHeight: 64,
    fontFamily: 'monospace',
  }

  const handleSave = async () => {
    setError('')
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
    const t_ = parseInt(timeout)
    if (!isNaN(t_) && t_ > 0) hook.timeout = t_
    if (once) hook.once = true
    if (asyncMode) hook.async = true
    if (statusMessage.trim()) hook.statusMessage = statusMessage.trim()

    if (hookType === 'command') {
      hook.command = command.trim()
      if (shell.trim()) hook.shell = shell.trim()
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

  // Step indicator
  const stepLabels = [
    t('hooks.wizard.selectEvent'),
    t('hooks.wizard.selectType'),
    t('hooks.wizard.configure'),
  ]

  const stepIndicator = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      marginBottom: 20, padding: '10px 14px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
    }}>
      {([1, 2, 3] as const).map((s) => (
        <React.Fragment key={s}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            opacity: step === s ? 1 : step > s ? 0.7 : 0.4,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: step > s
                ? '#4ade80'
                : step === s
                  ? 'rgba(99,102,241,0.85)'
                  : 'rgba(255,255,255,0.07)',
              border: step > s
                ? '1px solid rgba(74,222,128,0.5)'
                : step === s
                  ? '1px solid rgba(99,102,241,0.7)'
                  : '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              color: step >= s ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.38)',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}>
              {step > s ? '✓' : s}
            </div>
            <span style={{
              fontSize: 11, fontWeight: step === s ? 600 : 400,
              color: step === s ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.38)',
              transition: 'color 0.15s ease',
            }}>
              {stepLabels[s - 1]}
            </span>
          </div>
          {s < 3 && (
            <div style={{
              flex: 1, height: 1, margin: '0 10px',
              background: step > s
                ? 'rgba(74,222,128,0.35)'
                : 'rgba(255,255,255,0.07)',
              transition: 'background 0.15s ease',
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  )

  const backBtnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 7, padding: '8px 16px',
    cursor: 'pointer', fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
    transition: 'all 0.15s ease',
  }

  return (
    <div style={{
      background: 'rgba(12,12,22,0.97)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 12,
      padding: '18px 20px',
      marginTop: 10,
      boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 16,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.82)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {t('hooks.wizard.title')}
        </span>
        <button
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 6, cursor: 'pointer',
            color: 'rgba(255,255,255,0.45)',
            padding: '4px 7px', display: 'flex', alignItems: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
          }}
        >
          <X size={14} />
        </button>
      </div>

      {stepIndicator}

      {/* Step 1: Select event type */}
      {step === 1 && (
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 12, lineHeight: 1.6 }}>
            {t('hooks.wizard.chooseEventHint')}
          </div>
          <div style={{
            maxHeight: 260, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 14,
            paddingRight: 2,
          }}>
            {EVENT_GROUP_KEYS.map(group => (
              <div key={group.labelKey}>
                <div style={sectionLabelStyle}>{t(group.labelKey)}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {group.events.map(ev => {
                    const isSelected = selectedEvent === ev
                    return (
                      <button
                        key={ev}
                        onClick={() => { setSelectedEvent(ev); setStep(2) }}
                        style={{
                          padding: '5px 11px',
                          borderRadius: 6,
                          border: '1px solid ' + (isSelected
                            ? 'rgba(99,102,241,0.45)'
                            : 'rgba(255,255,255,0.09)'),
                          background: isSelected
                            ? 'rgba(99,102,241,0.18)'
                            : 'rgba(255,255,255,0.05)',
                          color: isSelected ? '#a5b4fc' : 'rgba(255,255,255,0.60)',
                          fontSize: 12, cursor: 'pointer',
                          fontWeight: isSelected ? 600 : 400,
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
                            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)'
                            e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
                            e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
                          }
                        }}
                      >
                        {ev}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Select hook type */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
            {t('hooks.wizard.chooseTypeHint', { event: selectedEvent })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { type: 'command' as HookType, icon: <Terminal size={20} />, label: t('hooks.wizard.typeCommand'), desc: t('hooks.wizard.typeCommandDesc') },
              { type: 'prompt' as HookType, icon: <MessageSquare size={20} />, label: t('hooks.wizard.typePrompt'), desc: t('hooks.wizard.typePromptDesc') },
              { type: 'http' as HookType, icon: <Globe size={20} />, label: t('hooks.wizard.typeHttp'), desc: t('hooks.wizard.typeHttpDesc') },
            ]).map(({ type, icon, label, desc }) => {
              const isSelected = hookType === type
              return (
                <button
                  key={type}
                  onClick={() => { setHookType(type); setStep(3) }}
                  style={{
                    flex: 1, padding: '14px 8px',
                    borderRadius: 9,
                    border: '1px solid ' + (isSelected
                      ? 'rgba(99,102,241,0.45)'
                      : 'rgba(255,255,255,0.08)'),
                    background: isSelected
                      ? 'rgba(99,102,241,0.14)'
                      : 'rgba(255,255,255,0.04)',
                    color: isSelected ? '#a5b4fc' : 'rgba(255,255,255,0.60)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
                      e.currentTarget.style.borderColor = 'rgba(99,102,241,0.28)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    }
                  }}
                >
                  <span style={{ color: isSelected ? '#a5b4fc' : 'rgba(255,255,255,0.38)' }}>
                    {icon}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', textAlign: 'center', lineHeight: 1.4 }}>
                    {desc}
                  </span>
                </button>
              )
            })}
          </div>
          <button
            onClick={() => setStep(1)}
            style={backBtnStyle}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
            }}
          >
            {t('hooks.wizard.back')}
          </button>
        </div>
      )}

      {/* Step 3: Configure params */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
            {t('hooks.wizard.configureHint', { event: selectedEvent, type: hookType })}
          </div>

          {/* command fields */}
          {hookType === 'command' && (
            <div>
              <label style={fieldLabelStyle}>
                {t('hooks.wizard.labelCommand')} <span style={{ color: '#f87171' }}>*</span>
              </label>
              <textarea
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder="e.g. echo hello"
                style={textareaStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
              />
            </div>
          )}

          {/* prompt fields */}
          {hookType === 'prompt' && (
            <>
              <div>
                <label style={fieldLabelStyle}>
                  {t('hooks.wizard.labelPrompt')} <span style={{ color: '#f87171' }}>*</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g. Summarize the tool result"
                  style={textareaStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>{t('hooks.wizard.labelModel')}</label>
                <input
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="e.g. claude-haiku-3-5"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                />
              </div>
            </>
          )}

          {/* http fields */}
          {hookType === 'http' && (
            <>
              <div>
                <label style={fieldLabelStyle}>
                  {t('hooks.wizard.labelUrl')} <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>{t('hooks.wizard.labelHeaders')}</label>
                <textarea
                  value={headers}
                  onChange={e => setHeaders(e.target.value)}
                  placeholder={'Authorization=Bearer token\nContent-Type=application/json'}
                  style={{ ...textareaStyle, minHeight: 52 }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                />
              </div>
            </>
          )}

          {/* Command preview */}
          {hookType === 'command' && command.trim() && (
            <div style={{
              background: 'rgba(10,10,20,0.90)',
              border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: 7,
              padding: '9px 12px',
              fontFamily: 'monospace',
              fontSize: 12,
              color: 'rgba(165,180,252,0.90)',
              lineHeight: 1.5,
            }}>
              <span style={{ color: 'rgba(255,255,255,0.38)', marginRight: 6 }}>$</span>
              {command.trim()}
            </div>
          )}

          {/* Shared optional fields */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={fieldLabelStyle}>{t('hooks.wizard.labelMatcher')}</label>
              <input
                value={matcher}
                onChange={e => setMatcher(e.target.value)}
                placeholder="e.g. Bash"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
              />
            </div>
            <div style={{ width: 88 }}>
              <label style={fieldLabelStyle}>{t('hooks.wizard.labelTimeout')}</label>
              <input
                value={timeout}
                onChange={e => setTimeout_(e.target.value)}
                placeholder="10"
                type="number" min="1"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
              />
            </div>
          </div>

          {/* Advanced: shell (command only) */}
          {hookType === 'command' && (
            <div>
              <label style={fieldLabelStyle}>Shell 程序</label>
              <input
                value={shell}
                onChange={e => setShell(e.target.value)}
                placeholder="/bin/bash"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                指定执行命令的 shell（默认 /bin/bash）
              </div>
            </div>
          )}

          {/* Advanced: statusMessage */}
          <div>
            <label style={fieldLabelStyle}>状态消息</label>
            <input
              value={statusMessage}
              onChange={e => setStatusMessage(e.target.value)}
              placeholder="正在执行检查..."
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
            />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
              Hook 执行时显示在状态栏的提示文字
            </div>
          </div>

          {/* Advanced toggles: once + async */}
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Once toggle */}
            <div
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.60)' }}>
                  仅执行一次 (Once)
                </span>
                <button
                  type="button"
                  onClick={() => setOnce(v => !v)}
                  aria-pressed={once}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    background: once
                      ? 'rgba(99,102,241,0.85)'
                      : 'rgba(255,255,255,0.12)',
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    left: once ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.95)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    transition: 'left 0.15s ease',
                    display: 'block',
                  }} />
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                会话中首次触发后自动停用此 Hook
              </div>
            </div>

            {/* Async toggle */}
            <div
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.60)' }}>
                  异步执行 (Async)
                </span>
                <button
                  type="button"
                  onClick={() => setAsyncMode(v => !v)}
                  aria-pressed={asyncMode}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    background: asyncMode
                      ? 'rgba(99,102,241,0.85)'
                      : 'rgba(255,255,255,0.12)',
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    left: asyncMode ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.95)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    transition: 'left 0.15s ease',
                    display: 'block',
                  }} />
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                Hook 在后台执行，不阻塞主流程
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              fontSize: 12, color: '#f87171',
              padding: '8px 12px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.18)',
              borderRadius: 7, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={() => setStep(2)}
              style={backBtnStyle}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
              }}
            >
              {t('hooks.wizard.back')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1,
                background: saving
                  ? 'rgba(99,102,241,0.40)'
                  : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: 'none',
                borderRadius: 8,
                padding: '9px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.95)',
                opacity: saving ? 0.75 : 1,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                if (!saving) {
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.40)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {saving ? t('hooks.wizard.saving') : t('hooks.wizard.save')}
            </button>
            <button
              onClick={onCancel}
              style={backBtnStyle}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
              }}
            >
              {t('hooks.wizard.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
