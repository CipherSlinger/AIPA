/**
 * Which CLI the chat actually drives.
 *
 * Mirrors the routing rule in `registerCliHandlers` (ipc/index.ts): CodexBridge
 * is used unless the caller supplied an explicit ANTHROPIC_API_KEY without one
 * for OpenAI — and the stored key is always handed to Codex as
 * OPENAI_API_KEY, so a configured app is Codex-driven.
 */
import { getApiKey } from './config-manager'

export type AiEngine = 'codex' | 'claude'

export function getActiveEngine(): AiEngine {
  if (process.env.OPENAI_API_KEY) return 'codex'
  if (getApiKey()) return 'codex'
  return process.env.ANTHROPIC_API_KEY ? 'claude' : 'codex'
}
