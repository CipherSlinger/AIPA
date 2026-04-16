// Channel panel — MCP only (Providers moved to Settings → AI Engine)

import React from 'react'
import { Radio, MessageCircle, Server } from 'lucide-react'
import { useT } from '../../i18n'

const SettingsMcp = React.lazy(() => import('../settings/SettingsMcp'))

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={14} color="#818cf8" />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {t('channel.title')}
          </span>
          <Server size={11} color="var(--text-muted)" style={{ marginLeft: 'auto' }} />
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {t('channel.mcpTab')}
          </span>
        </div>
      </div>

      {/* MCP content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="channel-scroll" style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
          <div style={{
            borderRadius: 10,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <React.Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 11 }}>Loading...</div>}>
              <SettingsMcp />
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
