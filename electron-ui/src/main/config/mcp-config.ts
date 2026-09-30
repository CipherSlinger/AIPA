/**
 * Engine-routed MCP configuration.
 *
 * The Settings → MCP tab and the Channels MCP panel both edit one store, and
 * which file that is depends on the active engine:
 *
 *   codex  → ~/.codex/config.toml      [mcp_servers.<name>] tables
 *   claude → ~/.claude/settings.json   settings.mcpServers
 *
 * Codex has no project-scoped MCP file (its app-server ignores
 * `<cwd>/.codex/config.toml`), so under Codex both panels read and write the
 * same global config.toml. Everything above this module speaks one shape, so the
 * renderer never has to know which file it is talking to.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getActiveEngine, type AiEngine } from './engine'
import {
  getCodexConfigPath,
  readCodexMcpServers,
  removeCodexMcpServer,
  setCodexMcpServerEnabled,
  upsertCodexMcpServer,
  type CodexMcpServer,
} from './codex-config-manager'
import { createLogger } from '../utils/logger'

const log = createLogger('mcp-config')

/** Engine-neutral server shape used by the IPC layer and the renderer. */
export interface McpServerRecord {
  name: string
  type: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  disabled: boolean
}

export interface McpConfigInfo {
  engine: AiEngine
  /** Absolute path of the file MCP edits land in. */
  path: string
  format: 'json' | 'toml'
  /** Codex stores MCP servers globally even though the tab is titled "project". */
  scope: 'global'
}

export function getClaudeSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

export function getMcpConfigInfo(): McpConfigInfo {
  const engine = getActiveEngine()
  return engine === 'codex'
    ? { engine, path: getCodexConfigPath(), format: 'toml', scope: 'global' }
    : { engine, path: getClaudeSettingsPath(), format: 'json', scope: 'global' }
}

// ── Read ─────────────────────────────────────────────

export function readMcpServers(): McpServerRecord[] {
  return getActiveEngine() === 'codex' ? readCodexMcpServers().map(fromCodex) : readClaudeMcpServers()
}

function readClaudeMcpServers(): McpServerRecord[] {
  const mcpServers = readClaudeSettings().mcpServers as Record<string, Record<string, unknown>> | undefined
  if (!mcpServers || typeof mcpServers !== 'object') return []

  return Object.entries(mcpServers).map(([name, cfg]) => ({
    name,
    type: normalizeType(cfg?.type, cfg?.url),
    command: typeof cfg?.command === 'string' ? cfg.command : undefined,
    args: Array.isArray(cfg?.args) ? (cfg.args as unknown[]).map(String) : undefined,
    env: isStringMap(cfg?.env) ? (cfg.env as Record<string, string>) : undefined,
    url: typeof cfg?.url === 'string' ? cfg.url : undefined,
    headers: isStringMap(cfg?.headers) ? (cfg.headers as Record<string, string>) : undefined,
    disabled: cfg?.disabled === true,
  }))
}

// ── Write ────────────────────────────────────────────

/** Add or replace a server in whichever store the active engine reads. */
export function addMcpServer(name: string, config: Record<string, unknown>): { success: boolean; error?: string } {
  if (!name.trim()) return { success: false, error: 'Server name is required' }

  try {
    if (getActiveEngine() === 'codex') {
      upsertCodexMcpServer({
        name,
        command: typeof config.command === 'string' ? config.command : undefined,
        args: Array.isArray(config.args) ? (config.args as unknown[]).map(String) : undefined,
        env: isStringMap(config.env) ? (config.env as Record<string, string>) : undefined,
        url: typeof config.url === 'string' ? config.url : undefined,
        headers: isStringMap(config.headers) ? (config.headers as Record<string, string>) : undefined,
        enabled: config.disabled !== true,
      })
      return { success: true }
    }
    return writeClaudeMcpServer(name, config)
  } catch (err) {
    log.warn('addMcpServer error:', String(err))
    return { success: false, error: String(err) }
  }
}

export function removeMcpServer(name: string): { success: boolean; error?: string } {
  try {
    if (getActiveEngine() === 'codex') {
      return removeCodexMcpServer(name)
        ? { success: true }
        : { success: false, error: `No MCP server named "${name}" in config.toml` }
    }

    const settingsPath = getClaudeSettingsPath()
    if (!fs.existsSync(settingsPath)) return { success: false, error: 'settings.json not found' }
    const settings = readClaudeSettings()
    const mcpServers = { ...(settings.mcpServers as Record<string, unknown> ?? {}) }
    delete mcpServers[name]
    writeJsonAtomic(settingsPath, { ...settings, mcpServers })
    return { success: true }
  } catch (err) {
    log.warn('removeMcpServer error:', String(err))
    return { success: false, error: String(err) }
  }
}

export function setMcpServerEnabledRouted(name: string, enabled: boolean): { success: boolean; error?: string } {
  try {
    if (getActiveEngine() === 'codex') {
      return setCodexMcpServerEnabled(name, enabled)
        ? { success: true }
        : { success: false, error: `No MCP server named "${name}" in config.toml` }
    }

    const settingsPath = getClaudeSettingsPath()
    const settings = readClaudeSettings()
    const mcpServers = { ...(settings.mcpServers as Record<string, Record<string, unknown>> ?? {}) }
    if (!mcpServers[name]) return { success: false, error: `No MCP server named "${name}"` }
    mcpServers[name] = { ...mcpServers[name], disabled: !enabled }
    writeJsonAtomic(settingsPath, { ...settings, mcpServers })
    return { success: true }
  } catch (err) {
    log.warn('setMcpServerEnabled error:', String(err))
    return { success: false, error: String(err) }
  }
}

// ── Helpers ──────────────────────────────────────────

function fromCodex(server: CodexMcpServer): McpServerRecord {
  return {
    name: server.name,
    type: server.url ? 'http' : 'stdio',
    command: server.command,
    args: server.args,
    env: server.env,
    url: server.url,
    headers: server.headers,
    disabled: !server.enabled,
  }
}

function readClaudeSettings(): Record<string, unknown> {
  const settingsPath = getClaudeSettingsPath()
  try {
    if (!fs.existsSync(settingsPath)) return {}
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeClaudeMcpServer(name: string, config: Record<string, unknown>): { success: boolean; error?: string } {
  const settingsPath = getClaudeSettingsPath()
  const settings = readClaudeSettings()
  const mcpServers = { ...(settings.mcpServers as Record<string, unknown> ?? {}) }
  mcpServers[name] = config
  writeJsonAtomic(settingsPath, { ...settings, mcpServers })
  return { success: true }
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

function normalizeType(type: unknown, url: unknown): McpServerRecord['type'] {
  if (type === 'sse' || type === 'http' || type === 'stdio') return type
  return typeof url === 'string' && url ? 'http' : 'stdio'
}

function isStringMap(value: unknown): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
