/**
 * Sanitize environment variables for Codex CLI child processes.
 *
 * Replaces the old cli-env.ts which allowlisted ANTHROPIC_* vars.
 * This version allowlists OPENAI_* vars instead.
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
  // OpenAI / Codex
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OPENAI_ORG_ID',
  'OPENAI_PROJECT_ID',
  // Codex-specific
  'CODEX_HOME',
  'CODEX_CLI_PATH',
  'CODEX_NODE_PATH',
  'CODEX_SANDBOX_MODE',
  // Rust / logging
  'RUST_LOG',
  'LOG_FORMAT',
  'NO_COLOR',
  'TERM',
  'TERM_PROGRAM',
])

/**
 * Returns a filtered environment object containing only allowlisted variables
 * from process.env, merged with the provided overrides.
 */
export function sanitizeCodexEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {}

  // Copy allowlisted vars from parent environment
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    const upperKey = key.toUpperCase()
    const matchesAlways = ALWAYS_PASS.has(key) || ALWAYS_PASS.has(upperKey)
    const matchesConditional = CONDITIONAL_PASS.has(key) || CONDITIONAL_PASS.has(upperKey)
    if (matchesAlways || matchesConditional) {
      result[key] = value
    }
  }

  // Merge caller-provided overrides — only allowlisted keys pass through
  for (const [key, value] of Object.entries(overrides)) {
    const upperKey = key.toUpperCase()
    const allowed = ALWAYS_PASS.has(key) || ALWAYS_PASS.has(upperKey)
      || CONDITIONAL_PASS.has(key) || CONDITIONAL_PASS.has(upperKey)
    if (allowed) {
      result[key] = value
    }
  }

  return result
}
