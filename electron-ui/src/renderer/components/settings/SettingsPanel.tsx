import React, { useEffect, useState } from 'react'
import { Save, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { usePrefsStore } from '../../store'

const MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'claude-opus-4-6',            label: 'Claude Opus (Most Powerful)' },
  { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet (Recommended)' },
  { id: 'claude-haiku-4-5',           label: 'Claude Haiku (Fastest)' },
  { id: 'claude-opus-4',              label: 'Claude Opus 4' },
  { id: 'claude-sonnet-4-5',          label: 'Claude Sonnet 4.5' },
  { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku' },
]

const FONT_FAMILIES: { id: string; label: string }[] = [
  { id: "'Cascadia Code', 'Fira Code', Consolas, monospace", label: 'Cascadia Code' },
  { id: "'Fira Code', Consolas, monospace",                  label: 'Fira Code' },
  { id: "'JetBrains Mono', Consolas, monospace",             label: 'JetBrains Mono' },
  { id: "Consolas, 'Courier New', monospace",                label: 'Consolas' },
  { id: 'system-ui, sans-serif',                             label: 'System Default' },
]

const THEMES: { id: 'vscode' | 'modern' | 'minimal'; label: string; colors: string[] }[] = [
  { id: 'vscode',   label: 'VS Code',   colors: ['#1e1e1e', '#007acc', '#264f78', '#2d2d2d'] },
  { id: 'modern',   label: 'Modern Dark',  colors: ['#0d1117', '#2f81f7', '#1f3a5f', '#161b22'] },
  { id: 'minimal',  label: 'Minimal Dark',  colors: ['#111111', '#a855f7', '#1e1033', '#1a1a1a'] },
]

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: value ? 'var(--accent)' : 'var(--border)',
        border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
        transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        display: 'block',
      }} />
    </button>
  )
}

