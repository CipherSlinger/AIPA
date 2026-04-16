import React, { useCallback, useEffect, useState } from 'react'
import { Server, Plus, ToggleLeft, ToggleRight, Info, FileJson, AlertCircle } from 'lucide-react'
import { usePrefsStore } from '../../store'

// ── Types ────────────────────────────────────────────────────────────────────

interface McpServerStdio {
  type?: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

interface McpServerSse {
  type: 'sse'
  url: string
  disabled?: boolean
}

interface McpServerHttp {
  type: 'http'
  url: string
  disabled?: boolean
}

type McpServerConfig = McpServerStdio | McpServerSse | McpServerHttp

interface McpJson {
  mcpServers: Record<string, McpServerConfig>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function abbreviatePath(fullPath: string, homeDir: string): string {
  if (homeDir && fullPath.startsWith(homeDir)) {
    return '~' + fullPath.slice(homeDir.length)
  }
  return fullPath
}

function getServerType(cfg: McpServerConfig): string {
  if (cfg.type === 'sse') return 'sse'
  if (cfg.type === 'http') return 'http'
  return 'stdio'
}

function getServerPreview(cfg: McpServerConfig): string {
  if (cfg.type === 'sse' || cfg.type === 'http') {
    return cfg.url
  }
  const stdio = cfg as McpServerStdio
  const parts = [stdio.command, ...(stdio.args ?? [])].join(' ')
  return parts.length > 60 ? parts.slice(0, 57) + '…' : parts
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  stdio:  { bg: 'rgba(99,102,241,0.12)', text: '#818cf8', border: 'rgba(99,102,241,0.25)' },
  sse:    { bg: 'rgba(52,211,153,0.12)', text: '#34d399', border: 'rgba(52,211,153,0.25)' },
  http:   { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', border: 'rgba(251,191,36,0.25)' },
}

// ── ServerCard ────────────────────────────────────────────────────────────────

interface ServerCardProps {
  name: string
  config: McpServerConfig
  onToggleDisabled: (name: string) => void
}

function ServerCard({ name, config, onToggleDisabled }: ServerCardProps) {
  const type = getServerType(config)
  const preview = getServerPreview(config)
  const isDisabled = !!config.disabled
  const colors = TYPE_COLORS[type] ?? TYPE_COLORS.stdio

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        opacity: isDisabled ? 0.55 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: colors.bg, border: `1px solid ${colors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        <Server size={14} color={colors.text} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </span>
          {/* Type chip */}
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: colors.bg, color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: 4, padding: '2px 6px',
            flexShrink: 0,
          }}>
            {type}
          </span>
          {isDisabled && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'rgba(156,163,175,0.12)', color: 'var(--text-faint)',
              border: '1px solid rgba(156,163,175,0.20)',
              borderRadius: 4, padding: '2px 6px',
              flexShrink: 0,
            }}>
              disabled
            </span>
          )}
        </div>
        <div style={{
          fontSize: 11, color: 'var(--text-secondary)',
          fontFamily: 'monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {preview}
        </div>
      </div>

      {/* Toggle */}
      <button
        onClick={() => onToggleDisabled(name)}
        title={isDisabled ? 'Enable server' : 'Disable server'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, display: 'flex', alignItems: 'center',
          color: isDisabled ? 'var(--text-faint)' : '#818cf8',
          flexShrink: 0,
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = isDisabled ? 'var(--text-secondary)' : '#a5b4fc' }}
        onMouseLeave={e => { e.currentTarget.style.color = isDisabled ? 'var(--text-faint)' : '#818cf8' }}
        aria-label={isDisabled ? `Enable ${name}` : `Disable ${name}`}
      >
        {isDisabled
          ? <ToggleLeft size={20} />
          : <ToggleRight size={20} />}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const TEMPLATE: McpJson = { mcpServers: {} }

export default function SettingsProjectMcp() {
  const workingDir = usePrefsStore(s => s.prefs.workingDir)

  const [mcpJson, setMcpJson] = useState<McpJson | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filePath, setFilePath] = useState<string>('')
  const [homeDir, setHomeDir] = useState<string>('')
  const [toast, setToast] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const resolvedPath = useCallback((dir: string) => {
    const base = dir || homeDir
    if (!base) return ''
    return (base.endsWith('/') ? base : base + '/') + '.mcp.json'
  }, [homeDir])

  // Load home dir + file on mount / workingDir change
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const home = await window.electronAPI.fsGetHome() as string
        setHomeDir(home)

        const dir = workingDir || home
        const path = (dir.endsWith('/') ? dir : dir + '/') + '.mcp.json'
        setFilePath(path)

        const exists = await window.electronAPI.fsPathExists(path)
        if (!exists) {
          setMcpJson(null)
          setLoading(false)
          return
        }

        const raw = await window.electronAPI.fsReadFile(path) as string | { error: string }
        if (typeof raw !== 'string') {
          setError('Failed to read .mcp.json: ' + (raw?.error ?? 'unknown error'))
          setLoading(false)
          return
        }

        const parsed = JSON.parse(raw) as McpJson
        if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
          setError('.mcp.json is missing the "mcpServers" key.')
          setLoading(false)
          return
        }

        setMcpJson(parsed)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [workingDir]) // eslint-disable-line react-hooks/exhaustive-deps

  const writeFile = useCallback(async (updated: McpJson) => {
    const path = filePath || resolvedPath(workingDir)
    if (!path) return
    try {
      const result = await window.electronAPI.fsWriteFile(path, JSON.stringify(updated, null, 2))
      if (result && typeof result === 'object' && 'error' in (result as object)) {
        showToast('Failed to save .mcp.json')
      } else {
        showToast('Saved')
      }
    } catch {
      showToast('Failed to save .mcp.json')
    }
  }, [filePath, resolvedPath, workingDir, showToast])

  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const dir = workingDir || homeDir
      const path = (dir.endsWith('/') ? dir : dir + '/') + '.mcp.json'
      await window.electronAPI.fsWriteFile(path, JSON.stringify(TEMPLATE, null, 2))
      setFilePath(path)
      setMcpJson({ ...TEMPLATE, mcpServers: {} })
      showToast('Created .mcp.json')
    } catch {
      showToast('Failed to create .mcp.json')
    } finally {
      setCreating(false)
    }
  }, [workingDir, homeDir, showToast])

  const handleToggleDisabled = useCallback((name: string) => {
    if (!mcpJson) return
    const updated: McpJson = {
      ...mcpJson,
      mcpServers: {
        ...mcpJson.mcpServers,
        [name]: {
          ...mcpJson.mcpServers[name],
          disabled: !mcpJson.mcpServers[name].disabled,
        },
      },
    }
    setMcpJson(updated)
    writeFile(updated)
  }, [mcpJson, writeFile])

  // ── Render ──

  const displayPath = filePath
    ? abbreviatePath(filePath, homeDir)
    : resolvedPath(workingDir)
      ? abbreviatePath(resolvedPath(workingDir), homeDir)
      : '(no working directory set)'

  const serverEntries = mcpJson
    ? Object.entries(mcpJson.mcpServers)
    : []

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--glass-bg-high)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--glass-border-md)',
          borderRadius: 8, padding: '9px 18px',
          fontSize: 12, color: 'var(--text-primary)', zIndex: 9999,
          boxShadow: 'var(--glass-shadow)', pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Server size={16} color="#818cf8" />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            MCP Servers
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Project-level MCP server configuration (.mcp.json)
        </div>
      </div>

      {/* File path display */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px',
        marginBottom: 16,
      }}>
        <FileJson size={12} color="var(--text-faint)" style={{ flexShrink: 0 }} />
        <code style={{
          fontSize: 11, color: 'var(--text-secondary)',
          fontFamily: 'monospace', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {displayPath}
        </code>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          Loading…
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.20)',
          borderRadius: 8, padding: '10px 12px',
          marginBottom: 16,
        }}>
          <AlertCircle size={14} color="rgba(239,68,68,0.80)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.90)', lineHeight: 1.5 }}>
            {error}
          </div>
        </div>
      )}

      {/* Empty state — file not found */}
      {!loading && !error && !mcpJson && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '36px 24px', textAlign: 'center',
          background: 'var(--bg-secondary)',
          border: '1px dashed var(--border)',
          borderRadius: 10,
          gap: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileJson size={20} color="rgba(99,102,241,0.60)" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              No .mcp.json found in working directory
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Create a .mcp.json file to configure project-level MCP servers.
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              border: 'none', cursor: creating ? 'wait' : 'pointer',
              color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: 600,
              transition: 'opacity 0.15s ease',
              opacity: creating ? 0.7 : 1,
            }}
          >
            <Plus size={13} />
            Create .mcp.json
          </button>
        </div>
      )}

      {/* Server list */}
      {!loading && !error && mcpJson && (
        <>
          {/* Info banner */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            background: 'var(--glass-shimmer)',
            border: '1px solid var(--glass-border)',
            borderRadius: 8, padding: '9px 12px',
            marginBottom: 14,
          }}>
            <Info size={12} color="var(--text-faint)" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
              Changes are saved immediately to{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.85 }}>
                {displayPath}
              </code>
              . Restart Claude CLI to apply.
            </div>
          </div>

          {serverEntries.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12, color: 'var(--text-faint)',
            }}>
              <Server size={13} />
              No MCP servers configured yet. Edit{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 11 }}>.mcp.json</code>
              {' '}to add servers.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {serverEntries.map(([name, cfg]) => (
                <ServerCard
                  key={name}
                  name={name}
                  config={cfg}
                  onToggleDisabled={handleToggleDisabled}
                />
              ))}
            </div>
          )}

          {/* Count summary */}
          {serverEntries.length > 0 && (
            <div style={{
              marginTop: 12, fontSize: 11, color: 'var(--text-faint)',
              textAlign: 'right',
            }}>
              {serverEntries.length} server{serverEntries.length !== 1 ? 's' : ''}
              {' · '}
              {serverEntries.filter(([, c]) => !c.disabled).length} enabled
            </div>
          )}
        </>
      )}
    </>
  )
}
