/**
 * Locate the git-bash executable that the Claude Code CLI requires on Windows.
 *
 * The CLI exits immediately with code 1 when it cannot find a bash, printing
 * "Claude Code on Windows requires git-bash ... set CLAUDE_CODE_GIT_BASH_PATH".
 * Without this the user's saved API key looks broken even though the CLI never
 * got far enough to use it.
 *
 * The pure lookup is separated into `findGitBash` so it can be exercised with
 * fake environments and a fake filesystem on any host.
 */

import * as fs from 'fs'
import * as path from 'path'

export interface FindGitBashInput {
  platform: string
  env: Record<string, string | undefined>
  exists: (p: string) => boolean
}

/** Turn a PATH entry that sits inside a Git install into that install's root. */
function deriveGitRoot(entry: string, win: typeof path.win32): string | null {
  // Match on the normalised form so trailing separators, mixed separators and
  // mixed case all work.
  const trimmed = entry.replace(/[\\/]+$/, '').replace(/\//g, '\\')
  const lower = trimmed.toLowerCase()
  // Pattern matched against the full entry, and the part that belongs to the
  // Git installation rather than the root. The root keeps its `Git` component:
  // `D:\Program Files\Git\usr\bin` → `D:\Program Files\Git`.
  const suffixes: Array<[string, string]> = [
    ['\\git\\cmd', '\\cmd'],
    ['\\git\\bin', '\\bin'],
    ['\\git\\mingw64\\bin', '\\mingw64\\bin'],
    ['\\git\\usr\\bin', '\\usr\\bin'],
  ]
  for (const [pattern, strip] of suffixes) {
    if (lower.endsWith(pattern)) {
      const root = trimmed.slice(0, trimmed.length - strip.length)
      return root.length > 0 ? win.normalize(root) : null
    }
  }
  return null
}

/**
 * Pure detection: no real filesystem or process access.
 * Order: explicit override, Git roots derived from PATH, common install dirs.
 */
export function findGitBash(input: FindGitBashInput): string | null {
  const { platform, env, exists } = input
  if (platform !== 'win32') return null

  const win = path.win32

  // 1. Explicit override — only if it actually points at something.
  const override = env.CLAUDE_CODE_GIT_BASH_PATH
  if (override && exists(override)) return override

  // 2. Derive Git roots from PATH entries that live inside a Git install.
  const seen = new Set<string>()
  const pathValue = env.PATH ?? env.Path ?? env.path ?? ''
  for (const entry of pathValue.split(';')) {
    if (!entry) continue
    const root = deriveGitRoot(entry, win)
    if (!root) continue
    const key = root.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const candidate = candidateInRoot(root, win, exists)
    if (candidate) return candidate
  }

  // 3. Common installation locations.
  const roots = [
    env.ProgramFiles && win.join(env.ProgramFiles, 'Git'),
    env['ProgramFiles(x86)'] && win.join(env['ProgramFiles(x86)'] as string, 'Git'),
    env.LOCALAPPDATA && win.join(env.LOCALAPPDATA, 'Programs', 'Git'),
    env.USERPROFILE && win.join(env.USERPROFILE, 'scoop', 'apps', 'git', 'current'),
  ]
  for (const root of roots) {
    if (!root) continue
    const key = root.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const candidate = candidateInRoot(root, win, exists)
    if (candidate) return candidate
  }

  return null
}

function candidateInRoot(
  root: string,
  win: typeof path.win32,
  exists: (p: string) => boolean,
): string | null {
  const candidates = [
    win.join(root, 'bin', 'bash.exe'),
    win.join(root, 'usr', 'bin', 'bash.exe'),
  ]
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate
  }
  return null
}

let cached: string | null | undefined

/** Windows-only git-bash lookup, cached after the first call (including null). */
export function resolveGitBashPath(): string | null {
  if (cached !== undefined) return cached
  cached = findGitBash({
    platform: process.platform,
    env: process.env as Record<string, string | undefined>,
    exists: (p) => {
      try {
        return fs.existsSync(p)
      } catch {
        return false
      }
    },
  })
  return cached
}
