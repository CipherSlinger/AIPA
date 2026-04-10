// Channel panel — Providers + MCP — Iteration 536

import React, { useState } from 'react'
import { Radio, MessageCircle, Server } from 'lucide-react'
import { useT } from '../../i18n'

const SettingsProviders = React.lazy(() => import('../settings/SettingsProviders'))
const SettingsMcp = React.lazy(() => import('../settings/SettingsMcp'))

type ChannelTab = 'providers' | 'mcp'

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ChannelPanel() {
  const t = useT()
  const [activeTab, setActiveTab] = useState<ChannelTab>('providers')

  const tabStyle = (tab: ChannelTab): React.CSSProperties => ({
    flex: 1,
    padding: '5px 8px',
    fontSize: 11,
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
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
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0 }}>
          <button style={tabStyle('providers')} onClick={() => setActiveTab('providers')}>
            <Radio size={11} />
            {t('channel.providersTab')}
          </button>
          <button style={tabStyle('mcp')} onClick={() => setActiveTab('mcp')}>
            <Server size={11} />
            {t('channel.mcpTab')}
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
          <React.Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 11 }}>Loading...</div>}>
            {activeTab === 'providers' ? <SettingsProviders /> : <SettingsMcp />}
          </React.Suspense>
        </div>
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
    </div>
  )
}
