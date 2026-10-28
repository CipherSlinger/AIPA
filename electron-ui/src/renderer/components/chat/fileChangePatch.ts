/**
 * Pure handling for Codex's `item/fileChange/patchUpdated` snapshots.
 *
 * Verified wire shape (`.scratch/codex-schema/v2/FileChangePatchUpdatedNotification.json`
 * generated from the installed 0.145 binary, plus the binary's own
 * `item/fileChange/patchUpdated` discriminant):
 *
 *   {
 *     itemId: string, threadId: string, turnId: string,
 *     changes: Array<{ path: string, kind: PatchChangeKind, diff: string }>
 *   }
 *
 * It is the same `FileUpdateChange[]` shape the completed `fileChange` item
 * carries, and upstream describes these events as streaming snapshots / the
 * current state of the files touched by an in-progress patch. So each `diff`
 * is the *whole* unified diff for that file so far, not a delta: replacing the
 * previous snapshot is the correct update rule. The final hunk can be
 * incomplete while the model is still writing, so nothing here may claim that
 * an edit succeeded or failed.
 *
 * This module is deliberately dependency-free so the harness can bundle it
 * without React or Electron.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NormalizedPatchChange {
  path: string
  /** `PatchChangeKind` tagged object, forwarded verbatim. */
  kind: unknown
  diff: string
  /** Tail-clipped by the bridge at 32 KiB. */
  truncated: boolean
}

export interface NormalizedPatchUpdate {
  itemId: string
  threadId?: string
  turnId?: string
  changes: NormalizedPatchChange[]
}

export interface LivePatchEntry {
  itemId: string
  changes: NormalizedPatchChange[]
  updatedAt: number
}

export type LiveDiffLineType = 'add' | 'del' | 'ctx'

export interface LiveDiffLine {
  type: LiveDiffLineType
  content: string
}

export interface PartialDiffView {
  /** Change lines only; hunk headers / file headers are not rendered. */
  lines: LiveDiffLine[]
  /** Total change lines in the snapshot (before the render cap). */
  totalLines: number
  /** Lines hidden by the render cap. */
  hiddenLines: number
}

/**
 * Render cap. The existing diff views fold at 50 lines (`FileDiffView`'s
 * `LARGE_DIFF_THRESHOLD`), so a live card stops at the same point and says how
 * many lines are hidden instead of growing without bound.
 */
export const LIVE_DIFF_MAX_LINES = 50

// ── Payload normalization ─────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Validate the `cli:patchUpdated` payload. Returns null for anything that is
 * not a usable update (wrong envelope, no id, no valid change) — the caller
 * must ignore it rather than guess.
 */
export function normalizePatchUpdate(payload: unknown): NormalizedPatchUpdate | null {
  const data = asRecord(payload)
  if (!data) return null
  const itemId = nonEmptyString(data.itemId)
  if (!itemId) return null
  const rawChanges = Array.isArray(data.changes) ? data.changes : []
  const changes: NormalizedPatchChange[] = []
  for (const raw of rawChanges) {
    const change = asRecord(raw)
    if (!change) continue
    const path = nonEmptyString(change.path)
    const diff = nonEmptyString(change.diff)
    if (!path || !diff) continue
    changes.push({
      path,
      kind: change.kind ?? null,
      diff,
      truncated: change.truncated === true,
    })
  }
  if (changes.length === 0) return null
  const update: NormalizedPatchUpdate = { itemId, changes }
  const threadId = nonEmptyString(data.threadId)
  const turnId = nonEmptyString(data.turnId)
  if (threadId) update.threadId = threadId
  if (turnId) update.turnId = turnId
  return update
}

// ── Partial unified-diff parsing ─────────────────────────────────────────────

/**
 * Parse the change lines out of a unified diff snapshot.
 *
 * A partial diff may stop mid-hunk; that is expected. What is *not* accepted
 * is a payload that never reached a hunk or contains a line that cannot be a
 * diff line — in that case the caller keeps the existing card and shows no
 * live view (garbage is worse than waiting for the completed diff).
 */
export function parsePartialUnifiedDiff(diff: string): PartialDiffView | null {
  if (typeof diff !== 'string' || diff.length === 0) return null

  const rawLines = diff.split(/\r?\n/)
  const lines: LiveDiffLine[] = []
  let seenHunk = false

  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = rawLines[i]
    const isLast = i === rawLines.length - 1

    if (!seenHunk) {
      // File headers before the first hunk. Anything else before `@@` means
      // this is not a unified diff we can render honestly.
      if (raw.startsWith('@@')) { seenHunk = true; continue }
      if (
        raw.startsWith('diff ') ||
        raw.startsWith('index ') ||
        raw.startsWith('---') ||
        raw.startsWith('+++') ||
        raw.startsWith('\\ No newline')
      ) continue
      if (raw === '' && isLast) continue
      return null
    }

    // Inside the patch.
    if (raw.startsWith('@@')) continue // next hunk header
    if (raw.startsWith('\\ No newline')) continue
    if (raw === '') {
      // The final empty element is the trailing newline, not a context line.
      if (isLast) continue
      lines.push({ type: 'ctx', content: '' })
      continue
    }
    const mark = raw[0]
    if (mark === '+') lines.push({ type: 'add', content: raw.slice(1) })
    else if (mark === '-') lines.push({ type: 'del', content: raw.slice(1) })
    else if (mark === ' ') lines.push({ type: 'ctx', content: raw.slice(1) })
    // A stream cut mid-line can end with a bare marker; it is still a valid
    // empty add/delete line, handled above. Anything else is malformed.
    else return null
  }

  if (!seenHunk || lines.length === 0) return null

  const totalLines = lines.length
  const visible = totalLines > LIVE_DIFF_MAX_LINES
    ? lines.slice(0, LIVE_DIFF_MAX_LINES)
    : lines
  return { lines: visible, totalLines, hiddenLines: totalLines - visible.length }
}

// ── Tool-card mapping ─────────────────────────────────────────────────────────

/**
 * The bridge opens one card per changed file: `itemId` for a single-file
 * patch, `${itemId}:${index}` when a patch touches several files.
 */
export function itemIdFromToolId(toolId: string): string {
  const match = /^(.*):(\d+)$/.exec(toolId)
  return match ? match[1] : toolId
}

function changeIndexFromToolId(toolId: string): number | null {
  const match = /^(.*):(\d+)$/.exec(toolId)
  if (!match) return null
  const index = Number(match[2])
  return Number.isSafeInteger(index) && index >= 0 ? index : null
}

/**
 * Pick the change this card represents. Path match wins because it survives
 * a snapshot that grew from one file to two; the tool-id index is the fallback
 * for a card whose input has no path yet.
 */
export function resolveLiveChange(
  entry: LivePatchEntry | undefined,
  toolId: string,
  filePath: string,
): NormalizedPatchChange | null {
  if (!entry || entry.changes.length === 0) return null
  if (entry.changes.length === 1) return entry.changes[0]
  if (filePath) {
    const byPath = entry.changes.find(change => change.path === filePath)
    if (byPath) return byPath
  }
  const index = changeIndexFromToolId(toolId)
  if (index !== null) return entry.changes[index] ?? null
  return null
}
