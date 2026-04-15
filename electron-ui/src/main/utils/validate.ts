import path from 'path'
import fs from 'fs'
import os from 'os'

/**
 * Custom error thrown when a path is outside the allowed sandbox roots.
 */
export class PathAccessDeniedError extends Error {
  constructor(requestedPath: string, allowedRoots: string[]) {
    super(
      `Path access denied: "${requestedPath}" is not within allowed directories:\n  ${allowedRoots.join('\n  ')}`
    )
    this.name = 'PathAccessDeniedError'
  }
}

/**
 * Known Claude model names. Add new models here as they are released.
 */
const KNOWN_MODELS = new Set([
  'claude-opus-4-5',
  'claude-opus-4',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-sonnet-4',
  'claude-haiku-4-5',
  'claude-haiku-4',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
])

/**
 * Known CLI flags that are safe to pass through from the renderer.
 */
const KNOWN_FLAGS = new Set([
  '--thinking',
  '--append-system-prompt',
  '--max-turns',
  '--max-budget-usd',
  '--dangerously-skip-permissions',
  '--verbose',
  '--no-color',
  '--output-format',
  '--input-format',
  '--effort',
  '--print',
  '--permission-mode',
  '--resume',
])

/**
 * Validates that a string value does not exceed the specified length.
 */
export function validateStringLength(s: string, max: number, name: string): string {
  if (typeof s !== 'string') throw new Error(`${name} must be a string`)
  if (s.length > max) throw new Error(`${name} exceeds maximum length of ${max} characters`)
  return s
}

/**
 * Validates an absolute path: must be a string, must resolve to an absolute path,
 * and must not contain traversal after resolution.
 */
export function validateAbsolutePath(p: string): string {
  if (typeof p !== 'string' || !p.trim()) throw new Error('Path must be a non-empty string')
  const resolved = path.resolve(p)
  if (!path.isAbsolute(resolved)) throw new Error(`Path "${p}" does not resolve to an absolute path`)
  return resolved
}

/**
 * Ensures the given path is within one of the allowed root directories.
 * Case-insensitive comparison on Windows.
 */
export function validateWithinAllowedDirs(p: string, allowed: string[]): string {
  const resolved = path.resolve(p).toLowerCase()
  const normalizedAllowed = allowed.map(a => path.resolve(a).toLowerCase())

  for (const root of normalizedAllowed) {
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return path.resolve(p)
    }
  }
  throw new PathAccessDeniedError(p, allowed)
}

/**
 * Combined path safety check: resolves, normalizes, and enforces allowed roots.
 * Throws PathAccessDeniedError if the path is outside the sandbox.
 */
export function safePath(requestedPath: string, allowedRoots: string[]): string {
  if (typeof requestedPath !== 'string' || !requestedPath.trim()) {
    throw new Error('Path must be a non-empty string')
  }
  const resolved = path.normalize(path.resolve(requestedPath))
  const resolvedLower = resolved.toLowerCase()
  const normalizedAllowed = allowedRoots.map(r => path.normalize(path.resolve(r)).toLowerCase())

  for (const root of normalizedAllowed) {
    if (resolvedLower === root || resolvedLower.startsWith(root + path.sep)) {
      return resolved
    }
  }
  throw new PathAccessDeniedError(requestedPath, allowedRoots)
}

/**
 * Validates a model name against the known allowlist.
 */
export function validateModelName(model: string): string {
  if (!model) return model
  if (!KNOWN_MODELS.has(model)) {
    throw new Error(`Unknown model name: "${model}". Must be one of: ${[...KNOWN_MODELS].join(', ')}`)
  }
  return model
}

/**
 * Validates that an API key matches the expected format or is empty.
 */
export function validateApiKey(key: string): string {
  if (!key) return ''
  if (!/^(sk-ant-|sk-)[a-zA-Z0-9_-]+$/.test(key)) {
    throw new Error('Invalid API key format. Key must start with sk-ant- or sk- followed by alphanumeric characters.')
  }
  return key
}

/**
 * Validates a flags array for CLI invocation — only known flags allowed.
 */
export function validateFlags(flags: string[]): string[] {
  if (!Array.isArray(flags)) throw new Error('flags must be an array')
  for (const flag of flags) {
    // Flag values (following a flag name) are allowed through
    const isKnown = KNOWN_FLAGS.has(flag) || !flag.startsWith('--')
    if (!isKnown) {
      throw new Error(`Unknown CLI flag: "${flag}"`)
    }
  }
  return flags
}

/**
 * Validates that a directory path exists and is a directory.
 */
export function validateDirectoryExists(dirPath: string): string {
  const resolved = path.resolve(dirPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: "${resolved}"`)
  }
  const stat = fs.statSync(resolved)
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: "${resolved}"`)
  }
  return resolved
}

/**
 * Get the standard allowed roots for file system operations.
 * Dynamically reads the working dir from the prefs store at call time.
 */
export function getAllowedFsRoots(workingDir?: string): string[] {
  const roots: string[] = [os.homedir(), path.join(os.homedir(), '.claude')]
  if (workingDir && workingDir.trim()) {
    roots.push(path.resolve(workingDir))
  }
  return roots
}
