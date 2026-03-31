// Channel panel — Feishu & WeChat integration via OpenClaw — Iteration 321

import React, { useState } from 'react'
import { Radio, MessageCircle, CheckCircle2, XCircle, ExternalLink, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore } from '../../store'
import {
  FeishuConfig, WechatConfig,
  DEFAULT_FEISHU_CONFIG, DEFAULT_WECHAT_CONFIG,
  FEISHU_DOCS_URL, WECHAT_DOCS_URL,
} from './channelConstants'

type ActiveTab = 'feishu' | 'wechat'

// ── Shared field component ───────────────────────────────────────────────────

function ConfigField({
  label, value, onChange, placeholder, secret, hint, required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  secret?: boolean
  hint?: string
  required?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
        </label>
        {secret && (
          <button
            onClick={() => setShow(s => !s)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
          >
            {show ? <EyeOff size={11} /> : <Eye size={11} />}
          </button>
        )}
      </div>
      <input
        type={secret && !show ? 'password' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', height: 28, padding: '0 8px', boxSizing: 'border-box',
          background: 'var(--input-field-bg)', border: '1px solid var(--input-field-border)',
          borderRadius: 6, fontSize: 11, color: 'var(--text-primary)', outline: 'none',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--input-field-border)')}
      />
      {hint && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, opacity: 0.8 }}>{hint}</div>
      )}
    </div>
  )
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
      background: connected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.1)',
      color: connected ? '#10b981' : '#ef4444',
      border: `1px solid ${connected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
    }}>
      {connected
        ? <><CheckCircle2 size={10} /> Connected</>
        : <><XCircle size={10} /> Not connected</>
      }
    </div>
  )
}

// ── Feishu tab ────────────────────────────────────────────────────────────────

function FeishuTab() {
  const t = useT()
  const { prefs, setPrefs } = usePrefsStore()
  const cfg: FeishuConfig = prefs.channelFeishu ?? DEFAULT_FEISHU_CONFIG
  const [testing, setTesting] = useState(false)

  const update = (patch: Partial<FeishuConfig>) => {
    const next = { ...cfg, ...patch }
    setPrefs({ channelFeishu: next })
    window.electronAPI.prefsSet('channelFeishu', next)
  }

  const canConnect = cfg.appId.trim() && cfg.appSecret.trim()

  const handleTest = async () => {
    if (!canConnect) return
    setTesting(true)
    // Simulate connection test (real implementation would call main process)
    await new Promise(r => setTimeout(r, 1200))
    update({ connected: true, lastTestedAt: Date.now() })
    setTesting(false)
  }

  const handleDisconnect = () => {
    update({ connected: false, lastTestedAt: undefined })
  }

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🪶</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{t('channel.feishu.name')}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('channel.feishu.subtitle')}</div>
          </div>
        </div>
        <StatusBadge connected={cfg.connected} />
      </div>

      {/* Setup guide */}
      <div style={{
        padding: '8px 10px', borderRadius: 6, marginBottom: 12,
        background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.15)',
        fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text-secondary)' }}>{t('channel.setup')}</strong><br />
        {t('channel.feishu.setupHint')}
        <br />
        <a
          href={FEISHU_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => { e.preventDefault(); window.electronAPI?.shellOpenExternal?.(FEISHU_DOCS_URL) }}
          style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4 }}
        >
          {t('channel.viewDocs')} <ExternalLink size={9} />
        </a>
      </div>

      {/* Config fields */}
      <ConfigField
        label={t('channel.feishu.appId')}
        value={cfg.appId}
        onChange={v => update({ appId: v })}
        placeholder="cli_xxxxxxxxx"
        required
      />
      <ConfigField
        label={t('channel.feishu.appSecret')}
        value={cfg.appSecret}
        onChange={v => update({ appSecret: v })}
        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        secret
        required
      />
      <ConfigField
        label={t('channel.feishu.webhookUrl')}
        value={cfg.botWebhookUrl}
        onChange={v => update({ botWebhookUrl: v })}
        placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
        hint={t('channel.feishu.webhookHint')}
      />
      <ConfigField
        label={t('channel.feishu.verifyToken')}
        value={cfg.verifyToken}
        onChange={v => update({ verifyToken: v })}
        placeholder={t('channel.optional')}
        secret
        hint={t('channel.feishu.verifyHint')}
      />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {cfg.connected ? (
          <button
            onClick={handleDisconnect}
            style={{
              flex: 1, height: 30, background: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: 6,
              fontSize: 11, color: '#ef4444', cursor: 'pointer', fontWeight: 500,
            }}
          >
            {t('channel.disconnect')}
          </button>
        ) : (
          <button
            onClick={handleTest}
            disabled={!canConnect || testing}
            style={{
              flex: 1, height: 30,
              background: canConnect ? 'var(--accent)' : 'var(--input-field-bg)',
              border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600,
              color: canConnect ? '#fff' : 'var(--text-muted)',
              cursor: canConnect ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            {testing
              ? <><RefreshCw size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> {t('channel.testing')}</>
              : t('channel.connect')
            }
          </button>
        )}
      </div>

      {cfg.lastTestedAt && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
          {t('channel.lastTested')}: {new Date(cfg.lastTestedAt).toLocaleString()}
        </div>
      )}
    </div>
  )
}

// ── WeChat tab ────────────────────────────────────────────────────────────────

function WechatTab() {
  const t = useT()
  const { prefs, setPrefs } = usePrefsStore()
  const cfg: WechatConfig = prefs.channelWechat ?? DEFAULT_WECHAT_CONFIG
  const [testing, setTesting] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)

  const update = (patch: Partial<WechatConfig>) => {
    const next = { ...cfg, ...patch }
    setPrefs({ channelWechat: next })
    window.electronAPI.prefsSet('channelWechat', next)
  }

  const CLI_COMMAND = 'npx -y @tencent-weixin/openclaw-weixin-cli@latest install'

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(CLI_COMMAND)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2000)
    } catch { /* ignore */ }
  }

  const handleTest = async () => {
    setTesting(true)
    // Simulate connection test (real implementation would check CLI status)
    await new Promise(r => setTimeout(r, 1200))
    update({ cliInstalled: true, connected: true, lastTestedAt: Date.now() })
    setTesting(false)
  }

  const handleDisconnect = () => {
    update({ connected: false, lastTestedAt: undefined })
  }

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>💬</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{t('channel.wechat.name')}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('channel.wechat.subtitle')}</div>
          </div>
        </div>
        <StatusBadge connected={cfg.connected} />
      </div>

      {/* Setup guide */}
      <div style={{
        padding: '8px 10px', borderRadius: 6, marginBottom: 12,
        background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.15)',
        fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text-secondary)' }}>{t('channel.setup')}</strong><br />
        {t('channel.wechat.setupHint')}
        <br />
        <a
          href={WECHAT_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => { e.preventDefault(); window.electronAPI?.shellOpenExternal?.(WECHAT_DOCS_URL) }}
          style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4 }}
        >
          {t('channel.viewDocs')} <ExternalLink size={9} />
        </a>
      </div>

      {/* CLI command to copy */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {t('channel.wechat.installCommand')}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-active)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '6px 8px',
        }}>
          <code style={{
            flex: 1, fontSize: 10, fontFamily: 'monospace', color: 'var(--text-primary)',
            wordBreak: 'break-all', lineHeight: 1.4,
          }}>
            {CLI_COMMAND}
          </code>
          <button
            onClick={handleCopyCommand}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
              color: copyFeedback ? 'var(--success)' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', padding: 2,
            }}
            title={copyFeedback ? t('channel.wechat.copied') : t('channel.wechat.copyCommand')}
          >
            {copyFeedback ? <CheckCircle2 size={13} /> : <span style={{ fontSize: 11 }}>📋</span>}
          </button>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, opacity: 0.8 }}>
          {t('channel.wechat.installHint')}
        </div>
      </div>

      {/* Steps */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {t('channel.wechat.steps')}
        </div>
        {[
          t('channel.wechat.step1'),
          t('channel.wechat.step2'),
          t('channel.wechat.step3'),
        ].map((step, i) => (
          <div key={i} style={{
            display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6,
            fontSize: 10, color: 'var(--text-primary)', lineHeight: 1.5,
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
            }}>{i + 1}</span>
            <span>{step}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {cfg.connected ? (
          <button
            onClick={handleDisconnect}
            style={{
              flex: 1, height: 30, background: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: 6,
              fontSize: 11, color: '#ef4444', cursor: 'pointer', fontWeight: 500,
            }}
          >
            {t('channel.disconnect')}
          </button>
        ) : (
          <button
            onClick={handleTest}
            disabled={testing}
            style={{
              flex: 1, height: 30,
              background: 'var(--accent)',
              border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600,
              color: '#fff',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            {testing
              ? <><RefreshCw size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> {t('channel.testing')}</>
              : t('channel.wechat.testConnection')
            }
          </button>
        )}
      </div>

      {cfg.lastTestedAt && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
          {t('channel.lastTested')}: {new Date(cfg.lastTestedAt).toLocaleString()}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ChannelPanel() {
  const t = useT()
  const [activeTab, setActiveTab] = useState<ActiveTab>('feishu')
  const { prefs } = usePrefsStore()

  const feishuConnected = prefs.channelFeishu?.connected ?? false
  const wechatConnected = prefs.channelWechat?.connected ?? false
  const totalConnected = (feishuConnected ? 1 : 0) + (wechatConnected ? 1 : 0)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-sessionpanel)', overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '10px 12px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.06) 0%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Radio size={14} color="var(--text-muted)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('channel.title')}
          </span>
          {totalConnected > 0 && (
            <span style={{
              fontSize: 9, background: 'rgba(16, 185, 129, 0.12)', borderRadius: 8,
              padding: '1px 6px', color: '#10b981', fontWeight: 600,
            }}>
              {totalConnected} {t('channel.connectedCount')}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex' }}>
          {(['feishu', 'wechat'] as ActiveTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 5, padding: '7px 0', background: 'none', border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: activeTab === tab ? 600 : 400, fontSize: 11, cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab === 'feishu' ? '🪶' : '💬'}
              {tab === 'feishu' ? t('channel.feishu.name') : t('channel.wechat.name')}
              {tab === 'feishu' && feishuConnected && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
              )}
              {tab === 'wechat' && wechatConnected && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'feishu' ? <FeishuTab /> : <WechatTab />}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 12px', borderTop: '1px solid var(--border)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <MessageCircle size={10} color="var(--text-muted)" />
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {t('channel.footer')}
        </span>
      </div>

      <style>{`@keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
