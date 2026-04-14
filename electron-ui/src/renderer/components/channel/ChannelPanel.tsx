// Channel panel — Providers + MCP — Iteration 536

import React, { useState } from 'react'
import { Radio, MessageCircle, Server } from 'lucide-react'
import { useT } from '../../i18n'

const SettingsProviders = React.lazy(() => import('../settings/SettingsProviders'))
const SettingsMcp = React.lazy(() => import('../settings/SettingsMcp'))

type ChannelTab = 'providers' | 'mcp'

const CHANNEL_STYLE = `
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
    50%       { box-shadow: 0 0 0 4px rgba(34,197,94,0); }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(6px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .channel-scroll::-webkit-scrollbar { width: 4px; }
  .channel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
`

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ChannelPanel() {
  const t = useT()
  const [activeTab, setActiveTab] = useState<ChannelTab>('providers')

  const tabStyle = (tab: ChannelTab): React.CSSProperties => ({
    flex: 1,
    padding: '5px 8px',
    fontSize: 10,
    fontWeight: activeTab === tab ? 700 : 500,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: activeTab === tab ? '#818cf8' : 'var(--text-faint)',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === tab
      ? '2px solid rgba(99,102,241,0.6)'
      : '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  })

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--glass-bg-raised)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRight: '1px solid var(--glass-border)', overflow: 'hidden',
    }}>
      <style>{CHANNEL_STYLE}</style>

      {/* Panel header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--glass-border)',
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(99,102,241,0.06) 0%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Radio size={14} color="#818cf8" />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {t('channel.title')}
          </span>
        </div>

        {/* Tab bar — micro-label style */}
        <div style={{ display: 'flex', gap: 0 }}>
          <button
            style={tabStyle('providers')}
            onClick={() => setActiveTab('providers')}
            onMouseEnter={e => { if (activeTab !== 'providers') e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { if (activeTab !== 'providers') e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            <Radio size={11} />
            {t('channel.providersTab')}
          </button>
          <button
            style={tabStyle('mcp')}
            onClick={() => setActiveTab('mcp')}
            onMouseEnter={e => { if (activeTab !== 'mcp') e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { if (activeTab !== 'mcp') e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            <Server size={11} />
            {t('channel.mcpTab')}
          </button>
        </div>
      </div>

      {/* Tab content — glass card wrapper */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="channel-scroll" style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
          <div style={{
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            overflow: 'hidden',
          }}>
            <React.Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 11 }}>Loading...</div>}>
              {activeTab === 'providers' ? <SettingsProviders /> : <SettingsMcp />}
            </React.Suspense>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 12px', borderTop: '1px solid var(--glass-border)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(255,255,255,0.02)',
      }}>
        <MessageCircle size={10} color="var(--text-faint)" />
        <span style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {t('channel.footer')}
        </span>
      </div>
    </div>
  )
}
