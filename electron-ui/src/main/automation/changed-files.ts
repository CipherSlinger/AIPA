/**
 * The file-editing tool calls a run made, captured live.
 *
 * Why capture rather than reconstruct: Codex persists aggregated turn diffs
 * only while the turn streams (`turn/diff/updated`), and neither engine records
 * a durable per-file list. Rollout reconstruction can recover some Codex
 * patches, but not shell-driven edits, and it is unavailable for the legacy
 * Claude transport. So the runner watches the `toolUse` / `toolResult` events
 * the bridges already emit and keeps the path each call named.
 *
 * What this is NOT, and the record must never imply otherwise:
 *  - it is not the run's complete effect on disk. Shell commands, formatters,
 *    `git apply`, `rm` and anything typed into a terminal are invisible here;
 *  - a tool call is intent, not proof. A write can fail or be auto-denied. A
 *    file becomes `edited` only when the engine's matching `toolResult` says
 *    `is_error === false`; every other sighting stays `attempted`.
 *
 * Pure and Electron-free so `.scratch/wave49-run-files-harness` can exercise
 * extraction, dedupe, caps and restore without a bridge or a window.
 */
import type {
  AutomationChangedFile,
  AutomationChangedFileKind,
  AutomationRunChangedFiles,
} from './types'

/** Stored paths per run. Bounded so `automations.json` stays small. */
export const MAX_CHANGED_FILES = 20

/**
 * Distinct paths counted, including ones beyond the stored cap. Further paths
 * are ignored: a runaway tool loop cannot make one record grow without bound,
 * and `totalFiles` is then an explicit lower bound (the record is truncated).
 */
export const MAX_TRACKED_FILES = 500

/** Distinct file-edit tool emissions counted; further calls are clamped. */
export const MAX_EDIT_CALLS = 1000

/** A longer path is a malformed tool input, not something a run wrote. */
export const MAX_CHANGED_FILE_PATH_CHARS = 1024

/**
 * Tool names whose input names a file. Codex's live app-server path emits
 * `Edit` for file-change items (its bridge maps them to Claude's vocabulary);
 * the legacy CLI emits these names directly. Read/Grep/Bash/TodoWrite are
 * deliberately absent — they do not edit.
 */
const EDIT_TOOL_NAMES = new Set([
  'edit',
  'write',
  'multiedit',
  'notebookedit',
  'str_replace_editor',
  'create_file',
  'write_file',
  'edit_file',
  'delete_file',
])

export const CHANGED_FILE_KINDS: readonly AutomationChangedFileKind[] = ['add', 'update', 'delete', 'unknown']

