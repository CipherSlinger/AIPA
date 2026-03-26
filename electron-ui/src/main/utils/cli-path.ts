import path from 'path'
import fs from 'fs'

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
 * then falls back to 'node' on PATH.
 */
export function getNodePath(): string {
  // Packaged app: prefer bundled node.exe in resources
  if (isPackaged()) {
    const bundledNode = path.join(getResourcesPath(), 'node', process.platform === 'win32' ? 'node.exe' : 'node')
    if (fs.existsSync(bundledNode)) return bundledNode
  }
  if (process.env.CLAUDE_NODE_PATH) return process.env.CLAUDE_NODE_PATH
  return 'node'
}
