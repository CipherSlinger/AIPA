import React, { useEffect, useState } from 'react'
import { Save, Eye, EyeOff } from 'lucide-react'
import { usePrefsStore } from '../../store'

const MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-opus-4',
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
]

const THEMES: { id: 'vscode' | 'modern' | 'minimal'; label: string; colors: string[] }[] = [
  {
    id: 'vscode',
    label: 'VS Code',
    colors: ['#1e1e1e', '#007acc', '#264f78', '#2d2d2d'],
  },
  {
    id: 'modern',
    label: '现代深色',
    colors: ['#0d1117', '#2f81f7', '#1f3a5f', '#161b22'],
  },
  {
    id: 'minimal',
    label: '极简暗色',
    colors: ['#111111', '#a855f7', '#1e1033', '#1a1a1a'],
  },
]

export default function SettingsPanel() {
  const { prefs, setPrefs } = usePrefsStore()
  const [local, setLocal] = useState({ ...prefs })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      const all = await window.electronAPI.prefsGetAll()
      const env = await window.electronAPI.configGetEnv()
      setLocal({
        ...all,
        apiKey: all.apiKey || env.apiKey || '',
      })
    }
    load()
  }, [])

  const save = async () => {
    setPrefs(local)
    await window.electronAPI.configSetApiKey(local.apiKey)
    for (const [k, v] of Object.entries(local)) {
      if (k !== 'apiKey') await window.electronAPI.prefsSet(k, v)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const field = (label: string, content: React.ReactNode) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {content}
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

  const checkboxField = (label: string, key: 'skipPermissions' | 'verbose') => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
      <input
        type="checkbox"
        checked={local[key]}
        onChange={(e) => setLocal({ ...local, [key]: e.target.checked })}
        style={{ accentColor: 'var(--accent)' }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{label}</span>
    </label>
  )

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>设置</div>

      {/* API Key */}
      {field('API Key', (
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
      ))}

      {/* Model */}
      {field('模型', (
        <select
          value={local.model}
          onChange={(e) => setLocal({ ...local, model: e.target.value })}
          style={{ ...inputStyle }}
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      ))}

      {/* Working dir */}
      {field('默认工作目录', (
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
        </div>
      ))}

      {/* Font size */}
      {field('终端字体大小', (
        <input
          type="number"
          value={local.fontSize}
          onChange={(e) => setLocal({ ...local, fontSize: Number(e.target.value) })}
          min={10} max={24}
          style={{ ...inputStyle, width: 80 }}
        />
      ))}

      {/* Flags */}
      {field('CLI 选项', (
        <div>
          {checkboxField('跳过权限确认 (--dangerously-skip-permissions)', 'skipPermissions')}
          {checkboxField('详细输出 (--verbose)', 'verbose')}
        </div>
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
                  flex: 1,
                  border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6,
                  padding: '6px 4px',
                  background: t.colors[0],
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {/* Mini color swatches */}
                <div style={{ display: 'flex', gap: 2 }}>
                  {t.colors.map((c, i) => (
                    <div
                      key={i}
                      style={{ width: 10, height: 10, borderRadius: 2, background: c }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: 9, color: '#aaa', whiteSpace: 'nowrap' }}>{t.label}</span>
              </button>
            )
          })}
        </div>
      ))}

      {/* Save button */}
      <button
        onClick={save}
        style={{
          background: saved ? 'var(--success)' : 'var(--accent)',
          border: 'none',
          borderRadius: 4,
          padding: '8px 16px',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          justifyContent: 'center',
        }}
      >
        <Save size={13} />
        {saved ? '已保存 ✓' : '保存设置'}
      </button>
    </div>
  )
}
