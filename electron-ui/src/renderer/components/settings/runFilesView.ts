// How one run's captured file summary is presented in Settings → Automations.
//
// The three coverage states are the point of this module, and they must never
// collapse into each other:
//  - `unrecorded`: the record has no summary (an older run, or a rejected one).
//    The row says nothing at all.
//  - `none`: the capture ran and saw no file-editing tool calls. The row says
//    exactly that — it is not evidence that the run changed nothing on disk.
//  - `captured`: at least one tool-driven edit was seen; show the bounded list
//    and the "N more" tail for paths the record could not store.
//
// Pure and React-free so `.scratch/wave49-run-files-harness` can exercise the
// states, the omission count and the markers without mounting anything.
import type {
  AutomationChangedFileData,
  AutomationChangedFileKindData,
  AutomationRunChangedFilesData,
} from '../../../preload'

export type RunFilesCoverage = 'captured' | 'none' | 'unrecorded'

export interface RunFilesView {
  coverage: RunFilesCoverage
  /** Stored paths, first-seen order. Empty for `unrecorded` and `none`. */
  files: AutomationChangedFileData[]
  /** Distinct paths the run saw, including ones beyond `files`. */
  totalFiles: number
  /** Known but unstored paths, rendered as an "N more" tail. */
  omitted: number
  /** `totalFiles` exceeds the stored list. */
  truncated: boolean
  /** Tool-driven edit emissions observed; 0 when the field is absent. */
  editCalls: number
}

const KINDS: readonly AutomationChangedFileKindData[] = ['add', 'update', 'delete', 'unknown']

function emptyView(coverage: RunFilesCoverage): RunFilesView {
  return {
    coverage,
    files: [],
    totalFiles: 0,
    omitted: 0,
    truncated: false,
    editCalls: 0,
  }
}

function isChangedFile(value: unknown): value is AutomationChangedFileData {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const file = value as Record<string, unknown>
  return typeof file.path === 'string' &&
    file.path.trim().length > 0 &&
    typeof file.kind === 'string' &&
    KINDS.includes(file.kind as AutomationChangedFileKindData) &&
    (file.state === 'edited' || file.state === 'attempted')
}

/**
 * Turn a persisted summary into what the row renders.
 *
 * Defensive even though main's `normalizeChangedFiles` has already validated
 * the field: the renderer may be handed an older preload shape or a payload
 * from a future version, and a malformed file entry must not crash the list.
 * A summary that claims paths but stores none reads as `unrecorded`, not as
 * `none` — the difference between "we saw nothing" and "we cannot say".
 */
export function viewRunFiles(
  raw: AutomationRunChangedFilesData | undefined | null,
): RunFilesView {
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyView('unrecorded')
  }

  const files: AutomationChangedFileData[] = []
  const seen = new Set<string>()
  const candidates: unknown[] = Array.isArray(raw.files) ? raw.files as unknown[] : []
  for (const candidate of candidates) {
    if (!isChangedFile(candidate)) continue
    const path = candidate.path.trim()
    if (seen.has(path)) continue
    seen.add(path)
    files.push({ path, kind: candidate.kind, state: candidate.state })
  }

  const rawTotal = raw.totalFiles
  const totalFiles = typeof rawTotal === 'number' && Number.isFinite(rawTotal) && rawTotal >= files.length
    ? Math.floor(rawTotal)
    : files.length
  const rawCalls = raw.editCalls
  const editCalls = typeof rawCalls === 'number' && Number.isFinite(rawCalls) && rawCalls >= 0
    ? Math.floor(rawCalls)
    : 0

  if (files.length === 0) {
    return totalFiles > 0 || candidates.length > 0
      // Paths were claimed or entries existed but none survived: we cannot
      // name them, so the honest answer is "not recorded", never "no edits".
      ? emptyView('unrecorded')
      : { ...emptyView('none'), editCalls }
  }

  return {
    coverage: 'captured',
    files,
    totalFiles,
    omitted: Math.max(0, totalFiles - files.length),
    truncated: totalFiles > files.length,
    editCalls,
  }
}

/**
 * The one-character kind marker, matching the diff vocabulary the rest of the
 * app uses: added `+`, updated `~`, deleted `-`. An unknown kind gets a neutral
 * dot instead of borrowing `~`, which would claim an update nobody stated.
 */
export function fileKindMarker(kind: AutomationChangedFileKindData): string {
  if (kind === 'add') return '+'
  if (kind === 'delete') return '-'
  if (kind === 'update') return '~'
  return '·'
}
