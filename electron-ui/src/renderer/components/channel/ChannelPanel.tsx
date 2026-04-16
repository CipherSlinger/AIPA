// Channel panel — Providers + MCP — Iteration 536

import React, { useState } from 'react'
import { Radio, MessageCircle, Server, ExternalLink } from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'

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
  .channel-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
`

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ChannelPanel() {
  const t = useT()
  const [activeTab, setActiveTab] = useState<ChannelTab>('providers')
  const openSettingsAt = useUiStore(s => s.openSettingsAt)

  const tabStyle = (tab: ChannelTab): React.CSSProperties => ({
    flex: 1,
    padding: '5px 8px',
    fontSize: 10,
    fontWeight: activeTab === tab ? 700 : 500,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: activeTab === tab ? '#818cf8' : 'var(--text-muted)',
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
      background: 'var(--popup-bg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRight: '1px solid var(--border)', overflow: 'hidden',
    }}>
      <style>{CHANNEL_STYLE}</style>

      {/* Panel header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
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
            onMouseLeave={e => { if (activeTab !== 'providers') e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Radio size={11} />
            {t('channel.providersTab')}
          </button>
          <button
            style={tabStyle('mcp')}
            onClick={() => setActiveTab('mcp')}
            onMouseEnter={e => { if (activeTab !== 'mcp') e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { if (activeTab !== 'mcp') e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Server size={11} />
            {t('channel.mcpTab')}
          </button>
        </div>
      </div>

      {/* Tab content — glass card wrapper */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="channel-scroll" style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
          {/* Shortcut banner — visible on Providers tab */}
          {activeTab === 'providers' && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 12px', marginBottom: 8,
              borderRadius: 8,
              background: 'rgba(99,102,241,0.07)',
              border: '1px solid rgba(99,102,241,0.18)',
            }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Provider settings also available in <strong style={{ color: 'var(--text-secondary)' }}>Settings → AI Engine</strong>
              </span>
              <button
                onClick={() => openSettingsAt('ai-engine')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '3px 8px', borderRadius: 5, border: 'none',
                  background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
                  cursor: 'pointer', fontSize: 10, fontWeight: 600, flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.28)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)' }}
              >
                <ExternalLink size={9} />
                Open
              </button>
            </div>
          )}
          <div style={{
            borderRadius: 10,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
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
        padding: '6px 12px', borderTop: '1px solid var(--border)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--bg-hover)',
      }}>
        <MessageCircle size={10} color="var(--text-muted)" />
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {t('channel.footer')}
        </span>
      </div>
    </div>
  )
}