export interface ExtractedFileEdit {
  path: string
  kind: AutomationChangedFileKind
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function isFileEditingTool(name: unknown): boolean {
  return typeof name === 'string' && EDIT_TOOL_NAMES.has(name.trim().toLowerCase())
}

/**
 * Read the path from the input shapes actually emitted by the bridges:
 *  - Codex file-change items (and the Claude cards they mimic): `file_path`;
 *  - `write_file` / `str_replace_editor` variants: `path`;
 *  - NotebookEdit: `notebook_path`.
 * An empty, non-string or absurdly long path is a malformed input, not a file.
 */
function readPath(input: Record<string, unknown>): string {
  for (const key of ['file_path', 'path', 'notebook_path']) {
    const value = input[key]
    if (typeof value !== 'string') continue
    const path = value.trim()
    if (!path) continue
    return path.length <= MAX_CHANGED_FILE_PATH_CHARS ? path : ''
  }
  return ''
}

/**
 * The change kind the payload states, if any.
 *
 * Codex sends `PatchChangeKind` as `{ type: 'add' | 'delete' | 'update' }`; the
 * bridge forwards it verbatim as `change_kind`, so a tagged object is the live
 * shape and a bare string is accepted for older recordings. Claude's Edit /
 * Write / MultiEdit inputs state no kind at all, so they stay `unknown` — the
 * tool name is not a payload and guessing `update` here would fabricate one.
 */
export function readChangeKind(raw: unknown): AutomationChangedFileKind {
  if (typeof raw === 'string') {
    const kind = raw.trim().toLowerCase()
    return kind === 'add' || kind === 'update' || kind === 'delete' ? kind : 'unknown'
  }
  const record = asRecord(raw)
  if (!record || typeof record.type !== 'string') return 'unknown'
  return readChangeKind(record.type)
}

/**
 * One `toolUse` event → the file targets it names.
 *
 * MultiEdit names one `file_path` and several hunks, so it is one target.
 * Unknown tools and malformed inputs produce an empty list: the caller must
 * not count a call it could not read as evidence of an edit.
 */
export function extractFileEditTargets(name: unknown, input: unknown): ExtractedFileEdit[] {
  if (!isFileEditingTool(name)) return []
  const record = asRecord(input)
  if (!record) return []
  const path = readPath(record)
  if (!path) return []
  const declared = record.change_kind !== undefined ? record.change_kind : record.kind
  return [{ path, kind: readChangeKind(declared) }]
}

export interface ChangedFilesCollector {
  /** Feed one bridge `toolUse` event. Unknown tools are ignored. */
  observeToolUse(id: unknown, name: unknown, input: unknown): void
  /** Feed one bridge `toolResult` event; resolves the files named by its call. */
  observeToolResult(id: unknown, isError: unknown): void
  /** The bounded, immutable summary to persist on the run record. */
  summary(): AutomationRunChangedFiles
}

/**
 * Accumulate one run's file edits.
 *
 * A path is stored once, in first-seen order. Later calls may refine it:
 *  - a stated kind replaces `unknown`, and a later stated kind wins (a file
 *    added then deleted reads as `delete`, the run's final intent);
 *  - `edited` is sticky; one failed call cannot downgrade a completed edit.
 */
export function createChangedFilesCollector(): ChangedFilesCollector {
  const stored = new Map<string, AutomationChangedFile>()
  const seen = new Set<string>()
  const pathsByCall = new Map<string, string[]>()
  const countedCalls = new Set<string>()
  let editCalls = 0

  /**
   * Count one emission and say whether its paths can be correlated later.
   * The id set is capped at `MAX_EDIT_CALLS`, so a runaway run cannot grow the
   * in-memory bookkeeping without bound; calls beyond the cap still contribute
   * stored paths, they simply stay `attempted` because no result can be matched.
   */
  const noteCall = (callId: string): boolean => {
    if (!callId) {
      if (editCalls < MAX_EDIT_CALLS) editCalls += 1
      return false
    }
    if (countedCalls.has(callId)) return true
    if (countedCalls.size >= MAX_EDIT_CALLS) return false
    countedCalls.add(callId)
    if (editCalls < MAX_EDIT_CALLS) editCalls += 1
    return true
  }

  return {
    observeToolUse(id, name, input) {
      const targets = extractFileEditTargets(name, input)
      if (targets.length === 0) return

      const callId = typeof id === 'string' && id.trim() ? id.trim() : ''
      const correlated = noteCall(callId)
      const callPaths = callId && correlated ? (pathsByCall.get(callId) ?? []) : null

      for (const target of targets) {
        if (!seen.has(target.path) && seen.size < MAX_TRACKED_FILES) seen.add(target.path)

        const existing = stored.get(target.path)
        if (existing) {
          if (target.kind !== 'unknown') existing.kind = target.kind
        } else if (stored.size < MAX_CHANGED_FILES) {
          stored.set(target.path, {
            path: target.path,
            kind: target.kind,
            state: 'attempted',
          })
        }
        // Only stored paths need correlation, and one call can name at most
        // the stored cap's worth; keep the per-call list equally bounded.
        if (callPaths && callPaths.length < MAX_CHANGED_FILES && !callPaths.includes(target.path)) {
          callPaths.push(target.path)
        }
      }
      if (callPaths && callId) pathsByCall.set(callId, callPaths)
    },

    observeToolResult(id, isError) {
      // Only an explicit non-error result is a completed edit. A missing
      // `is_error` is not a success report, so the entry stays attempted.
      if (isError !== false) return
      if (typeof id !== 'string' || !id.trim()) return
      const paths = pathsByCall.get(id.trim())
      if (!paths) return
      for (const path of paths) {
        const entry = stored.get(path)
        if (entry) entry.state = 'edited'
      }
    },

    summary() {
      // Copy: the collector is discarded after the run, but a caller must
      // never be able to mutate what it was handed.
      const files = [...stored.values()].map(file => ({ ...file }))
      return {
        files,
        totalFiles: seen.size,
        truncated: seen.size > files.length,
        editCalls,
      }
    },
  }
}

/**
 * Restore a persisted changed-files summary, or drop it.
 *
 * Absent is a fact of its own — older records never captured this, and their
 * absence must read as *not recorded*, never as "no files changed". A present
 * summary with an empty `files` array is the honest "no file-editing tool
 * calls observed" state.
 *
 * Malformed entries are dropped, not the whole summary (the run still
 * happened). A non-object summary, a non-array `files`, or a summary that
 * claims files while storing none is untrustworthy and returns undefined, so
 * the record stays conservatively *not recorded* instead of claiming a count
 * it cannot name.
 */
export function normalizeChangedFiles(raw: unknown): AutomationRunChangedFiles | undefined {
  const record = asRecord(raw)
  if (!record || !Array.isArray(record.files)) return undefined

  const files: AutomationChangedFile[] = []
  const seen = new Set<string>()
  let distinctSeen = 0

  for (const item of record.files) {
    if (distinctSeen >= MAX_TRACKED_FILES) break
    const entry = asRecord(item)
    if (!entry) continue
    const path = typeof entry.path === 'string' ? entry.path.trim() : ''
    if (!path || path.length > MAX_CHANGED_FILE_PATH_CHARS) continue
    if (typeof entry.kind !== 'string' ||
      !CHANGED_FILE_KINDS.includes(entry.kind as AutomationChangedFileKind)) continue
    if (entry.state !== 'edited' && entry.state !== 'attempted') continue
    if (seen.has(path)) continue
    seen.add(path)
    distinctSeen += 1
    if (files.length < MAX_CHANGED_FILES) {
      files.push({
        path,
        kind: entry.kind as AutomationChangedFileKind,
        state: entry.state,
      })
    }
  }

  // The array held entries but none was usable: the summary cannot prove the
  // capture saw nothing, so it is untrustworthy rather than "none".
  if (files.length === 0 && record.files.length > 0) return undefined

  const rawTotal = record.totalFiles
  const totalFiles = typeof rawTotal === 'number' &&
    Number.isInteger(rawTotal) &&
    rawTotal >= distinctSeen &&
    rawTotal <= MAX_TRACKED_FILES
    ? rawTotal
    // A missing or impossible total falls back to what the entries prove. It
    // never inflates the count from an untrusted field.
    : distinctSeen

  if (files.length === 0 && totalFiles > 0) return undefined

  const rawCalls = record.editCalls
  const editCalls = typeof rawCalls === 'number' &&
    Number.isInteger(rawCalls) &&
    rawCalls >= 0 &&
    rawCalls <= MAX_EDIT_CALLS
    ? rawCalls
    : 0

  return {
    files,
    totalFiles,
    // Derived rather than trusted: the flag must agree with the list, so a
    // hand-edited `truncated: true` beside an equal count cannot mislead the UI.
    truncated: totalFiles > files.length,
    editCalls,
  }
}
