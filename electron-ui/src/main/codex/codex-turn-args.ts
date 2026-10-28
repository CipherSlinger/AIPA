/**
 * The one place that turns a caller's intent into `CodexSendMessageArgs`.
 *
 * Chat turns, background internal turns and automation runs all spawn the same
 * app-server, so they must agree on the two things that decide whether a run
 * can talk to a model at all:
 *
 *  - credentials: the key the user pasted into Settings lives in electron-store
 *    (encrypted), not in `process.env`. A caller that builds `env` itself starts
 *    Codex without it and fails with "not signed in".
 *  - the sandbox/approval defaults: omitting them lets Codex fall back to
 *    ~/.codex/config.toml, which may be `danger-full-access`.
 *
 * Keeping this in one function is what stops an automation from behaving
 * differently from the identical manual chat turn.
 */
import { getApiKey } from '../config/config-manager'
import type { ApprovalPolicy, CodexSendMessageArgs, CodexUserInput } from './codex-bridge'

export interface CodexTurnInput {
  prompt: string
  input?: CodexUserInput[]
  cwd: string
  /** Existing Codex thread to resume. */
  threadId?: string
  model?: string
  /** Overrides from the caller (e.g. the renderer's provider routing). */
  env?: Record<string, string>
  /** Renderer permission mode, mapped to an approval policy below. */
  permissionMode?: string
}

export interface CodexTurnOverrides {
  approvalPolicy?: ApprovalPolicy
  sandbox?: string
  personality?: 'friendly' | 'pragmatic' | 'none'
  /** Fail fast through `account/read` when Codex has no credentials. */
  requireAuth?: boolean
  /** Do not persist the thread to Codex session history. */
  ephemeral?: boolean
}

/**
 * Map a renderer permission mode onto an explicit Codex sandbox.
 *
 * Codex defaults `sandbox` from ~/.codex/config.toml when the field is omitted,
 * which can be danger-full-access even for approvalPolicy 'never'. Passing it
 * explicitly keeps "approve nothing" from also meaning "write anywhere".
 * `acceptEdits` keeps workspace writes (that is its whole point); bypass/dontAsk
 * are also workspace-scoped — full disk access stays a config.toml decision the
 * user makes deliberately, not something the UI silently opts them into.
 */
export function resolveCodexSandbox(permissionMode: string | undefined): string {
  switch (permissionMode) {
    case 'bypassPermissions':
    case 'dontAsk':
    case 'acceptEdits':
    case 'default':
      return 'workspaceWrite'
    case 'plan':
      return 'readOnly'
    default:
      return 'workspaceWrite'
  }
}

/** Renderer permission mode → Codex approval policy (undefined = Codex default). */
export function resolveCodexApprovalPolicy(permissionMode: string | undefined): ApprovalPolicy | undefined {
  switch (permissionMode) {
    case 'bypassPermissions':
    case 'dontAsk':
      return 'never'
    case 'acceptEdits':
      return 'unless-allow-listed'
    case 'default':
      return 'on-request'
    default:
      return undefined
  }
}

/**
 * Inject the stored credential unless the caller supplied one.
 *
 * `getApiKey()` prefers `ANTHROPIC_API_KEY` from the environment and otherwise
 * decrypts the Settings key; chat turns use the same value for both engine
 * variables, so a Settings-only user is authenticated either way. An explicit
 * key in `env` always wins, which keeps provider routing intact.
 */
function withInjectedKey(env: Record<string, string>): Record<string, string> {
  const resolved = { ...env }
  if (!resolved.OPENAI_API_KEY && !resolved.ANTHROPIC_API_KEY) {
    resolved.OPENAI_API_KEY = getApiKey()
  }
  return resolved
}

export function buildCodexTurnArgs(
  input: CodexTurnInput,
  overrides: CodexTurnOverrides = {},
): CodexSendMessageArgs {
  return {
    prompt: input.prompt,
    ...(input.input ? { input: input.input } : {}),
    cwd: input.cwd,
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.model ? { model: input.model } : {}),
    env: withInjectedKey(input.env ?? {}),
    // An explicit override (a background run that can never ask) wins; the
    // renderer mode is only the fallback.
    approvalPolicy: overrides.approvalPolicy ?? resolveCodexApprovalPolicy(input.permissionMode),
    sandbox: overrides.sandbox ?? resolveCodexSandbox(input.permissionMode),
    personality: overrides.personality ?? 'pragmatic',
    ...(overrides.requireAuth ? { requireAuth: true } : {}),
    ...(overrides.ephemeral ? { ephemeral: true } : {}),
  }
}
