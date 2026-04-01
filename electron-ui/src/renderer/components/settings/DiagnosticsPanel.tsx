import React, { useState, useEffect, useCallback } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Loader, ArrowLeft, RefreshCw } from 'lucide-react'
import { useT } from '../../i18n'

interface DiagnosticResult {
  id: string
  label: string
  status: 'ok' | 'warning' | 'error'
  detail: string
  subDetail?: string
}

interface DiagnosticsPanelProps {
  onBack: () => void
}

const statusIcon = (status: DiagnosticResult['status'] | 'loading', size = 18) => {
  switch (status) {
    case 'ok':
      return <CheckCircle size={size} style={{ color: '#4ade80', flexShrink: 0 }} />
    case 'warning':
      return <AlertTriangle size={size} style={{ color: '#facc15', flexShrink: 0 }} />
    case 'error':
      return <XCircle size={size} style={{ color: '#f87171', flexShrink: 0 }} />
    case 'loading':
      return <Loader size={size} style={{ color: 'var(--text-muted)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
  }
}

export default function DiagnosticsPanel({ onBack }: DiagnosticsPanelProps) {
  const t = useT()
  const [results, setResults] = useState<DiagnosticResult[]>([])
  const [loading, setLoading] = useState(true)

  const runChecks = useCallback(async () => {
    setLoading(true)
    setResults([])
    try {
      const data = await window.electronAPI.systemRunDiagnostics()
      setResults(data)
    } catch (err) {
      setResults([{ id: 'error', label: 'Error', status: 'error', detail: String(err) }])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    runChecks()
  }, [runChecks])

  // Map diagnostic IDs to i18n labels
  const getLabel = (r: DiagnosticResult) => {
    const keyMap: Record<string, string> = {
      cli: 'diagnostics.cliStatus',
      pty: 'diagnostics.ptyStatus',
      apikey: 'diagnostics.apiKeyStatus',
      system: 'diagnostics.systemInfo',
      sessions: 'diagnostics.sessionStats',
    }
    return keyMap[r.id] ? t(keyMap[r.id]) : r.label
  }

  const placeholderChecks = [
    { id: 'cli', label: t('diagnostics.cliStatus') },
    { id: 'pty', label: t('diagnostics.ptyStatus') },
    { id: 'apikey', label: t('diagnostics.apiKeyStatus') },
    { id: 'system', label: t('diagnostics.systemInfo') },
    { id: 'sessions', label: t('diagnostics.sessionStats') },
  ]

  const displayItems = loading ? placeholderChecks : results

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 4, borderRadius: 4,
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          title={t('common.back')}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)' }}>
          {t('diagnostics.title')}
        </span>
      </div>

      {/* Check items */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border)', borderRadius: 8,
        background: 'var(--card-bg)',
      }}>
        {displayItems.map((item, idx) => {
          const result = loading ? null : results.find(r => r.id === item.id)
          return (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 14px',
                borderBottom: idx < displayItems.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ paddingTop: 1 }}>
                {loading ? statusIcon('loading') : statusIcon(result!.status)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {loading ? item.label : getLabel(result!)}
                </div>
                {!loading && result && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {result.detail}
                    </div>
                    {result.subDetail && (
                      <div style={{
                        fontSize: 10, color: 'var(--text-muted)', marginTop: 2,
                        fontFamily: 'monospace', opacity: 0.8,
                      }}>
                        {result.subDetail}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Re-run button */}
      <button
        onClick={runChecks}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginTop: 12, padding: '8px 16px',
          background: 'none', border: '1px solid var(--border)', borderRadius: 6,
          color: loading ? 'var(--text-muted)' : 'var(--text-primary)',
          cursor: loading ? 'default' : 'pointer', fontSize: 12,
          width: '100%',
        }}
        onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = 'var(--accent)' }}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
        {t('diagnostics.rerun')}
      </button>
    </div>
  )
}