export default function SettingsPanel() {
  const { prefs, setPrefs } = usePrefsStore()
  const [local, setLocal] = useState({ ...prefs })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'general' | 'mcp' | 'about'>('general')
  const [mcpServers, setMcpServers] = useState<{ name: string; command?: string; disabled?: boolean }[]>([])

  useEffect(() => {
    const load = async () => {
      const all = await window.electronAPI.prefsGetAll()
      const env = await window.electronAPI.configGetEnv()
      setLocal({ ...all, apiKey: all.apiKey || env.apiKey || '' })
    }
    load()
  }, [])

  useEffect(() => {
    if (settingsTab === 'mcp') {
      window.electronAPI.mcpList().then(setMcpServers)
    }
  }, [settingsTab])

  const save = async () => {
    setPrefs(local)
    await window.electronAPI.configSetApiKey(local.apiKey)
    for (const [k, v] of Object.entries(local)) {
      if (k !== 'apiKey') await window.electronAPI.prefsSet(k, v)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const field = (label: string, content: React.ReactNode, hint?: React.ReactNode) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {content}
      {hint && <div style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  )

  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      {control}
    </div>
  )

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '6px 10px',
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Settings</div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {(['general', 'mcp', 'about'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSettingsTab(tab)}
            style={{
              background: settingsTab === tab ? 'var(--accent)' : 'none',
              border: '1px solid ' + (settingsTab === tab ? 'var(--accent)' : 'var(--border)'),
              borderRadius: 4,
              padding: '3px 10px',
              color: settingsTab === tab ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {tab === 'general' ? 'General' : tab === 'mcp' ? 'MCP Servers' : 'About'}
          </button>
        ))}
      </div>

      {settingsTab === 'general' ? (
        <>
          {/* API Key */}
          {field(
            'API Key',
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={local.apiKey}
                onChange={(e) => setLocal({ ...local, apiKey: e.target.value })}
                placeholder="sk-ant-..."
                style={{ ...inputStyle, paddingRight: 36 }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          )}

          {/* Model */}
          {field('Model', (
            <select value={local.model} onChange={(e) => setLocal({ ...local, model: e.target.value })} style={{ ...inputStyle }}>
              {MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          ))}

          {/* System prompt */}
          {field(
            'Custom System Prompt',
            <textarea
              value={local.systemPrompt ?? ''}
              onChange={(e) => setLocal({ ...local, systemPrompt: e.target.value })}
              placeholder="Enter custom instructions appended to every conversation..."
              rows={4}
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                minHeight: 80,
              }}
            />,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Passed via --append-system-prompt. Takes effect on new conversations.
            </span>
          )}

          {/* Thinking level */}
          {field('Thinking Mode', (
            <select
              value={local.thinkingLevel ?? 'off'}
              onChange={(e) => setLocal({ ...local, thinkingLevel: e.target.value as 'off' | 'adaptive' })}
              style={{ ...inputStyle }}
            >
              <option value="off">Off (Default)</option>
              <option value="adaptive">Adaptive (Extended Thinking)</option>
            </select>
          ),
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>In adaptive mode, Claude automatically engages deep thinking when needed</span>
          )}

          {/* Max turns */}
          {field(
            'Max Turns',
            <input
              type="number"
              min={1}
              max={200}
              value={local.maxTurns ?? ''}
              onChange={(e) => setLocal({ ...local, maxTurns: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="Unlimited"
              style={{ ...inputStyle, width: 120 }}
            />,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Limit how many tool-use turns Claude can execute (--max-turns). Leave empty for unlimited.
            </span>
          )}

          {/* Max budget */}
          {field(
            'Budget Limit (USD)',
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={local.maxBudgetUsd ?? ''}
              onChange={(e) => setLocal({ ...local, maxBudgetUsd: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="Unlimited"
              style={{ ...inputStyle, width: 120 }}
            />,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Stop execution when cost exceeds this amount (--max-budget-usd). Leave empty for unlimited.
            </span>
          )}

          {/* Working dir */}
          {field(
            'Working Folder',
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={local.workingDir}
                onChange={(e) => setLocal({ ...local, workingDir: e.target.value })}
                placeholder="Leave empty for home directory"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={async () => {
                  const p = await window.electronAPI.fsShowOpenDialog()
                  if (p) setLocal({ ...local, workingDir: p })
                }}
                style={{ background: 'var(--bg-active)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 10px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
              >
                Browse
              </button>
            </div>,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Claude will read and write files in this folder</span>
          )}

          {/* Font size */}
          {field(
            `Font Size: ${local.fontSize ?? 14}px`,
            <input
              type="range" min={12} max={20} step={1}
              value={local.fontSize ?? 14}
              onChange={(e) => setLocal({ ...local, fontSize: Number(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          )}

          {/* Font family */}
          {field('Font Family', (
            <select value={local.fontFamily} onChange={(e) => setLocal({ ...local, fontFamily: e.target.value })} style={{ ...inputStyle }}>
              {FONT_FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          ))}

          {/* Theme */}
          {field('Theme', (
            <div style={{ display: 'flex', gap: 8 }}>
              {THEMES.map((t) => {
                const isActive = (local.theme || 'vscode') === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setLocal({ ...local, theme: t.id })
                      setPrefs({ theme: t.id })
                      window.electronAPI.prefsSet('theme', t.id)
                    }}
                    title={t.label}
                    style={{
                      flex: 1, border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 6, padding: '6px 4px', background: t.colors[0],
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 2 }}>
                      {t.colors.map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />)}
                    </div>
                    <span style={{ fontSize: 9, color: '#aaa', whiteSpace: 'nowrap' }}>{t.label}</span>
                  </button>
                )
              })}
            </div>
          ))}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)', marginBottom: 14 }} />

          {/* skipPermissions */}
          {row(
            'Skip Tool Permissions',
            <Toggle value={local.skipPermissions ?? true} onChange={(v) => setLocal({ ...local, skipPermissions: v })} />,
            'When enabled, Claude does not ask for per-tool authorization'
          )}

          {/* verbose */}
          {row(
            'Verbose Output',
            <Toggle value={local.verbose ?? false} onChange={(v) => setLocal({ ...local, verbose: v })} />,
            'When enabled, CLI outputs more debug information'
          )}

          {/* Save button */}
          <button
            onClick={save}
            style={{
              background: saved ? 'var(--success)' : 'var(--accent)',
              border: 'none', borderRadius: 4, padding: '8px 16px',
              color: '#fff', cursor: 'pointer', fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 6,
              width: '100%', justifyContent: 'center', marginTop: 4,
            }}
          >
            <Save size={13} />
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        </>
      ) : settingsTab === 'mcp' ? (
        /* MCP tab */
        <div>
          {mcpServers.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
              No MCP servers configured<br />
              <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Add mcpServers to ~/.claude/settings.json</span>
            </div>
          ) : (
            mcpServers.map(srv => (
              <div key={srv.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{srv.name}</div>
                  {srv.command && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{srv.command}</div>}
                </div>
                <Toggle
                  value={!srv.disabled}
                  onChange={async (v) => {
                    await window.electronAPI.mcpSetEnabled(srv.name, v)
                    setMcpServers(prev => prev.map(s => s.name === srv.name ? { ...s, disabled: !v } : s))
                  }}
                />
              </div>
            ))
          )}
        </div>
      ) : (
        /* About tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* App identity */}
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-bright)', letterSpacing: 1 }}>AIPA</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>AI Personal Assistant</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>v1.0.0 &middot; Claude Code CLI v2.1.81</div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Links */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Links</div>
            {[
              { label: 'GitHub Repository', url: 'https://github.com/anthropics/claude-code' },
              { label: 'Anthropic Console', url: 'https://console.anthropic.com/' },
              { label: 'Claude API Docs', url: 'https://docs.anthropic.com/' },
              { label: 'Get API Key', url: 'https://console.anthropic.com/settings/keys' },
            ].map(link => (
              <button
                key={link.url}
                onClick={() => window.electronAPI.shellOpenExternal(link.url)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 10px', marginBottom: 4, background: 'none',
                  border: '1px solid var(--border)', borderRadius: 4,
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                {link.label}
              </button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Keyboard shortcuts */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Keyboard Shortcuts</div>
            {[
              { keys: 'Ctrl + B', action: 'Toggle sidebar' },
              { keys: 'Ctrl + `', action: 'Toggle terminal' },
              { keys: 'Ctrl + N', action: 'New conversation' },
              { keys: 'Ctrl + F', action: 'Search in conversation' },
              { keys: 'Enter', action: 'Send message' },
              { keys: 'Shift + Enter', action: 'New line in input' },
              { keys: '@', action: 'Mention file' },
              { keys: '/', action: 'Slash commands' },
            ].map(shortcut => (
              <div
                key={shortcut.keys}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>{shortcut.action}</span>
                <kbd style={{
                  fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-input)',
                  border: '1px solid var(--border)', borderRadius: 3, padding: '1px 6px',
                  fontFamily: 'inherit',
                }}>{shortcut.keys}</kbd>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Runtime info */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Runtime</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
              Electron {window.electronAPI.versions?.electron || 'N/A'}<br />
              Node.js {window.electronAPI.versions?.node || 'N/A'}<br />
              Chromium {window.electronAPI.versions?.chrome || 'N/A'}
            </div>
          </div>

          {/* Reset defaults */}
          <button
            onClick={async () => {
              const defaults = {
                model: 'claude-sonnet-4-6',
                fontSize: 14,
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                theme: 'vscode' as const,
                skipPermissions: true,
                verbose: false,
                workingDir: '',
                systemPrompt: '',
                thinkingLevel: 'off' as const,
                maxTurns: undefined,
                maxBudgetUsd: undefined,
              }
              setLocal(prev => ({ ...prev, ...defaults }))
              for (const [k, v] of Object.entries(defaults)) {
                await window.electronAPI.prefsSet(k, v)
              }
              setPrefs(defaults)
              setSaved(true)
              setTimeout(() => setSaved(false), 2000)
            }}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 4,
              padding: '8px 16px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
              width: '100%', textAlign: 'center', marginTop: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--error)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            Reset to Defaults
          </button>
        </div>
      )}
    </div>
  )
}
