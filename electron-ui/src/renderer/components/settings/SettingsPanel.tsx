import React, { useEffect, useState } from 'react'
import { Save, Eye, EyeOff } from 'lucide-react'
import { usePrefsStore } from '../../store'

const MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'claude-opus-4-6',            label: 'Claude Opus（最强大）' },
  { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet（推荐）' },
  { id: 'claude-haiku-4-5',           label: 'Claude Haiku（最快速）' },
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
  { id: 'system-ui, sans-serif',                             label: '系统默认' },
]

const THEMES: { id: 'vscode' | 'modern' | 'minimal'; label: string; colors: string[] }[] = [
  { id: 'vscode',   label: 'VS Code',   colors: ['#1e1e1e', '#007acc', '#264f78', '#2d2d2d'] },
  { id: 'modern',   label: '现代深色',  colors: ['#0d1117', '#2f81f7', '#1f3a5f', '#161b22'] },
  { id: 'minimal',  label: '极简暗色',  colors: ['#111111', '#a855f7', '#1e1033', '#1a1a1a'] },
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
  const [settingsTab, setSettingsTab] = useState<'general' | 'mcp'>('general')
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
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>设置</div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {(['general', 'mcp'] as const).map(tab => (
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
            {tab === 'general' ? '通用' : 'MCP 服务器'}
          </button>
        ))}
      </div>

      {settingsTab === 'general' ? (
        <>
          {/* API Key */}
          {field(
            'API 密钥',
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
          {field('模型', (
            <select value={local.model} onChange={(e) => setLocal({ ...local, model: e.target.value })} style={{ ...inputStyle }}>
              {MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          ))}

          {/* System prompt */}
          {field(
            '附加系统提示词',
            <textarea
              value={local.systemPrompt ?? ''}
              onChange={(e) => setLocal({ ...local, systemPrompt: e.target.value })}
              placeholder="在此输入自定义指令，每次对话都会附加到系统提示词末尾..."
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
              通过 --append-system-prompt 传入 CLI，新对话生效
            </span>
          )}

          {/* Thinking level */}
          {field('思考模式', (
            <select
              value={local.thinkingLevel ?? 'off'}
              onChange={(e) => setLocal({ ...local, thinkingLevel: e.target.value as 'off' | 'adaptive' })}
              style={{ ...inputStyle }}
            >
              <option value="off">关闭（默认）</option>
              <option value="adaptive">自适应思考（Extended Thinking）</option>
            </select>
          ),
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>自适应模式下 Claude 会在需要时自动进行深度思考</span>
          )}

          {/* Max turns */}
          {field(
            '最大对话轮数',
            <input
              type="number"
              min={1}
              max={200}
              value={local.maxTurns ?? ''}
              onChange={(e) => setLocal({ ...local, maxTurns: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="不限制"
              style={{ ...inputStyle, width: 120 }}
            />,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              限制 Claude 最多执行几轮工具调用（--max-turns），留空不限制
            </span>
          )}

          {/* Max budget */}
          {field(
            '对话费用上限 (USD)',
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={local.maxBudgetUsd ?? ''}
              onChange={(e) => setLocal({ ...local, maxBudgetUsd: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="不限制"
              style={{ ...inputStyle, width: 120 }}
            />,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              费用超出此金额时 Claude 停止执行（--max-budget-usd），留空不限制
            </span>
          )}

          {/* Working dir */}
          {field(
            'AI 工作文件夹',
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={local.workingDir}
                onChange={(e) => setLocal({ ...local, workingDir: e.target.value })}
                placeholder="留空使用主目录"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={async () => {
                  const p = await window.electronAPI.fsShowOpenDialog()
                  if (p) setLocal({ ...local, workingDir: p })
                }}
                style={{ background: 'var(--bg-active)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 10px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
              >
                浏览
              </button>
            </div>,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Claude 会在这个文件夹里读写文件</span>
          )}

          {/* Font size */}
          {field(
            `字体大小：${local.fontSize ?? 14}px`,
            <input
              type="range" min={12} max={20} step={1}
              value={local.fontSize ?? 14}
              onChange={(e) => setLocal({ ...local, fontSize: Number(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          )}

          {/* Font family */}
          {field('字体族', (
            <select value={local.fontFamily} onChange={(e) => setLocal({ ...local, fontFamily: e.target.value })} style={{ ...inputStyle }}>
              {FONT_FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          ))}

          {/* Theme */}
          {field('界面主题', (
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
            '跳过工具权限确认',
            <Toggle value={local.skipPermissions ?? true} onChange={(v) => setLocal({ ...local, skipPermissions: v })} />,
            '开启后 Claude 无需逐工具请求授权'
          )}

          {/* verbose */}
          {row(
            '详细输出模式',
            <Toggle value={local.verbose ?? false} onChange={(v) => setLocal({ ...local, verbose: v })} />,
            '开启后 CLI 输出更多调试信息'
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
            {saved ? '已保存 ✓' : '保存设置'}
          </button>
        </>
      ) : (
        /* MCP tab */
        <div>
          {mcpServers.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
              未配置 MCP 服务器<br />
              <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>在 ~/.claude/settings.json 中添加 mcpServers 配置</span>
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
      )}
    </div>
  )
}
