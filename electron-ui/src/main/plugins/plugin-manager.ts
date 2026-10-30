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
import { execFile } from 'child_process'
import { createLogger } from '../utils/logger'
import {
  installNpmPluginWith,
  npmCliJsCandidates,
  npmEnv,
  npmRunnerFor,
  type NpmInstallDeps,
  type NpmInstallResult,
  type NpmRunner,
} from './npm-install'

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

/**
 * Register a plugin that npm has already installed.
 *
 * `source` is recorded as `npm:<spec>` (not `local:<path>`), so the Settings
 * list can tell an npm install from a folder the user pointed at; everything
 * else is `registerLocalPlugin`, which reads the manifest and rewrites the
 * registry.
 */
export function registerInstalledNpmPlugin(packageDir: string, source: string): { name: string; version?: string } {
  const plugin = registerLocalPlugin(packageDir)
  const data = readPluginsFile()
  const entry = data.plugins.find(p => p.name === plugin.name)
  if (entry) {
    entry.source = source
    writePluginsFile(data)
    plugin.source = source
  }
  return { name: plugin.name, version: plugin.version }
}

/**
 * Locate npm as a file we can run through `execFile` with an argv array.
 *
 * `execFile('npm', …)` fails with ENOENT on Windows and EINVAL on
 * `.cmd` shims without a shell — and a shell is exactly what this module
 * refuses to hand a package name to. So npm's own `npm-cli.js` is
 * preferred, run by the node that runs this process; Electron sets
 * `ELECTRON_RUN_AS_NODE=1` for it.
 */
function locateNpmRunner(): NpmRunner | null {
  const env = process.env
  const pathDirs = String(env.PATH || env.Path || '')
    .split(path.delimiter)
    .map(dir => dir.trim())
    .filter(Boolean)
  const candidates = npmCliJsCandidates({
    execPath: process.execPath,
    env,
    pathDirs,
  })
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return npmRunnerFor({ nodePath: process.execPath, npmCliJs: candidate })
      }
    } catch { /* unreadable candidate */ }
  }
  // Last resort: a plain npm binary on PATH. Kept for a machine that ships one
  // (a `npm` shell script or .exe); the spec is still a single argv entry.
  return { command: 'npm', prefixArgs: [], env: {}, via: 'npm-binary' }
}

/** Run npm and resolve stdout. Never a shell; the spec is one argv element. */
function execNpm(runner: NpmRunner, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      runner.command,
      [...runner.prefixArgs, ...args],
      {
        encoding: 'utf-8',
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        env: npmEnv(process.env, runner.env),
        shell: false,
      },
      (err, stdout) => {
        if (err) reject(err)
        else resolve(String(stdout))
      }
    )
  })
}

const npmInstallDeps: NpmInstallDeps = {
  locateRunner: locateNpmRunner,
  exec: execNpm,
  exists: (filePath) => {
    try { return fs.existsSync(filePath) } catch { return false }
  },
  readText: (filePath) => fs.readFileSync(filePath, 'utf-8'),
  register: registerInstalledNpmPlugin,
}

/**
 * Install a plugin by npm package name.
 *
 * Returns a refusal instead of throwing, because the Settings form has to say
 * which step failed (`invalid_package_name`, `npm_not_found`, `install_failed`,
 * `manifest_missing`) rather than show an invoke rejection with a stack trace.
 * The global install is the user's machine being changed: this function is
 * only ever reached from an explicit confirm in the renderer.
 */
export async function installNpmPlugin(packageName: string): Promise<NpmInstallResult> {
  const result = await installNpmPluginWith(packageName, npmInstallDeps)
  if (result.ok) {
    log.info('installNpmPlugin:', result.plugin.source, '→', result.plugin.name)
  } else {
    log.warn('installNpmPlugin refused:', result.reason, result.detail)
  }
  return result
}
