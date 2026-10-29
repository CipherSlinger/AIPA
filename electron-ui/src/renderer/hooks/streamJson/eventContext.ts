/**
 * The values the `cli:*` handlers used to close over inside `useStreamJson`'s
 * once-registered effect. Moving the handlers into sibling modules must not
 * change what they read, so the hook hands them the very same refs (and the
 * same `t` it captured when the effect ran) through this object.
 *
 * Every field is read at event time, exactly like the closure it replaces.
 */
export interface StreamJsonEventContext {
  /** Live translator captured once at effect registration (`getT()`). */
  t: (key: string, params?: Record<string, string | number>) => string
  /** Bridge id of the turn this composer started, or null when none is live. */
  activeBridgeIdRef: { current: string | null }
  /** Latest `sendMessage`, so a listener can start a turn without a stale closure. */
  sendMessageRef: { current: ((prompt: string) => Promise<unknown>) | null }
  /** When the user sent the prompt, to calculate response duration. */
  sendTimestampRef: { current: number }
  /** Only warn once per session about context window nearing capacity. */
  contextWarningShownRef: { current: boolean }
  /** Snapshot of .consolidate-lock mtime at session start — detects dream completions. */
  dreamMtimeSnapshotRef: { current: number }
  /** Latest auto-compact check, kept in a ref because the effect runs once. */
  autoCompactRef: { current: (contextUsed: number, contextTotal: number) => Promise<void> }
  /** Latest memory-extraction check, kept in a ref for the same reason. */
  extractMemoriesRef: { current: () => Promise<void> }
  /** Stop streaming + release prevent-sleep (stable — used by sendMessage/abort/effect). */
  stopStreamingAndReleaseSleep: () => void
}
