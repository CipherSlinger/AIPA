/**
 * Plugin Manager
 *
 * Manages Claude Code plugins installed at ~/.claude/plugins.json.
 * Plugins can add MCP servers, hooks, and slash commands.
 *
 * Plugin format (from CLI's installedPluginsManager.ts):
 * {
 *   "plugins": [{
 *     "name": "my-plugin",
 *     "version": "1.0.0",
 *     "source": "npm:@my-org/plugin-name",
 *     "enabled": true,
 *     "installDate": "2026-04-09T00:00:00Z",
 *     "description": "...",
 *     "mcpServers": {},
 *     "hooks": {}
 *   }]
 * }
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFileSync } from 'child_process'
import { createLogger } from '../utils/logger'

const log = createLogger('plugin-manager')

export interface InstalledPlugin {
  name: string
  version?: string
  source: string
  enabled: boolean
  installDate: string
  description?: string
  mcpServers?: Record<string, unknown>
  hooks?: Record<string, unknown>
}

interface PluginsFile {
  plugins: InstalledPlugin[]
}

function getPluginsFilePath(): string {
  return path.join(os.homedir(), '.claude', 'plugins.json')
}

function readPluginsFile(): PluginsFile {
  const p = getPluginsFilePath()
  try {
    if (!fs.existsSync(p)) return { plugins: [] }
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.plugins)) return { plugins: [] }
    return parsed as PluginsFile
  } catch {
    return { plugins: [] }
  }
}

function writePluginsFile(data: PluginsFile): void {
  const p = getPluginsFilePath()
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = p + '.tmp.' + Date.now()
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmp, p)
}

export function listPlugins(): InstalledPlugin[] {
  return readPluginsFile().plugins
}

export function setPluginEnabled(name: string, enabled: boolean): void {
  const data = readPluginsFile()
  const plugin = data.plugins.find(p => p.name === name)
  if (!plugin) throw new Error(`Plugin "${name}" not found`)
  plugin.enabled = enabled
  writePluginsFile(data)
  log.info(`setPluginEnabled: ${name} = ${enabled}`)
}

export function uninstallPlugin(name: string): void {
  const data = readPluginsFile()
  const idx = data.plugins.findIndex(p => p.name === name)
  if (idx === -1) throw new Error(`Plugin "${name}" not found`)
  data.plugins.splice(idx, 1)
  writePluginsFile(data)
  log.info('uninstallPlugin:', name)
}

/** Register a local plugin by path (for development/local plugins) */
export function registerLocalPlugin(pluginPath: string): InstalledPlugin {
  const absPath = path.resolve(pluginPath)
  if (!fs.existsSync(absPath)) throw new Error(`Plugin path not found: ${absPath}`)

  // Try to read package.json for metadata
  let name = path.basename(absPath)
  let version: string | undefined
  let description: string | undefined
  const pkgPath = path.join(absPath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      name = pkg.name || name
      version = pkg.version
      description = pkg.description
    } catch { /* ignore */ }
  }

  // Read plugin manifest if exists
  let mcpServers: Record<string, unknown> | undefined
  let hooks: Record<string, unknown> | undefined
  const manifestPath = path.join(absPath, 'claude-plugin.json')
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      mcpServers = manifest.mcpServers
      hooks = manifest.hooks
    } catch { /* ignore */ }
  }

  const data = readPluginsFile()
  const existing = data.plugins.findIndex(p => p.name === name)

  const plugin: InstalledPlugin = {
    name,
    version,
    source: `local:${absPath}`,
    enabled: true,
    installDate: new Date().toISOString(),
    description,
    mcpServers,
    hooks,
  }

  if (existing >= 0) {
    data.plugins[existing] = plugin
  } else {
    data.plugins.push(plugin)
  }
  writePluginsFile(data)
  log.info('registerLocalPlugin:', name, 'from', absPath)
  return plugin
}

/** Register a plugin from npm (installs globally then reads manifest) */
export async function installNpmPlugin(packageName: string): Promise<InstalledPlugin> {
  log.info('installNpmPlugin:', packageName)

  // npm install -g <packageName>
  execFileSync('npm', ['install', '-g', packageName, '--json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  })

  // Find installed path
  const installDir = execFileSync('npm', ['root', '-g'], { encoding: 'utf-8' }).trim()
  const pkgName = packageName.replace(/^@[^/]+\//, '').split('@')[0]
  const pluginPath = path.join(installDir, packageName.split('@')[0])

  return registerLocalPlugin(fs.existsSync(pluginPath) ? pluginPath : installDir)
}
