import React, { useState, useEffect, useCallback } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Loader, ArrowLeft, RefreshCw, Copy, Server } from 'lucide-react'
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

const statusIcon = (status: DiagnosticResult['status'] | 'loading', size = 16) => {
  switch (status) {
    case 'ok':
      return <CheckCircle size={size} style={{ color: '#4ade80', flexShrink: 0 }} />
    case 'warning':
      return <AlertTriangle size={size} style={{ color: '#fbbf24', flexShrink: 0 }} />
    case 'error':
      return <XCircle size={size} style={{ color: '#f87171', flexShrink: 0 }} />
    case 'loading':
      return <Loader size={size} style={{ color: 'var(--text-muted)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
  }
}

interface McpServerStatus {
  name: string
  status: 'ok' | 'error' | 'disabled'
  detail: string
}

export default function DiagnosticsPanel({ onBack }: DiagnosticsPanelProps) {
  const t = useT()
  const [results, setResults] = useState<DiagnosticResult[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [claudeMdResult, setClaudeMdResult] = useState<DiagnosticResult | null>(null)
  const [mcpStatuses, setMcpStatuses] = useState<McpServerStatus[]>([])
  const [extraLoading, setExtraLoading] = useState(true)

  const runChecks = useCallback(async () => {
    setLoading(true)
    setExtraLoading(true)
    setResults([])
    setClaudeMdResult(null)
    setMcpStatuses([])
    try {
      const data = await window.electronAPI.systemRunDiagnostics()
      setResults(data)
    } catch (err) {
      setResults([{ id: 'error', label: 'Error', status: 'error', detail: String(err) }])
    }
    setLoading(false)

    // CLAUDE.md check
    try {
      const prefs = await window.electronAPI.prefsGetAll()
      const cwd = (prefs as Record<string, unknown>).workingDir as string || ''
      const checkPath = cwd ? `${cwd}/CLAUDE.md` : 'CLAUDE.md'
      const exists = await window.electronAPI.fsPathExists(checkPath)
      setClaudeMdResult({
        id: 'claudemd',
        label: t('diagnostics.claudeMdStatus'),
        status: exists ? 'ok' : 'warning',
        detail: exists
          ? `Found: ${checkPath}`
          : `Not found in working directory${cwd ? ` (${cwd})` : ''}. Create CLAUDE.md to provide project instructions.`,
      })
    } catch {
      setClaudeMdResult({
        id: 'claudemd',
        label: t('diagnostics.claudeMdStatus'),
        status: 'error',
        detail: 'Could not check CLAUDE.md',
      })
    }

    // MCP server connectivity
    try {
      const mcpList = await window.electronAPI.mcpList() as { servers?: { name: string; enabled?: boolean; status?: string }[] } | null
      const servers = mcpList?.servers || []
      if (servers.length === 0) {
        setMcpStatuses([{ name: 'No MCP servers configured', status: 'ok', detail: '' }])
      } else {
        setMcpStatuses(
          servers.map(s => ({
            name: s.name,
            status: s.enabled === false ? 'disabled' : (s.status === 'error' ? 'error' : 'ok'),
            detail: s.enabled === false ? 'Disabled' : (s.status === 'error' ? 'Connection failed' : 'Connected'),
          }))
        )
      }
    } catch {
      setMcpStatuses([{ name: 'MCP', status: 'error', detail: 'Could not fetch MCP server list' }])
    }
    setExtraLoading(false)
  }, [t])

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

  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    }).catch(() => {})
  }, [])

  const placeholderChecks = [
    { id: 'cli', label: t('diagnostics.cliStatus') },
    { id: 'pty', label: t('diagnostics.ptyStatus') },
    { id: 'apikey', label: t('diagnostics.apiKeyStatus') },
    { id: 'system', label: t('diagnostics.systemInfo') },
    { id: 'sessions', label: t('diagnostics.sessionStats') },
  ]

  const displayItems = loading ? placeholderChecks : results
  const isStillLoading = loading || extraLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            color: 'var(--text-secondary)', padding: '4px 6px', borderRadius: 6,
            display: 'flex', alignItems: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--text-primary)'
            e.currentTarget.style.background = 'var(--border)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--text-primary)'
            e.currentTarget.style.background = 'var(--bg-hover)'
          }}
          title={t('common.back')}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('diagnostics.title')}
        </span>
      </div>

      {/* Check items */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--glass-bg-low)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}>
        {displayItems.map((item, idx) => {
          const result = loading ? null : results.find(r => r.id === item.id)
          const copyText = result ? [result.detail, result.subDetail].filter(Boolean).join('\n') : ''
          return (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 16px',
                borderBottom: idx < displayItems.length - 1 ? '1px solid var(--bg-hover)' : 'none',
              }}
            >
              <div style={{ paddingTop: 2 }}>
                {loading ? statusIcon('loading') : statusIcon(result!.status)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {loading ? item.label : getLabel(result!)}
                </div>
                {!loading && result && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
                      {result.detail}
                    </div>
                    {result.subDetail && (
                      <div style={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: 'rgba(165,180,252,0.8)',
                        background: 'var(--code-bg)',
                        borderRadius: 6,
                        padding: '2px 6px',
                        marginTop: 4,
                        display: 'inline-block',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {result.subDetail}
                      </div>
                    )}
                  </>
                )}
              </div>
              {!loading && result && copyText && (
                <button
                  onClick={() => handleCopy(item.id, copyText)}
                  title="Copy"
                  style={{
                    background: copiedId === item.id ? 'rgba(74,222,128,0.12)' : 'var(--bg-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '3px 6px',
                    color: copiedId === item.id ? '#4ade80' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    if (copiedId !== item.id) e.currentTarget.style.background = 'var(--border)'
                  }}
                  onMouseLeave={e => {
                    if (copiedId !== item.id) e.currentTarget.style.background = 'var(--bg-hover)'
                  }}
                >
                  <Copy size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* CLAUDE.md check */}
      <div style={{
        marginTop: 8,
        background: 'var(--glass-bg-low)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 16px',
        }}>
          <div style={{ paddingTop: 2 }}>
            {extraLoading ? statusIcon('loading') : (claudeMdResult ? statusIcon(claudeMdResult.status) : statusIcon('loading'))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('diagnostics.claudeMdStatus')}
            </div>
            {!extraLoading && claudeMdResult && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
                {claudeMdResult.detail}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MCP Connectivity */}
      <div style={{
        marginTop: 8,
        background: 'var(--glass-bg-low)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        {extraLoading ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px' }}>
            <div style={{ paddingTop: 2 }}>{statusIcon('loading')}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t('diagnostics.mcpConnectivity')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>Loading…</div>
            </div>
          </div>
        ) : mcpStatuses.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px' }}>
            <div style={{ paddingTop: 2 }}>
              <Server size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t('diagnostics.mcpConnectivity')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>No MCP servers configured</div>
            </div>
          </div>
        ) : (
          mcpStatuses.map((srv, idx) => (
            <div
              key={srv.name}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 16px',
                borderBottom: idx < mcpStatuses.length - 1 ? '1px solid var(--bg-hover)' : 'none',
              }}
            >
              <div style={{ paddingTop: 2 }}>
                {srv.status === 'ok'
                  ? statusIcon('ok')
                  : srv.status === 'disabled'
                    ? <Server size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    : statusIcon('error')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{srv.name}</div>
                {srv.detail && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{srv.detail}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Re-run button */}
      <button
        onClick={runChecks}
        disabled={isStillLoading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginTop: 10, padding: '8px 16px',
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          color: loading ? 'var(--text-muted)' : 'var(--text-secondary)',
          cursor: isStillLoading ? 'not-allowed' : 'pointer', fontSize: 12,
          width: '100%',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { if (!isStillLoading) e.currentTarget.style.background = 'var(--border)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
      >
        <RefreshCw size={12} style={isStillLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
        {t('diagnostics.rerun')}
      </button>
    </div>
  )
}
