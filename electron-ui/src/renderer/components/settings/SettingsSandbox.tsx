import React, { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { useI18n } from '../../i18n'
import SettingsGroup from './SettingsGroup'
import Toggle from '../ui/Toggle'
import { Shield, Globe, FolderLock } from 'lucide-react'
import { INPUT_STYLE } from './settingsConstants'

interface SandboxConfig {
  autoAllowBashIfSandboxed?: boolean
  network?: {
    allowedDomains?: string[]
  }
  allowWrite?: string[]
  denyWrite?: string[]
  denyRead?: string[]
}

function ChipList({
  items,
  onRemove,
  addPlaceholder,
  onAdd,
  chipColor,
}: {
  items: string[]
  onRemove: (index: number) => void
  addPlaceholder: string
  onAdd: (value: string) => void
  chipColor?: string
}) {
  const [input, setInput] = useState('')

  const commit = () => {
    const trimmed = input.trim()
    if (trimmed && !items.includes(trimmed)) {
      onAdd(trimmed)
    }
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') setInput('')
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: items.length ? 8 : 0 }}>
        {items.map((item, idx) => (
          <span
            key={idx}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: chipColor ?? 'var(--glass-bg-mid)',
              border: '1px solid var(--glass-border)',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 12,
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
            }}
          >
            {item.length > 40 ? item.slice(0, 40) + '…' : item}
            <button
              onClick={() => onRemove(idx)}
              aria-label={`Remove ${item}`}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-faint)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
                lineHeight: 1,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={addPlaceholder}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }}
          style={{ ...INPUT_STYLE, flex: 1 }}
        />
        <button
          onClick={commit}
          aria-label="Add"
          style={{
            background: 'var(--glass-bg-mid)',
            border: '1px solid var(--glass-border)',
            borderRadius: 7,
            padding: '0 10px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

export default function SettingsSandbox() {
  const { t } = useI18n()
  const [config, setConfig] = useState<SandboxConfig>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.configReadCLISettings().then((raw: Record<string, unknown>) => {
      const network = raw.network as Record<string, unknown> | undefined
      setConfig({
        autoAllowBashIfSandboxed: typeof raw.autoAllowBashIfSandboxed === 'boolean'
          ? raw.autoAllowBashIfSandboxed
          : false,
        network: {
          allowedDomains: Array.isArray(network?.allowedDomains)
            ? (network!.allowedDomains as string[])
            : [],
        },
        allowWrite: Array.isArray(raw.allowWrite) ? (raw.allowWrite as string[]) : [],
        denyWrite: Array.isArray(raw.denyWrite) ? (raw.denyWrite as string[]) : [],
        denyRead: Array.isArray(raw.denyRead) ? (raw.denyRead as string[]) : [],
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const patch = (partial: Partial<SandboxConfig>) => {
    const next = { ...config, ...partial }
    setConfig(next)
    // Build the flat patch to write (network is a nested object)
    const writePatch: Record<string, unknown> = {}
    if (partial.autoAllowBashIfSandboxed !== undefined) {
      writePatch.autoAllowBashIfSandboxed = partial.autoAllowBashIfSandboxed
    }
    if (partial.network !== undefined) {
      writePatch.network = next.network
    }
    if (partial.allowWrite !== undefined) writePatch.allowWrite = partial.allowWrite
    if (partial.denyWrite !== undefined) writePatch.denyWrite = partial.denyWrite
    if (partial.denyRead !== undefined) writePatch.denyRead = partial.denyRead
    window.electronAPI.configWriteCLISettings(writePatch).catch(() => {})
  }

  const domains = config.network?.allowedDomains ?? []
  const allowWrite = config.allowWrite ?? []
  const denyWrite = config.denyWrite ?? []
  const denyRead = config.denyRead ?? []

  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      {control}
    </div>
  )

  const field = (label: string, content: React.ReactNode, labelColor?: string) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: labelColor ?? 'var(--text-faint)',
        marginBottom: 6,
      }}>
        {label}
      </div>
      {content}
    </div>
  )

  if (loading) return (
    <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: 16 }}>
      {t('common.loading') || 'Loading…'}
    </div>
  )

  return (
    <>
      {/* Section 1: Auto bash */}
      <SettingsGroup title={t('sandbox.title')} icon={<Shield size={14} />} groupKey="sandbox-general">
        {row(
          t('sandbox.autoAllowBash'),
          <Toggle
            value={config.autoAllowBashIfSandboxed ?? false}
            onChange={v => patch({ autoAllowBashIfSandboxed: v })}
          />,
        )}
      </SettingsGroup>

      {/* Section 2: Network */}
      <SettingsGroup title={t('sandbox.network')} icon={<Globe size={14} />} groupKey="sandbox-network">
        {field(
          t('sandbox.allowedDomains'),
          <ChipList
            items={domains}
            addPlaceholder={t('sandbox.addDomain')}
            onAdd={v => patch({ network: { allowedDomains: [...domains, v] } })}
            onRemove={i => patch({ network: { allowedDomains: domains.filter((_, idx) => idx !== i) } })}
          />,
        )}
      </SettingsGroup>

      {/* Section 3: Filesystem */}
      <SettingsGroup title={t('sandbox.filesystem')} icon={<FolderLock size={14} />} groupKey="sandbox-fs">
        {field(
          t('sandbox.allowWrite'),
          <ChipList
            items={allowWrite}
            addPlaceholder={t('sandbox.addPath')}
            onAdd={v => patch({ allowWrite: [...allowWrite, v] })}
            onRemove={i => patch({ allowWrite: allowWrite.filter((_, idx) => idx !== i) })}
            chipColor="rgba(34,197,94,0.12)"
          />,
          'var(--color-success, #22c55e)',
        )}
        <div style={{ height: 1, background: 'var(--glass-border)', marginBottom: 14 }} />
        {field(
          t('sandbox.denyWrite'),
          <ChipList
            items={denyWrite}
            addPlaceholder={t('sandbox.addPath')}
            onAdd={v => patch({ denyWrite: [...denyWrite, v] })}
            onRemove={i => patch({ denyWrite: denyWrite.filter((_, idx) => idx !== i) })}
            chipColor="rgba(239,68,68,0.12)"
          />,
          'var(--color-error, #ef4444)',
        )}
        <div style={{ height: 1, background: 'var(--glass-border)', marginBottom: 14 }} />
        {field(
          t('sandbox.denyRead'),
          <ChipList
            items={denyRead}
            addPlaceholder={t('sandbox.addPath')}
            onAdd={v => patch({ denyRead: [...denyRead, v] })}
            onRemove={i => patch({ denyRead: denyRead.filter((_, idx) => idx !== i) })}
            chipColor="rgba(239,68,68,0.12)"
          />,
          'var(--color-error, #ef4444)',
        )}
      </SettingsGroup>
    </>
  )
}
