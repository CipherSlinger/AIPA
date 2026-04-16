// StatusBar model picker — extracted from StatusBar.tsx (Iteration 313)
// Enhanced with per-model pricing display (Iteration 376)

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronUp, Check } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { MODEL_OPTIONS } from '../settings/settingsConstants'

// Per-model pricing tiers (inspired by Claude Code modelCost.ts)
const MODEL_PRICING: Record<string, [number, number]> = {
  'claude-sonnet-4-6': [3, 15],
  'claude-sonnet-4-5': [3, 15],
  'claude-sonnet-4-0': [3, 15],
  'claude-3-7-sonnet': [3, 15],
  'claude-3-5-sonnet': [3, 15],
  'claude-opus-4-6': [5, 25],
  'claude-opus-4-5': [5, 25],
  'claude-opus-4-1': [15, 75],
  'claude-opus-4-0': [15, 75],
  'claude-haiku-4-5': [1, 5],
  'claude-3-5-haiku': [0.8, 4],
}

function getModelPricingLabel(modelId: string): string | null {
  const costs = MODEL_PRICING[modelId]
    || Object.entries(MODEL_PRICING).find(([k]) => modelId.includes(k))?.[1]
  if (!costs) return null
  const fmt = (n: number) => Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
  return `${fmt(costs[0])}/${fmt(costs[1])}`
}

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
  const [hoveredModel, setHoveredModel] = useState<string | null>(null)
  const [chipHovered, setChipHovered] = useState(false)

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
        onMouseEnter={() => setChipHovered(true)}
        onMouseLeave={() => setChipHovered(false)}
        style={{
          padding: '2px 8px',
          borderRadius: 6,
          background: chipHovered || show ? 'var(--border)' : 'var(--bg-hover)',
          border: '1px solid var(--border)',
          fontSize: 11,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          color: chipHovered || show ? 'var(--text-primary)' : 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          transition: 'all 0.15s ease',
        }}
        title={t('chat.switchModel')}
      >
        {!isClaudeModel && (
          <span style={{ fontSize: 8, opacity: 0.7, padding: '0 3px', borderRadius: 6, background: 'rgba(255,255,255,0.15)' }}>
            {modelLabel.includes('gpt') ? 'OpenAI' : modelLabel.includes('deepseek') ? 'DeepSeek' : 'API'}
          </span>
        )}
        {shortModel}
        <ChevronUp size={8} style={{ opacity: 0.6, transform: show ? 'rotate(180deg)' : 'none', transition: 'all 0.15s ease' }} />
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
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            padding: '4px 0',
            minWidth: 220,
            zIndex: 100,
          }}
        >
          {(providerModels.length > 0 ? providerModels : [{ providerId: 'claude-cli', providerName: 'Claude', models: MODEL_OPTIONS.map(o => ({ id: o.id, name: o.id, provider: 'claude-cli' })) }]).map(group => (
            <React.Fragment key={group.providerId}>
              <div style={{
                padding: '8px 12px 3px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                {group.healthStatus && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: group.healthStatus === 'healthy' ? '#22c55e' : group.healthStatus === 'degraded' ? '#fbbf24' : '#f87171' }} />
                )}
                {group.providerName}
              </div>
              {group.models.map(m => {
                const isActive = m.id === (model || 'claude-sonnet-4-6')
                const isHovered = hoveredModel === m.id
                return (
                  <button
                    key={m.id}
                    onClick={() => handleSelect(m.id)}
                    onMouseEnter={() => setHoveredModel(m.id)}
                    onMouseLeave={() => setHoveredModel(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      padding: '7px 12px 7px 20px',
                      background: isActive
                        ? 'rgba(99,102,241,0.12)'
                        : isHovered ? 'var(--bg-hover)' : 'transparent',
                      borderLeft: isActive ? '2px solid rgba(99,102,241,0.6)' : '2px solid transparent',
                      borderTop: 'none',
                      borderRight: 'none',
                      borderBottom: 'none',
                      borderRadius: isActive ? 0 : 5,
                      color: isActive ? '#818cf8' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isActive && <Check size={11} style={{ color: '#818cf8', flexShrink: 0 }} />}
                    <span style={{ marginLeft: isActive ? 0 : 17, flex: 1, fontWeight: 500, fontSize: 12 }}>{m.name}</span>
                    {(() => { const p = getModelPricingLabel(m.id); return p ? <span style={{ fontSize: 11, opacity: 0.55, whiteSpace: 'nowrap' }}>{p}</span> : null })()}
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
