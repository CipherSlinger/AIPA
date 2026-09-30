// Settings → MCP.
//
// Which file this page edits depends on the active engine (see
// main/config/mcp-config.ts): Codex keeps MCP servers in ~/.codex/config.toml
// while the Claude CLI reads a project-scoped .mcp.json. Both are surfaced here
// with one card list so the page reads the same either way.
import React, { useCallback, useEffect, useState } from 'react'
import { Server, Plus, ToggleLeft, ToggleRight, Info, FileJson, AlertCircle, Trash2 } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import type { McpConfigInfoData, McpServerConfigData } from '../../../preload/index'

// ── Types ────────────────────────────────────────────────────────────────────

interface JsonMcpServer {
  type?: string
  command?: string
  args?: string[]
  url?: string
  disabled?: boolean
}

interface McpJson {
  mcpServers: Record<string, JsonMcpServer>
}

/** Engine-neutral view model the card renders. */
interface DisplayServer {
  name: string
  type: 'stdio' | 'http' | 'sse'
  preview: string
  disabled: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function abbreviatePath(fullPath: string, homeDir: string): string {
  if (homeDir && fullPath.startsWith(homeDir)) {
    return '~' + fullPath.slice(homeDir.length)
  }
  return fullPath
}

function serverType(type: string | undefined, url: string | undefined): 'stdio' | 'http' | 'sse' {
  if (type === 'sse' || type === 'http' || type === 'stdio') return type
  return url ? 'http' : 'stdio'
}

function stdioPreview(command: string | undefined, args: string[] | undefined): string {
  const parts = [command ?? '', ...(args ?? [])].join(' ').trim()
  return parts.length > 60 ? parts.slice(0, 57) + '…' : parts
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  stdio:  { bg: 'rgba(99,102,241,0.12)', text: '#818cf8', border: 'rgba(99,102,241,0.25)' },
  sse:    { bg: 'rgba(52,211,153,0.12)', text: '#34d399', border: 'rgba(52,211,153,0.25)' },
  http:   { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', border: 'rgba(251,191,36,0.25)' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 30, padding: '0 10px', boxSizing: 'border-box',
  background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 12, color: 'var(--text-primary)', outline: 'none',
}

// ── ServerCard ────────────────────────────────────────────────────────────────

interface ServerCardProps {
  server: DisplayServer
  onToggleDisabled: (name: string) => void
  onDelete: (name: string) => void
}

function ServerCard({ server, onToggleDisabled, onDelete }: ServerCardProps) {
  const t = useT()
  const colors = TYPE_COLORS[server.type] ?? TYPE_COLORS.stdio
  const isDisabled = server.disabled

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
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: colors.bg, border: `1px solid ${colors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        <Server size={14} color={colors.text} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {server.name}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: colors.bg, color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: 4, padding: '2px 6px',
            flexShrink: 0,
          }}>
            {server.type}
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
              {t('settings.mcpPage.disabled')}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 11, color: 'var(--text-secondary)',
          fontFamily: 'monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {server.preview}
        </div>
      </div>

      <button
        onClick={() => onDelete(server.name)}
        title={t('mcp.removeServer')}
        aria-label={t('mcp.removeServer')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, display: 'flex', alignItems: 'center',
          color: 'var(--text-faint)', flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#f87171' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)' }}
      >
        <Trash2 size={14} />
      </button>

      <button
        onClick={() => onToggleDisabled(server.name)}
        title={isDisabled ? t('settings.mcpPage.enableServer') : t('settings.mcpPage.disableServer')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, display: 'flex', alignItems: 'center',
          color: isDisabled ? 'var(--text-faint)' : '#818cf8',
          flexShrink: 0,
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = isDisabled ? 'var(--text-secondary)' : '#a5b4fc' }}
        onMouseLeave={e => { e.currentTarget.style.color = isDisabled ? 'var(--text-faint)' : '#818cf8' }}
        aria-label={isDisabled ? t('settings.mcpPage.enableServer') : t('settings.mcpPage.disableServer')}
      >
        {isDisabled ? <ToggleLeft size={20} /> : <ToggleRight size={20} />}
      </button>
    </div>
  )
}

// ── AddServerForm ─────────────────────────────────────────────────────────────

function AddServerForm({ existingNames, onAdd, onCancel }: {
  existingNames: string[]
  onAdd: (name: string, config: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError(t('mcp.errorNameRequired')); return }
    if (existingNames.includes(trimmed)) { setError(t('mcp.errorNameExists')); return }
    if (transport === 'stdio' && !command.trim()) { setError(t('settings.mcpPage.errorCommandRequired')); return }
    if (transport === 'http' && !url.trim()) { setError(t('mcp.errorUrlRequired')); return }

    const config: Record<string, unknown> = transport === 'stdio'
      ? {
          type: 'stdio',
          command: command.trim(),
          args: args.trim() ? args.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        }
      : { type: 'http', url: url.trim() }

    setSaving(true)
    await onAdd(trimmed, config)
    setSaving(false)
  }

  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 14, marginBottom: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t('mcp.addServer')}</div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('mcp.fieldServerNameRequired')}</span>
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="my-tool" />
      </label>

      <div style={{ display: 'flex', gap: 6 }}>
        {(['stdio', 'http'] as const).map(kind => (
          <button
            key={kind}
            onClick={() => setTransport(kind)}
            style={{
              flex: 1, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: transport === kind ? 'rgba(99,102,241,0.14)' : 'var(--bg-primary)',
              border: `1px solid ${transport === kind ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
              color: transport === kind ? '#818cf8' : 'var(--text-muted)',
            }}
          >
            {kind === 'stdio' ? t('mcp.typeStdio') : t('mcp.typeHttp')}
          </button>
        ))}
      </div>

      {transport === 'stdio' ? (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('mcp.fieldCommandRequired')}</span>
            <input style={inputStyle} value={command} onChange={e => setCommand(e.target.value)} placeholder="npx" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('mcp.fieldArgs')}</span>
            <input style={inputStyle} value={args} onChange={e => setArgs(e.target.value)} placeholder={t('mcp.fieldArgsPlaceholder')} />
          </label>
        </>
      ) : (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('mcp.fieldUrlRequired')}</span>
          <input style={inputStyle} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/mcp" />
        </label>
      )}

      {error && <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.90)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={submit}
          disabled={saving}
          style={{
            padding: '7px 16px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            color: 'var(--text-bright)', fontSize: 12, fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? t('mcp.adding') : t('mcp.addServerBtn')}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', fontSize: 12,
          }}
        >
          {t('mcp.cancel')}
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsProjectMcp() {
  const t = useT()
  const workingDir = usePrefsStore(s => s.prefs.workingDir)

  const [configInfo, setConfigInfo] = useState<McpConfigInfoData | null>(null)
  // Claude branch: parsed project .mcp.json (null = file not created yet)
  const [mcpJson, setMcpJson] = useState<McpJson | null>(null)
  // Codex branch: servers read back from ~/.codex/config.toml
  const [codexServers, setCodexServers] = useState<McpServerConfigData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filePath, setFilePath] = useState<string>('')
  const [homeDir, setHomeDir] = useState<string>('')
  const [toast, setToast] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [adding, setAdding] = useState(false)

  const isCodex = configInfo?.engine === 'codex'

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const projectMcpPath = useCallback((base: string) => {
    if (!base) return ''
    return (base.endsWith('/') ? base : base + '/') + '.mcp.json'
  }, [])

  const reloadCodexServers = useCallback(async () => {
    const cfg = await window.electronAPI.mcpReadConfig()
    setCodexServers(cfg?.servers ?? [])
  }, [])

  // Load home dir + the engine's config on mount / workingDir change
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const home = await window.electronAPI.fsGetHome() as string
        setHomeDir(home)

        const info = await window.electronAPI.mcpConfigInfo()
        setConfigInfo(info)

        // Codex: one global config.toml, no project-level file to look for
        if (info.engine === 'codex') {
          await reloadCodexServers()
          setLoading(false)
          return
        }

        // Claude: project-level .mcp.json, as before
        const dir = workingDir || home
        const path = projectMcpPath(dir)
        setFilePath(path)

        const exists = await window.electronAPI.fsPathExists(path)
        if (!exists) {
          setMcpJson(null)
          setLoading(false)
          return
        }

        const raw = await window.electronAPI.fsReadFile(path) as string | { error: string }
        if (typeof raw !== 'string') {
          setError(t('settings.mcpPage.readFailed') + (raw?.error ?? ''))
          setLoading(false)
          return
        }

        const parsed = JSON.parse(raw) as McpJson
        if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
          setError(t('settings.mcpPage.missingKey'))
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
  }, [workingDir, projectMcpPath, reloadCodexServers, t])

  const writeJsonFile = useCallback(async (updated: McpJson) => {
    if (!filePath) return
    try {
      const result = await window.electronAPI.fsWriteFile(filePath, JSON.stringify(updated, null, 2))
      if (result && typeof result === 'object' && 'error' in (result as object)) {
        showToast(t('settings.mcpPage.saveFailed'))
      } else {
        showToast(t('settings.mcpPage.saved'))
      }
    } catch {
      showToast(t('settings.mcpPage.saveFailed'))
    }
  }, [filePath, showToast, t])

  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const dir = workingDir || homeDir
      const path = projectMcpPath(dir)
      await window.electronAPI.fsWriteFile(path, JSON.stringify({ mcpServers: {} }, null, 2))
      setFilePath(path)
      setMcpJson({ mcpServers: {} })
      showToast(t('settings.mcpPage.createdFile'))
    } catch {
      showToast(t('settings.mcpPage.createFailed'))
    } finally {
      setCreating(false)
    }
  }, [workingDir, homeDir, projectMcpPath, showToast, t])

  const handleAdd = useCallback(async (name: string, config: Record<string, unknown>) => {
    if (isCodex) {
      const result = await window.electronAPI.mcpAdd(name, String(config.type ?? 'stdio'), config)
      if (!result?.success) { showToast(result?.error || t('settings.mcpPage.saveFailed')); return }
      await reloadCodexServers()
    } else {
      const updated: McpJson = {
        mcpServers: { ...(mcpJson?.mcpServers ?? {}), [name]: config as JsonMcpServer },
      }
      setMcpJson(updated)
      await writeJsonFile(updated)
    }
    setAdding(false)
  }, [isCodex, mcpJson, reloadCodexServers, showToast, t, writeJsonFile])

  const handleDelete = useCallback(async (name: string) => {
    if (isCodex) {
      const result = await window.electronAPI.mcpRemove(name)
      if (!result?.success) { showToast(result?.error || t('settings.mcpPage.saveFailed')); return }
      await reloadCodexServers()
    } else if (mcpJson) {
      const next = { ...mcpJson.mcpServers }
      delete next[name]
      const updated: McpJson = { mcpServers: next }
      setMcpJson(updated)
      await writeJsonFile(updated)
    }
  }, [isCodex, mcpJson, reloadCodexServers, showToast, t, writeJsonFile])

  const handleToggleDisabled = useCallback(async (name: string) => {
    if (isCodex) {
      const server = codexServers.find(s => s.name === name)
      if (!server) return
      const result = await window.electronAPI.mcpSetEnabled(name, server.disabled)
      if (!result?.success) { showToast(result?.error || t('settings.mcpPage.saveFailed')); return }
      await reloadCodexServers()
      return
    }
    if (!mcpJson) return
    const updated: McpJson = {
      ...mcpJson,
      mcpServers: {
        ...mcpJson.mcpServers,
        [name]: { ...mcpJson.mcpServers[name], disabled: !mcpJson.mcpServers[name].disabled },
      },
    }
    setMcpJson(updated)
    await writeJsonFile(updated)
  }, [codexServers, isCodex, mcpJson, reloadCodexServers, showToast, t, writeJsonFile])

  // ── Render ──

  const targetPath = isCodex
    ? configInfo?.path ?? ''
    : filePath || projectMcpPath(workingDir || homeDir)

  const displayPath = targetPath
    ? abbreviatePath(targetPath, homeDir)
    : t('settings.mcpPage.noWorkingDir')

  const servers: DisplayServer[] = isCodex
    ? codexServers.map(srv => ({
        name: srv.name,
        type: serverType(srv.type, srv.url),
        preview: srv.url ? srv.url : stdioPreview(srv.command, srv.args),
        disabled: srv.disabled,
      }))
    : Object.entries(mcpJson?.mcpServers ?? {}).map(([name, cfg]) => ({
        name,
        type: serverType(cfg.type, cfg.url),
        preview: cfg.url ? cfg.url : stdioPreview(cfg.command, cfg.args),
        disabled: !!cfg.disabled,
      }))

  // Claude branch with no file yet keeps its dedicated empty state
  const needsFile = !isCodex && !mcpJson

  return (
    <>
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
            {t('settings.mcpPage.title')}
          </span>
          {configInfo && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              borderRadius: 4, padding: '2px 6px',
              background: isCodex ? 'rgba(99,102,241,0.12)' : 'rgba(52,211,153,0.12)',
              border: `1px solid ${isCodex ? 'rgba(99,102,241,0.25)' : 'rgba(52,211,153,0.25)'}`,
              color: isCodex ? '#818cf8' : '#34d399',
            }}>
              {configInfo.engine}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {isCodex ? t('settings.mcpPage.codexSub') : t('settings.mcpPage.projectSub')}
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
        {!loading && !needsFile && (
          <button
            onClick={() => setAdding(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
              padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              color: 'var(--text-bright)', fontSize: 11, fontWeight: 600,
            }}
          >
            <Plus size={12} /> {t('mcp.addServer')}
          </button>
        )}
      </div>

      {loading && (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          {t('settings.mcpPage.loading')}
        </div>
      )}

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

      {/* Claude branch only: no .mcp.json yet */}
      {!loading && !error && needsFile && (
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
              {t('settings.mcpPage.noFileTitle')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t('settings.mcpPage.noFileHint')}
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
              color: 'var(--text-bright)', fontSize: 12, fontWeight: 600,
              transition: 'opacity 0.15s ease',
              opacity: creating ? 0.7 : 1,
            }}
          >
            <Plus size={13} />
            {t('settings.mcpPage.createFile')}
          </button>
        </div>
      )}

      {/* Server list */}
      {!loading && !error && !needsFile && (
        <>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            background: 'var(--glass-shimmer)',
            border: '1px solid var(--glass-border)',
            borderRadius: 8, padding: '9px 12px',
            marginBottom: 14,
          }}>
            <Info size={12} color="var(--text-faint)" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
              {isCodex ? t('settings.mcpPage.codexNote') : t('settings.mcpPage.applyNote')}
            </div>
          </div>

          {adding && (
            <AddServerForm
              existingNames={servers.map(s => s.name)}
              onAdd={handleAdd}
              onCancel={() => setAdding(false)}
            />
          )}

          {servers.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12, color: 'var(--text-faint)',
            }}>
              <Server size={13} />
              {t('settings.mcpPage.noServers')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {servers.map(srv => (
                <ServerCard
                  key={srv.name}
                  server={srv}
                  onToggleDisabled={handleToggleDisabled}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {servers.length > 0 && (
            <div style={{
              marginTop: 12, fontSize: 11, color: 'var(--text-faint)',
              textAlign: 'right',
            }}>
              {t(servers.length !== 1 ? 'mcp.serversConfiguredPlural' : 'mcp.serversConfigured', { count: String(servers.length) })}
              {' · '}
              {t('settings.mcpPage.enabledCount', { count: String(servers.filter(s => !s.disabled).length) })}
            </div>
          )}
        </>
      )}
    </>
  )
}
