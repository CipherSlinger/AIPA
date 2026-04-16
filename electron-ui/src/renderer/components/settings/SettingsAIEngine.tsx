// SettingsAIEngine — AI Engine settings tab (Iteration 565)
// Wraps SettingsProviders component, giving it a home in the Settings modal
// so users can access provider/API-key config without opening the Channel panel.

import React, { Suspense } from 'react'
import { Cpu } from 'lucide-react'

const SettingsProviders = React.lazy(() => import('./SettingsProviders'))

export default function SettingsAIEngine() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Cpu size={15} color="#818cf8" />
        <span style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        }}>
          AI 引擎 / AI Engine
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 4 }}>
        Configure AI providers, API keys, base URLs, and connection health. Changes take effect immediately.
      </div>

      <Suspense fallback={
        <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
          Loading provider settings...
        </div>
      }>
        <SettingsProviders />
      </Suspense>
    </div>
  )
}
