/**
 * Sanitize environment variables passed to CLI child processes.
 * Only passes through an explicit allowlist to prevent leaking secrets
 * (AWS keys, GitHub tokens, etc.) from the parent process environment.
 */

const ALWAYS_PASS = new Set([
  'PATH',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'TEMP',
  'TMP',
  'APPDATA',
  'LOCALAPPDATA',
  'SystemRoot',
  'COMSPEC',
  'LANG',
  'LC_ALL',
  // Windows-specific system vars
  'SystemDrive',
  'windir',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
  // Node.js / npm context
  'NODE_ENV',
])

const CONDITIONAL_PASS = new Set([
  'ANTHROPIC_API_KEY',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CLI_PATH',
  'CLAUDE_NODE_PATH',
  'NODE_PATH',
  'NO_COLOR',
  'TERM',
  'TERM_PROGRAM',
  // Allow explicit overrides
  'CLAUDECODE',
])

/**
 * Returns a filtered environment object containing only allowlisted variables
 * from process.env, merged with the provided overrides (which are always passed through).
 */
export function sanitizeEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {}

  // Copy allowlisted vars from parent environment
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    // Case-insensitive match on Windows
    const upperKey = key.toUpperCase()
    const matchesAlways = ALWAYS_PASS.has(key) || ALWAYS_PASS.has(upperKey)
    const matchesConditional = CONDITIONAL_PASS.has(key) || CONDITIONAL_PASS.has(upperKey)
    if (matchesAlways || matchesConditional) {
      result[key] = value
    }
  }

  // Always merge the caller-provided overrides (these come from the renderer, e.g. ANTHROPIC_API_KEY)
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = value
  }

  return result
}
