import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'

// Lazy import electron.app to avoid circular deps
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _electronApp: any
try { _electronApp = require('electron').app } catch {}

function isPackaged(): boolean {
  return _electronApp?.isPackaged ?? false
}

function getResourcesPath(): string {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? ''
}

function getCliPackageDir(): string {
  return isPackaged()
    ? path.join(getResourcesPath(), 'cli')
    : path.resolve(__dirname, '../../../package')
}

/**
 * Returns the absolute path to the Claude Code CLI (cli.js).
 * Checks CLAUDE_CLI_PATH env var first, then walks a list of candidate paths.
 */
export function getCliPath(): string {
  if (process.env.CLAUDE_CLI_PATH) return process.env.CLAUDE_CLI_PATH
  const candidates = [
    path.join(getCliPackageDir(), 'cli.js'),
    // dev: electron-ui/dist/main/utils/ -> ../../../../package/cli.js
    path.resolve(__dirname, '../../../../package/cli.js'),
    path.resolve(__dirname, '../../../package/cli.js'),
    path.resolve(__dirname, '../../package/cli.js'),
    path.resolve(process.cwd(), '../package/cli.js'),
    path.resolve(process.cwd(), 'package/cli.js'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(`Claude Code CLI not found. Searched:\n${candidates.join('\n')}`)
}

/**
 * Returns the path to the Node.js executable.
 * Prefers bundled node in resources (for packaged app), then CLAUDE_NODE_PATH env var,
 * then attempts to resolve 'node' from PATH, then tries common Windows install locations.
 */
export function getNodePath(): string {
  // Packaged app: prefer bundled node.exe in resources
  if (isPackaged()) {
    const bundledNode = path.join(getResourcesPath(), 'node', process.platform === 'win32' ? 'node.exe' : 'node')
    if (fs.existsSync(bundledNode)) return bundledNode
  }
  if (process.env.CLAUDE_NODE_PATH) return process.env.CLAUDE_NODE_PATH

  // Try to resolve 'node' from PATH using where (Windows) or which (Unix)
  try {
    const cmd = process.platform === 'win32' ? 'where node' : 'which node'
    const resolved = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split(/\r?\n/)[0]
    if (resolved && fs.existsSync(resolved)) return resolved
  } catch {
    // 'node' not on PATH
  }

  // Windows: check common installation directories
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const appData = process.env.APPDATA || ''
    const candidates = [
      path.join(programFiles, 'nodejs', 'node.exe'),
      path.join(programFilesX86, 'nodejs', 'node.exe'),
      ...(appData ? [path.join(appData, 'nvm', 'current', 'node.exe')] : []),
      'C:\\nodejs\\node.exe',
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
  }

  // Last resort: return 'node' and hope it works (may throw at spawn time)
  return 'node'
}
