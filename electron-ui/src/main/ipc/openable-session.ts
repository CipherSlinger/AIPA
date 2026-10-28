/**
 * Which id the archive can actually open for an engine turn.
 *
 * `runInternalTurn` runs behind a private bridge whose id (`internal-…`) is
 * bookkeeping, not a conversation: `session:load` resolves Codex thread ids or
 * Claude JSONL ids, and the bridge id is neither. A persisted turn therefore
 * has to report a different id, and reading it at the right moment matters:
 *
 *  - Codex: the live bridge knows the thread id it created; read it before the
 *    single-shot app-server is reaped.
 *  - Legacy Claude: only the result envelope carries the real JSONL session id;
 *    the bridge id passed around internally cannot be substituted.
 *
 * Both sources are optional because a turn can fail before either exists.
 * Returning null lets the caller honour the "no conversation was created"
 * contract instead of pointing the plugin at something the archive cannot open.
 */
export interface OpenableSessionSources {
  /** Codex bridge lookup; called once, before the bridge is aborted. */
  codexThreadId?: () => string | null | undefined
  /** `claudeSessionId` from the legacy result envelope. */
  claudeSessionId?: string | null
}

export function pickOpenableSessionId(
  engine: 'codex' | 'claude',
  sources: OpenableSessionSources,
): string | null {
  if (engine === 'codex') {
    const id = sources.codexThreadId?.()
    return typeof id === 'string' && id ? id : null
  }
  const id = sources.claudeSessionId
  return typeof id === 'string' && id ? id : null
}
