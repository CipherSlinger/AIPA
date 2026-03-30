// StatusBar model picker — extracted from StatusBar.tsx (Iteration 313)

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronUp, Check } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { MODEL_OPTIONS } from '../settings/settingsConstants'

interface ProviderGroup {
  providerId: string
  providerName: string
  healthStatus?: string
  models: { id: string; name: string; provider: string }[]
}

interface StatusBarModelPickerProps {
  modelLabel: string
  shortModel: string
  isClaudeModel: boolean
}

export default function StatusBarModelPicker({ modelLabel, shortModel, isClaudeModel }: StatusBarModelPickerProps) {
  const t = useT()
  const model = usePrefsStore(s => s.prefs.model)
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [providerModels, setProviderModels] = useState<ProviderGroup[]>([])

  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener('mousedown', handler)
    Promise.all([
      window.electronAPI.providerListConfigs(),
      window.electronAPI.providerListModels(),
      window.electronAPI.providerHealthStatuses(),
    ]).then(([configs, models, healthStatuses]: [any[], any[], any[]]) => {
      const healthMap: Record<string, string> = {}
      for (const s of healthStatuses) healthMap[s.providerId] = s.status
      const configMap = new Map<string, any>()
      for (const c of configs) if (c.enabled) configMap.set(c.id, c)
      const byProvider = new Map<string, any[]>()
      for (const m of models) {
        if (!byProvider.has(m.provider)) byProvider.set(m.provider, [])
        byProvider.get(m.provider)!.push(m)
      }
      const groups: ProviderGroup[] = []
      for (const [pid, pModels] of byProvider) {
        groups.push({ providerId: pid, providerName: configMap.get(pid)?.name || pid, healthStatus: healthMap[pid], models: pModels })
      }
      setProviderModels(groups)
    }).catch(() => { /* fallback to MODEL_OPTIONS */ })
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  const handleSelect = useCallback((modelId: string) => {
    usePrefsStore.getState().setPrefs({ model: modelId })
    window.electronAPI.prefsSet('model', modelId)
    setShow(false)
    useUiStore.getState().addToast('success', t('chat.modelSwitched', { model: modelId.replace('claude-', '') }))
  }, [t])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setShow(!show)}
        style={{
          padding: '1px 6px',
          borderRadius: 8,
          background: show ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
          fontSize: 10,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          opacity: 0.9,
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          transition: 'background 0.15s',
        }}
        title={t('chat.switchModel')}
      >
        {!isClaudeModel && (
          <span style={{ fontSize: 8, opacity: 0.7, padding: '0 3px', borderRadius: 3, background: 'rgba(255,255,255,0.15)' }}>
            {modelLabel.includes('gpt') ? 'OpenAI' : modelLabel.includes('deepseek') ? 'DeepSeek' : 'API'}
          </span>
        )}
        {shortModel}
        <ChevronUp size={8} style={{ opacity: 0.6, transform: show ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {show && (
        <div
          className="popup-enter"
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 4,
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            boxShadow: 'var(--popup-shadow)',
            borderRadius: 8,
            padding: '4px 0',
            minWidth: 180,
            zIndex: 100,
          }}
        >
          {(providerModels.length > 0 ? providerModels : [{ providerId: 'claude-cli', providerName: 'Claude', models: MODEL_OPTIONS.map(o => ({ id: o.id, name: o.id, provider: 'claude-cli' })) }]).map(group => (
            <React.Fragment key={group.providerId}>
              <div style={{ padding: '5px 12px 2px', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {group.healthStatus && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: group.healthStatus === 'healthy' ? '#22c55e' : group.healthStatus === 'degraded' ? '#f59e0b' : '#ef4444' }} />
                )}
                {group.providerName}
              </div>
              {group.models.map(m => {
                const isActive = m.id === (model || 'claude-sonnet-4-6')
                return (
                  <button
                    key={m.id}
                    onClick={() => handleSelect(m.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      padding: '5px 12px 5px 20px',
                      background: isActive ? 'var(--popup-item-hover)' : 'transparent',
                      border: 'none',
                      color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: 11,
                      textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {isActive && <Check size={11} />}
                    <span style={{ marginLeft: isActive ? 0 : 17 }}>{m.name}</span>
                  </button>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
