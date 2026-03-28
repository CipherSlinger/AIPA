import React, { useState, useEffect } from 'react'
import { useI18n } from '../../i18n'
import Toggle from '../ui/Toggle'

export default function SettingsMcp() {
  const { t } = useI18n()
  const [mcpServers, setMcpServers] = useState<{ name: string; command?: string; disabled?: boolean }[]>([])

  useEffect(() => {
    window.electronAPI.mcpList().then(setMcpServers)
  }, [])

  return (
    <div>
      {mcpServers.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
          {t('settings.noMcpServers')}<br />
          <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>{t('settings.mcpHint')}</span>
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
  )
}
