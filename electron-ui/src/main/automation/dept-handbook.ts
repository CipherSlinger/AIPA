/**
 * The department handbook a scheduled run may carry.
 *
 * Interactive chat has carried a department's handbook on every turn since the
 * org tree met the chat path (`src/renderer/lib/deptHandbook.ts`). Unattended
 * runs did not: the tree lives in the renderer's localStorage and main
 * assembles those prompts, so a job explicitly filed under a department ran
 * without the standing rules of the desk it belongs to. The asymmetry was
 * invisible — the job row said "Accounting", the run behaved like a stranger.
 *
 * The renderer now writes a small snapshot of what an unattended run needs —
 * each node's id, display name and handbook text, nothing else from the tree —
 * and this module is the read side, plus the validation the writer's payload
 * passes through on both ends. Main never edits the snapshot: it has no tree to
 * edit against, and a second writer would eventually disagree with the first.
 *
 * Three rules shape the read:
 *
 * 1. The ceiling is the chat path's ceiling, in characters, and the cut is
 *    stated *inside* the block. The two numbers must not drift, so the harness
 *    compares this constant with the renderer's and this block builder with
 *    the renderer's output byte for byte. Main cannot import renderer code
 *    (its tsconfig rootDir is `src/main`), hence the copy and the check.
 * 2. A stale snapshot is used. A rule written nine days ago is still the user's
 *    rule, and silently dropping it would make an old department quietly
 *    ruleless. The run record says how old the snapshot was instead.
 * 3. Silence is never an answer. Every run that had an engine records why it
 *    carried no handbook — unfiled, never synced, department not in the
 *    snapshot, or an empty handbook — so "the run behaved oddly" is always
 *    explainable after the fact.
 *
 * Pure and Electron-free, so `.scratch/wave75a-job-handbook-harness` can pin a
 * clock and exercise every branch without a store or a window.
 */
import { MAX_DEPARTMENT_ID_CHARS } from './job-department'
import type { AutomationHandbookDigest, AutomationHandbookState } from './types'

/**
 * How much handbook text one turn may carry.
 *
 * Identical to `DEPT_HANDBOOK_MAX_CHARS` in `src/renderer/lib/deptHandbook.ts`.
 * A chat turn and an unattended run must cut the same handbook at the same
 * place, or the same rules would arrive half-read only at 03:00.
 */
export const DEPT_HANDBOOK_MAX_CHARS = 8000

/**
 * How old a snapshot may be before the run record calls it stale.
 *
 * Not a refusal threshold: the handbook is still used (see the module note).
 * A week is long enough that a normal editing rhythm never trips it, and short
 * enough that "this rule may be older than the tree you are looking at" is a
 * useful sentence rather than noise.
 */
export const DEPT_HANDBOOK_STALE_AFTER_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000
const STALE_AFTER_MS = DEPT_HANDBOOK_STALE_AFTER_DAYS * DAY_MS

/** Nodes one snapshot may hold. Far more than a personal tree; bounded on purpose. */
export const DEPT_HANDBOOK_SNAPSHOT_MAX_ENTRIES = 500

/**
 * Handbook text kept per node.
 *
 * Well above the prompt ceiling, so for any real handbook the cut happens at
 * `DEPT_HANDBOOK_MAX_CHARS` — which is what makes the run record's "cut at 8000
 * of N" true — while a hand-edited or rogue payload still cannot put an
 * unbounded slab of text into a file main reads on every run.
 */
export const DEPT_HANDBOOK_SNAPSHOT_MAX_CHARS = 50_000

/**
 * Handbook text kept across the whole snapshot.
 *
 * The per-entry ceiling alone would allow 500 × 50k. A tree that large is not a
 * real organization; stopping at this budget keeps the file main parses at run
 * start small, and a node that did not fit is simply "not in the snapshot" on
 * the record — a fact, not a guess.
 */
export const DEPT_HANDBOOK_SNAPSHOT_MAX_TOTAL_CHARS = 500_000

/** A node's display name is a label, not a document. */
export const DEPT_HANDBOOK_NAME_MAX_CHARS = 200

/** One node as the renderer last sent it. */
export interface DeptHandbookSnapshotEntry {
  id: string
  /** Display name in the interface language at sync time. */
  name: string
  /** The handbook exactly as stored in the tree; `''` when the node has none. */
  handbook: string
}

/** Everything main keeps about the org tree, and nothing else. */
export interface DeptHandbookSnapshot {
  /** Epoch ms when the renderer last wrote this snapshot. */
  updatedAt: number
  departments: DeptHandbookSnapshotEntry[]
}

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.length > max ? value.slice(0, max) : value
}

/**
 * One entry, or `null` when it cannot name a node.
 *
 * An entry without a usable id is dropped: it could never be matched to a
 * filed job, and keeping it would only make "the snapshot knows this
 * department" ambiguous. A missing or non-string handbook is stored as `''`,
 * because "this node has no handbook" and "the payload forgot the field" are
 * the same fact for the reader — there is no text to carry.
 */
