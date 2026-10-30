/**
 * Which engine may run a small, hidden LLM turn?
 *
 * Prompt suggestions, "while you were away" recaps and speculative execution
 * used to spawn the legacy Claude CLI unconditionally. That was written when
 * the CLI was the only engine; today Codex is the primary engine and the
 * legacy CLI is only a fallback. On a Codex-only profile the old code either
 * failed silently or spent a *different* account's quota on prompts the user
 * never sent.
 *
 * The rule below is deliberately credential-driven, not binary-driven: the
 * legacy CLI is still shipped in `resources/cli`, so "the file exists" says
 * nothing about whether the user is on that engine. A profile is on an engine
 * only when it has something that engine can authenticate with.
 *
 * Order matters:
 *   1. Codex — the primary engine. A Settings key (the one the chat path
 *      forwards as OPENAI_API_KEY), an OPENAI_API_KEY in the environment, or
 *      Codex's own ChatGPT login.
 *   2. Legacy Claude CLI — the Anthropic key entered at the top of Settings, an
 *      Anthropic key/token in the environment, or a Claude Code login.
 *   3. Nothing — the feature stays off rather than spawning a process that
 *      cannot authenticate.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getApiKey } from '../config/config-manager'
import { getCodexPath } from '../codex/codex-resolver'
import { tryGetCliPath } from '../utils/cli-path'
import { createLogger } from '../utils/logger'

const log = createLogger('aux-engine')

export type AuxiliaryEngine =
  | { kind: 'codex' }
  /** The legacy Claude CLI, authenticated by an Anthropic key or a Claude login. */
  | { kind: 'claude'; source: 'legacy'; env: Record<string, string> }
  | { kind: 'none'; reason: string }

let loggedUnavailableFor: string | null = null

/** Absolute path to Codex's own login state (`~/.codex/auth.json`). */
function codexAuthFile(): string {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  return path.join(home, 'auth.json')
}

/** Absolute path to Claude Code's OAuth credentials file. */
function claudeCredentialsFile(): string {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  return path.join(dir, '.credentials.json')
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

/**
 * `getCodexPath()` falls back to the bare name `codex` for a PATH-resolved
 * install. We cannot cheaply verify that without spawning, so treat the bare
 * name as "maybe" and let the spawn fail cleanly. An absolute path, however,
 * can be checked — a missing npm package should not be mistaken for a usable
 * engine (and would otherwise turn into a failed spawn per assistant turn).
 */
function codexCliExists(): boolean {
  const resolved = getCodexPath()
  return path.isAbsolute(resolved) ? fileExists(resolved) : true
}

export function resolveAuxiliaryEngine(): AuxiliaryEngine {
  const key = getApiKey()
  const keyIsAnthropic = key.startsWith('sk-ant-')
  // OpenAI project keys are `sk-proj-…`; older/user keys are `sk-…`. Anything
  // else (a gateway token, a bare hex key) is not evidence of a Codex login.
  const keyLooksOpenai = key.startsWith('sk-') && !keyIsAnthropic
  const hasOpenAiEnv = Boolean(process.env.OPENAI_API_KEY)
  const hasAnthropicEnv = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)

  if (codexCliExists() && (keyLooksOpenai || hasOpenAiEnv || fileExists(codexAuthFile()))) {
    return { kind: 'codex' }
  }

  // Claude is the only fallback transport, so a missing binary means the
  // feature is off rather than an HTTP call the app has no implementation for.
  const claudeLoggedIn = fileExists(claudeCredentialsFile())
  if ((hasAnthropicEnv || keyIsAnthropic || claudeLoggedIn) && tryGetCliPath()) {
    // Presence of the key (even an empty string for an OAuth-only login) is
    // what forces `runInternalTurn` onto the Claude bridge: registerLegacy-
    // SendMessage treats "key exists in env" as an explicit engine choice.
    const env: Record<string, string> = {}
    if (hasAnthropicEnv && process.env.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    } else if (hasAnthropicEnv && process.env.ANTHROPIC_AUTH_TOKEN) {
      env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN
    } else if (keyIsAnthropic) {
      env.ANTHROPIC_API_KEY = key
    } else {
      // OAuth login: the CLI reads its own credentials file. The empty key is
      // a marker, not a credential.
      env.ANTHROPIC_API_KEY = ''
    }
    return { kind: 'claude', source: 'legacy', env }
  }

  return { kind: 'none', reason: 'no_authenticated_engine' }
}

/**
 * Log the disabled state once, not once per suggestion. These features fire
 * after every assistant turn; a warning per turn would bury the log.
 */
export function noteAuxiliaryEngineUnavailable(reason: string): void {
  if (loggedUnavailableFor === reason) return
  loggedUnavailableFor = reason
  log.info(`Hidden LLM features are off: ${reason}`)
}

/**
 * Session titles are derived locally.
 *
 * The previous implementation spawned `cli generate-session-title`, but the
 * shipped legacy CLI has no such subcommand — every call paid for a process
 * start only to fall back to `description.slice(0, 40)`. Deriving the title
 * here keeps the result identical, removes the spawn, and works on every
 * engine.
 */
export function deriveSessionTitle(description: string): string {
  const firstLine = description
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .find(Boolean) ?? ''

  const cleaned = firstLine
    // Markdown headings / quotes / list markers at the start of the prompt.
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[>*\-+\s]+/, '')
    // [label](url) → label
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Inline code/emphasis markers read as noise in a sidebar row.
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''
  const chars = Array.from(cleaned)
  return chars.length > 40 ? `${chars.slice(0, 40).join('').trimEnd()}…` : cleaned
}
