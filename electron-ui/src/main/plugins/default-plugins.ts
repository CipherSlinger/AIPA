import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import type { NavPluginManifest } from './nav-plugin-types'

const log = createLogger('default-plugins')

/** Compare dotted versions numerically; missing/invalid parts count as 0. */
function compareVersions(a: string | undefined, b: string | undefined): number {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function readInstalledVersion(manifestPath: string): string | undefined {
  try {
    return (JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as NavPluginManifest).version
  } catch {
    return undefined
  }
}

/**
 * Multi-file plugins shipped with the app (src/main/plugins/builtin/<dir>,
 * copied to dist by `npm run build:plugins`). Installed when missing and
 * upgraded only when the bundled manifest version is newer, so local edits
 * to an up-to-date plugin are never clobbered. Plugin data lives in
 * ~/.aipa/plugin-data and survives upgrades.
 */
function ensureBundledPlugins(globalDir: string): void {
  const bundledRoot = path.join(__dirname, 'builtin')
  if (!fs.existsSync(bundledRoot)) return
  for (const entry of fs.readdirSync(bundledRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    try {
      const src = path.join(bundledRoot, entry.name)
      const bundledVersion = readInstalledVersion(path.join(src, 'plugin.json'))
      const dst = path.join(globalDir, entry.name)
      const installedVersion = readInstalledVersion(path.join(dst, 'plugin.json'))
      if (installedVersion && compareVersions(bundledVersion, installedVersion) <= 0) continue
      fs.cpSync(src, dst, { recursive: true })
      log.info(`Installed bundled plugin ${entry.name} v${bundledVersion} (was ${installedVersion ?? 'none'})`)
    } catch (err) {
      log.warn(`Failed to install bundled plugin ${entry.name}:`, err)
    }
  }
}

/**
 * Ensure default plugins (Plugin Hub, Notes, Work Calendar — all shipped under
 * builtin/) exist in ~/.aipa/plugins and are upgraded when the bundle is newer.
 */
export function ensureDefaultPlugins(globalDir: string): void {
  try {
    ensureBundledPlugins(globalDir)
  } catch (err) {
    log.warn('ensureDefaultPlugins failed:', err)
  }
}