function normalizeEntry(
  raw: unknown,
  remainingChars: number,
): DeptHandbookSnapshotEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entry = raw as Record<string, unknown>
  const id = boundedText(entry.id, MAX_DEPARTMENT_ID_CHARS)?.trim()
  if (!id) return null
  const name = boundedText(entry.name, DEPT_HANDBOOK_NAME_MAX_CHARS)?.trim() || id
  const handbook = boundedText(entry.handbook, DEPT_HANDBOOK_SNAPSHOT_MAX_CHARS) ?? ''
  return {
    id,
    name,
    handbook: handbook.length > remainingChars ? handbook.slice(0, Math.max(0, remainingChars)) : handbook,
  }
}

/**
 * The snapshot a stored file or an IPC payload really describes.
 *
 * Returns `null` for anything that is not a snapshot at all (no object, no
 * list of departments, no usable timestamp). A stored snapshot whose entries
 * are partly corrupt keeps the entries that can be read: one bad node must not
 * cost every department its rules, and the run record says which department it
 * could not find. A later node with the same id wins, matching everywhere else
 * that indexes the tree.
 */
export function normalizeDeptHandbookSnapshot(raw: unknown): DeptHandbookSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const snapshot = raw as Record<string, unknown>
  if (!Array.isArray(snapshot.departments)) return null
  const updatedAt = snapshot.updatedAt
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt < 0) return null

  const departments: DeptHandbookSnapshotEntry[] = []
  let budget = DEPT_HANDBOOK_SNAPSHOT_MAX_TOTAL_CHARS
  for (const candidate of snapshot.departments) {
    if (departments.length >= DEPT_HANDBOOK_SNAPSHOT_MAX_ENTRIES) break
    if (budget <= 0) break
    const entry = normalizeEntry(candidate, budget)
    if (!entry) continue
    budget -= entry.handbook.length
    const existing = departments.findIndex(node => node.id === entry.id)
    if (existing >= 0) departments[existing] = entry
    else departments.push(entry)
  }
  return { updatedAt, departments }
}

/** What the writer accepts: the entries alone. `updatedAt` is main's clock. */
export function normalizeDeptHandbookEntries(
  raw: unknown,
): DeptHandbookSnapshotEntry[] | null {
  if (!Array.isArray(raw)) return null
  return normalizeDeptHandbookSnapshot({ updatedAt: 0, departments: raw })?.departments ?? []
}

/**
 * Wrap handbook text in the block the model reads.
 *
 * Byte-identical to `buildDeptHandbookBlock` in the renderer's
 * `lib/deptHandbook.ts` (the harness compares the two). The cut is stated
 * inside the block because the model must be able to tell that the rules it
 * was handed are incomplete.
 */
export function buildDeptHandbookBlock(raw: string): {
  text: string
  chars: number
  sourceChars: number
  truncated: boolean
} {
  const content = raw.trim()
  const sourceChars = content.length
  const truncated = sourceChars > DEPT_HANDBOOK_MAX_CHARS
  const body = truncated ? content.slice(0, DEPT_HANDBOOK_MAX_CHARS) : content
  const marker = truncated
    ? `\n\n[department handbook cut here: showing the first ${body.length} of ${sourceChars} characters]`
    : ''
  return {
    text: `<department_handbook>\n${body}${marker}\n</department_handbook>`,
    chars: body.length,
    sourceChars,
    truncated,
  }
}

/** How old the snapshot is at `now`, in whole days; never negative. */
export function snapshotAgeDays(updatedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - updatedAt) / DAY_MS))
}

/**
 * What one run does with the snapshot.
 *
 * `text` is `''` whenever nothing was given, and the digest still carries the
 * reason — unlike the chat path, which leaves no receipt when there is nothing
 * to disclose. A scheduled run has no user watching it, so the run record is
 * the only place the fact would ever land.
 */
export function resolveRunHandbook(input: {
  snapshot: DeptHandbookSnapshot | null
  /** The job's `departmentId`; absent or empty when it is filed nowhere. */
  departmentId?: string | null
  now: number
}): { text: string; digest: AutomationHandbookDigest } {
  const rawId = typeof input.departmentId === 'string' ? input.departmentId.trim() : ''
  if (!rawId) {
    return {
      text: '',
      digest: { state: 'no-department', chars: 0, sourceChars: 0, truncated: false, stale: false },
    }
  }

  const snapshot = input.snapshot
  if (!snapshot) {
    return {
      text: '',
      digest: {
        state: 'no-snapshot',
        departmentId: rawId,
        chars: 0,
        sourceChars: 0,
        truncated: false,
        stale: false,
      },
    }
  }

  const ageDays = snapshotAgeDays(snapshot.updatedAt, input.now)
  // Only the *use* of a stale snapshot is flagged. A department the snapshot
  // does not list carries no rules whether the snapshot is old or new; saying
  // "stale" there would imply it was used.
  const stale = ageDays * DAY_MS > STALE_AFTER_MS
  const entry = snapshot.departments.find(node => node.id === rawId)
  if (!entry) {
    return {
      text: '',
      digest: {
        state: 'unknown-department',
        departmentId: rawId,
        chars: 0,
        sourceChars: 0,
        truncated: false,
        stale: false,
        ageDays,
      },
    }
  }

  if (!entry.handbook.trim()) {
    return {
      text: '',
      digest: {
        state: 'empty',
        departmentId: entry.id,
        departmentName: entry.name,
        chars: 0,
        sourceChars: 0,
        truncated: false,
        stale,
        ageDays,
      },
    }
  }

  const block = buildDeptHandbookBlock(entry.handbook)
  return {
    text: block.text,
    digest: {
      state: 'used',
      departmentId: entry.id,
      departmentName: entry.name,
      chars: block.chars,
      sourceChars: block.sourceChars,
      truncated: block.truncated,
      stale,
      ageDays,
    },
  }
}

