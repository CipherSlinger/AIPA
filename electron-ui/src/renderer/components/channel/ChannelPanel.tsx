// Channel panel — Providers — Iteration 533 (simplified: removed Feishu/WeChat tabs)

import React from 'react'
import { Radio, MessageCircle } from 'lucide-react'
import { useT } from '../../i18n'

const SettingsProviders = React.lazy(() => import('../settings/SettingsProviders'))

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ChannelPanel() {
  const t = useT()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-sessionpanel)', overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '10px 12px',
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
      </div>

      {/* Providers content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
          <React.Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 11 }}>Loading...</div>}>
            <SettingsProviders />
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
