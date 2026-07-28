/**
 * Resolves the path to the Codex CLI binary.
 *
 * Search order:
 * 1. CODEX_CLI_PATH environment variable (explicit override)
 * 2. Packaged app: bundled binary in resources/codex/
 * 3. npm platform-specific package: @openai/codex-<platform>/vendor/<triple>/bin/codex(.exe)
 * 4. node_modules/.bin/codex (npm shim → spawns native binary)
 * 5. PATH-resolved `codex` command
 * 6. Common installation directories
 *
 * The npm package distributes pre-built Rust binaries via optional dependencies:
 *   @openai/codex-win32-x64  → vendor/x86_64-pc-windows-msvc/bin/codex.exe
 *   @openai/codex-linux-x64  → vendor/x86_64-unknown-linux-musl/bin/codex
 *   @openai/codex-darwin-arm64 → vendor/aarch64-apple-darwin/bin/codex
 *   etc.
 */
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

/**
 * Returns the Rust target triple for the current platform.
 */
function getTargetTriple(): string | null {
  const { platform, arch } = process
  switch (platform) {
    case 'win32':
      return arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc'
    case 'darwin':
      return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
    case 'linux':
    case 'android':
      return arch === 'arm64' ? 'aarch64-unknown-linux-musl' : 'x86_64-unknown-linux-musl'
    default:
      return null
  }
}

function getPlatformPackageName(): string | null {
  const { platform, arch } = process
  switch (platform) {
    case 'win32':
      return arch === 'arm64' ? '@openai/codex-win32-arm64' : '@openai/codex-win32-x64'
    case 'darwin':
      return arch === 'arm64' ? '@openai/codex-darwin-arm64' : '@openai/codex-darwin-x64'
    case 'linux':
    case 'android':
      return arch === 'arm64' ? '@openai/codex-linux-arm64' : '@openai/codex-linux-x64'
    default:
      return null
  }
}

function getCodexBinaryName(): string {
  return process.platform === 'win32' ? 'codex.exe' : 'codex'
}

/**
 * Resolve node_modules base directories to search for the codex binary.
 */
function getNodeModulesBases(): string[] {
  const bases: string[] = []
  // From compiled output: dist/main/codex/ → ../../.. = electron-ui/
  bases.push(path.resolve(__dirname, '..', '..', '..'))
  // From project root (dev mode)
  bases.push(path.resolve(process.cwd()))
  return bases
}

/**
 * Returns the absolute path to the Codex CLI native binary.
 */
export function getCodexPath(): string {
  // 1. Explicit override
  if (process.env.CODEX_CLI_PATH) return process.env.CODEX_CLI_PATH

  // 2. Packaged app: bundled codex binary in resources
  if (isPackaged()) {
    const bundledCodex = path.join(
      getResourcesPath(),
      'codex',
      getCodexBinaryName()
    )
    if (fs.existsSync(bundledCodex)) return bundledCodex
  }

  // 3. npm platform-specific package binary (native Rust binary)
  const triple = getTargetTriple()
  const pkgName = getPlatformPackageName()
  if (triple && pkgName) {
    for (const base of getNodeModulesBases()) {
      // Try @openai/codex-<platform>/vendor/<triple>/bin/codex(.exe)
      const nativePath = path.join(
        base, 'node_modules', pkgName, 'vendor', triple, 'bin', getCodexBinaryName()
      )
      if (fs.existsSync(nativePath)) return nativePath

      // Also try resolving via require (handles npm/pnpm symlink layouts)
      try {
        const pkgJsonPath = require.resolve(`${pkgName}/package.json`, { paths: [base] })
        const resolved = path.join(path.dirname(pkgJsonPath), 'vendor', triple, 'bin', getCodexBinaryName())
        if (fs.existsSync(resolved)) return resolved
      } catch { /* not found via require */ }
    }
  }

  // 4. node_modules/.bin/codex (npm shim — spawns native binary internally)
  for (const base of getNodeModulesBases()) {
    const shimPath = path.join(base, 'node_modules', '.bin',
      process.platform === 'win32' ? 'codex.cmd' : 'codex')
    if (fs.existsSync(shimPath)) return shimPath
  }

  // 5. Try to resolve 'codex' from system PATH
  try {
    const cmd = process.platform === 'win32' ? 'where codex' : 'which codex'
    const resolved = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split(/\r?\n/)[0]
    if (resolved && fs.existsSync(resolved)) return resolved
  } catch {
    // codex not on PATH
  }

  // 6. Common installation directories
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || ''
    const candidates = [
      path.join(appData, 'npm', 'codex.cmd'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
  } else {
    const homeDir = process.env.HOME || ''
    const candidates = [
      path.join(homeDir, '.local', 'bin', 'codex'),
      '/usr/local/bin/codex',
      '/opt/homebrew/bin/codex',
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
  }

  // Last resort: return 'codex' and hope it works
  return 'codex'
}

/**
 * Returns the path to the Node.js executable.
 * Codex is a Rust binary and doesn't need Node, but some auxiliary
 * functions (session reading, etc.) may still need it.
 */
export function getNodePath(): string {
  if (isPackaged()) {
    const bundledNode = path.join(getResourcesPath(), 'node', process.platform === 'win32' ? 'node.exe' : 'node')
    if (fs.existsSync(bundledNode)) return bundledNode
  }
  if (process.env.CODEX_NODE_PATH) return process.env.CODEX_NODE_PATH

  try {
    const cmd = process.platform === 'win32' ? 'where node' : 'which node'
    const resolved = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split(/\r?\n/)[0]
    if (resolved && fs.existsSync(resolved)) return resolved
  } catch {
    // node not on PATH
  }

  return 'node'
}