const DIGEST_STATES: AutomationHandbookState[] = [
  'used',
  'no-department',
  'no-snapshot',
  'unknown-department',
  'empty',
]

function isCount(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
}

/**
 * Restore one persisted digest, or drop it.
 *
 * Same discipline as `normalizeMemoryDigest`: a hand-edited or half-written
 * record must degrade to "not recorded" — which the row renders as silence —
 * never to a claim the run could not have made. The per-state invariants are
 * checked because the scheduler relies on them: `used` must name a department
 * and carry text, every absence must carry none, and the counts must be the
 * ones `buildDeptHandbookBlock` could have produced.
 */
export function normalizeAutomationHandbookDigest(
  raw: unknown,
): AutomationHandbookDigest | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const digest = raw as Record<string, unknown>
  const state = digest.state
  if (typeof state !== 'string' || !DIGEST_STATES.includes(state as AutomationHandbookState)) {
    return undefined
  }
  if (typeof digest.truncated !== 'boolean' || typeof digest.stale !== 'boolean') return undefined
  if (!isCount(digest.chars, DEPT_HANDBOOK_MAX_CHARS)) return undefined
  if (!isCount(digest.sourceChars, DEPT_HANDBOOK_SNAPSHOT_MAX_CHARS)) return undefined

  const departmentId = typeof digest.departmentId === 'string' &&
    digest.departmentId.trim().length > 0 &&
    digest.departmentId.length <= MAX_DEPARTMENT_ID_CHARS
    ? digest.departmentId.trim()
    : undefined
  const departmentName = typeof digest.departmentName === 'string' && digest.departmentName.trim()
    ? digest.departmentName.trim().slice(0, DEPT_HANDBOOK_NAME_MAX_CHARS)
    : undefined
  const ageDays = typeof digest.ageDays === 'number' &&
    Number.isInteger(digest.ageDays) &&
    digest.ageDays >= 0
    ? digest.ageDays
    : undefined

  const base = { chars: digest.chars, sourceChars: digest.sourceChars }
  const kinds = state as AutomationHandbookState

  if (kinds === 'no-department') {
    // A job filed nowhere has no department to name and no snapshot to age.
    if (departmentId || departmentName || ageDays !== undefined) return undefined
    if (digest.chars !== 0 || digest.sourceChars !== 0 || digest.truncated || digest.stale) return undefined
    return { state: kinds, chars: 0, sourceChars: 0, truncated: false, stale: false }
  }

  // Every remaining state is about a department the job named.
  if (!departmentId) return undefined

  if (kinds === 'no-snapshot') {
    if (departmentName || ageDays !== undefined) return undefined
    if (digest.chars !== 0 || digest.sourceChars !== 0 || digest.truncated || digest.stale) return undefined
    return { state: kinds, departmentId, chars: 0, sourceChars: 0, truncated: false, stale: false }
  }

  // A snapshot existed, so the run knew its age.
  if (ageDays === undefined) return undefined

  if (kinds === 'unknown-department') {
    if (departmentName) return undefined
    if (digest.chars !== 0 || digest.sourceChars !== 0 || digest.truncated || digest.stale) return undefined
    return {
      state: kinds, departmentId, chars: 0, sourceChars: 0, truncated: false, stale: false, ageDays,
    }
  }

  if (!departmentName) return undefined

  if (kinds === 'empty') {
    if (digest.chars !== 0 || digest.sourceChars !== 0 || digest.truncated) return undefined
    return {
      state: kinds, departmentId, departmentName, chars: 0, sourceChars: 0, truncated: false,
      stale: digest.stale, ageDays,
    }
  }

  // `used`: the counts must be exactly what the block builder would have
  // produced for `sourceChars`, or the row could report a cut that never
  // happened (or miss one that did).
  const expectedChars = Math.min(digest.sourceChars, DEPT_HANDBOOK_MAX_CHARS)
  const expectedTruncated = digest.sourceChars > DEPT_HANDBOOK_MAX_CHARS
  if (digest.chars !== expectedChars || digest.truncated !== expectedTruncated) return undefined
  if (digest.chars === 0) return undefined
  return {
    ...base,
    state: kinds,
    departmentId,
    departmentName,
    truncated: digest.truncated,
    stale: digest.stale,
    ageDays,
  }
}
