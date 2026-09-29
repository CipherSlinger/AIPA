import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { shell } from 'electron'
import { createLogger } from '../utils/logger'
import type { NavPlugin, NavPluginManifest } from './nav-plugin-types'
import { ensureDefaultPlugins } from './default-plugins'

const log = createLogger('nav-plugin-manager')

let cachedPlugins: NavPlugin[] = []
let watcherList: fs.FSWatcher[] = []
let updateCallback: ((plugins: NavPlugin[]) => void) | null = null
let debounceTimer: NodeJS.Timeout | null = null

function getGlobalPluginsDir(): string {
  return path.join(os.homedir(), '.aipa', 'plugins')
}

function getWorkspacePluginsDir(workingDir?: string): string | null {
  if (!workingDir) return null
  return path.join(workingDir, '.aipa', 'plugins')
}

/**
 * Scan a single plugins directory and return discovered plugins.
 */
function scanDirectory(dir: string, source: 'global' | 'workspace'): NavPlugin[] {
  if (!fs.existsSync(dir)) return []

  const results: NavPlugin[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pluginDir = path.join(dir, entry.name)

      // Look for plugin.json or manifest.json
      let manifestPath = path.join(pluginDir, 'plugin.json')
      if (!fs.existsSync(manifestPath)) {
        manifestPath = path.join(pluginDir, 'manifest.json')
      }
      if (!fs.existsSync(manifestPath)) continue

      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8')
        const manifest = JSON.parse(raw) as NavPluginManifest

        if (!manifest.id || !manifest.name) {
          results.push({
            manifest: {
              id: entry.name,
              name: entry.name,
              main: 'index.html',
            },
            dirPath: pluginDir,
            entryPath: path.join(pluginDir, 'index.html'),
            source,
            valid: false,
            error: 'Manifest missing "id" or "name"',
          })
          continue
        }

        const mainFile = manifest.main || 'index.html'
        const entryPath = path.join(pluginDir, mainFile)
        const valid = fs.existsSync(entryPath)

        results.push({
          manifest,
          dirPath: pluginDir,
          entryPath,
          source,
          valid,
          error: valid ? undefined : `Main entry file not found: ${mainFile}`,
        })
      } catch (e) {
        log.warn(`Failed to parse manifest at ${manifestPath}:`, e)
      }
    }
  } catch (err) {
    log.warn(`Failed to scan plugins dir ${dir}:`, err)
  }

  return results
}

/**
 * Rescan all plugin directories and return sorted list.
 */
export function scanAllPlugins(workingDir?: string): NavPlugin[] {
  const globalDir = getGlobalPluginsDir()
  const globalPlugins = scanDirectory(globalDir, 'global')
  const workspaceDir = getWorkspacePluginsDir(workingDir)
  const workspacePlugins = workspaceDir ? scanDirectory(workspaceDir, 'workspace') : []

  // Combine and deduplicate by plugin id (workspace overrides global)
  const map = new Map<string, NavPlugin>()
  for (const p of globalPlugins) {
    map.set(p.manifest.id, p)
  }
  for (const p of workspacePlugins) {
    map.set(p.manifest.id, p)
  }

  const list = Array.from(map.values())
  // Sort by order ascending, then name
  list.sort((a, b) => {
    const orderA = a.manifest.order ?? 100
    const orderB = b.manifest.order ?? 100
    if (orderA !== orderB) return orderA - orderB
    return a.manifest.name.localeCompare(b.manifest.name)
  })

  cachedPlugins = list
  return list
}

/**
 * Setup directory watchers for hot-plugging.
 */
function setupWatchers(workingDir?: string): void {
  // Clear existing watchers
  for (const w of watcherList) {
    try {
      w.close()
    } catch {}
  }
  watcherList = []

  const dirsToWatch = [getGlobalPluginsDir()]
  const wsDir = getWorkspacePluginsDir(workingDir)
  if (wsDir && fs.existsSync(wsDir)) {
    dirsToWatch.push(wsDir)
  }

  for (const dir of dirsToWatch) {
    if (!fs.existsSync(dir)) continue
    try {
      const watcher = fs.watch(dir, { recursive: true }, () => {
        // Debounce rescans (300ms)
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          log.info('Detected plugin directory change, rescanning...')
          const updated = scanAllPlugins(workingDir)
          if (updateCallback) {
            updateCallback(updated)
          }
        }, 300)
      })
      watcherList.push(watcher)
    } catch (err) {
      log.warn(`Failed to watch plugin directory ${dir}:`, err)
    }
  }
}

/**
 * Initialize NavPluginManager with working directory and update callback.
 */
export function initNavPluginManager(
  getWorkingDir: () => string,
  onUpdate: (plugins: NavPlugin[]) => void
): NavPlugin[] {
  updateCallback = onUpdate
  // Install/upgrade default plugins once per process; rescans stay read-only
  // so a user-deleted default plugin is not reinstalled on every file change.
  const globalDir = getGlobalPluginsDir()
  try {
    fs.mkdirSync(globalDir, { recursive: true })
  } catch {}
  ensureDefaultPlugins(globalDir)
  const workingDir = getWorkingDir()
  const initial = scanAllPlugins(workingDir)
  setupWatchers(workingDir)
  return initial
}

/**
 * Return currently cached plugins.
 */
export function listNavPlugins(): NavPlugin[] {
  return cachedPlugins.length > 0 ? cachedPlugins : scanAllPlugins()
}

/**
 * Force manual rescan.
 */
export function reloadNavPlugins(workingDir?: string): NavPlugin[] {
  const plugins = scanAllPlugins(workingDir)
  if (updateCallback) {
    updateCallback(plugins)
  }
  return plugins
}

/**
 * Open plugin folder in OS file explorer.
 */
export function openPluginFolder(pluginId?: string): boolean {
  if (pluginId) {
    const plugin = cachedPlugins.find(p => p.manifest.id === pluginId || path.basename(p.dirPath) === pluginId)
    if (plugin && fs.existsSync(plugin.dirPath)) {
      shell.openPath(plugin.dirPath)
      return true
    }
    const cleanId = pluginId.replace(/^aipa-/, '')
    const directPath = path.join(getGlobalPluginsDir(), cleanId)
    if (fs.existsSync(directPath)) {
      shell.openPath(directPath)
      return true
    }
  }
  // If not found, open the global plugins folder
  const globalDir = getGlobalPluginsDir()
  if (fs.existsSync(globalDir)) {
    shell.openPath(globalDir)
    return true
  }
  return false
}
