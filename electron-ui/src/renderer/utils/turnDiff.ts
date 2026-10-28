/**
 * Unified-diff parsing for Codex's aggregate turn diff (`turn/diff/updated`).
 *
 * The text is a patch produced by the engine, not by us: it may arrive
 * truncated at the front (the bridge keeps only the tail of a 32 KiB window),
 * or be cut mid-line. Nothing here may assume a well-formed patch, so every
 * counter degrades to a best-effort value instead of throwing.
 *
 * Deliberately dependency-free and React-free so the rules can be exercised
 * from a plain Node script.
 */

export interface TurnDiffStats {
  files: number
  additions: number
  deletions: number
}

export type TurnDiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'context'

/** Guards against a pathological payload; real diffs are capped well below this. */
const MAX_DIFF_LINES = 60000

const META_PREFIXES = [
  'diff ',
  'index ',
  '--- ',
  '+++ ',
  'new file mode ',
  'deleted file mode ',
  'old mode ',
  'new mode ',
  'similarity index ',
  'dissimilarity index ',
  'rename from ',
  'rename to ',
  'copy from ',
  'copy to ',
  '\\',
]

/** Split into display lines. A trailing newline does not produce an empty line. */
export function splitTurnDiff(diff: string | null | undefined): string[] {
  if (typeof diff !== 'string' || diff.length === 0) return []
  const lines = diff.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  if (lines.length > MAX_DIFF_LINES) lines.length = MAX_DIFF_LINES
  return lines
}

/**
 * Count changed files, additions and deletions.
 *
 * Additions/deletions are only counted inside hunks (after `@@`), which keeps
 * `--- a/file` / `+++ b/file` headers out of the totals. A `---`/`+++` pair
 * with no `@@` still counts as one file, and a payload where no hunk was ever
 * seen (front-truncated past every `@@`, or a non-patch string) falls back to
 * counting `+`/`-` lines with header-shaped lines excluded.
 */
export function summarizeTurnDiff(diff: string | null | undefined): TurnDiffStats {
  const lines = splitTurnDiff(diff)
  let gitHeaders = 0
  let plainHeaders = 0
  let additions = 0
  let deletions = 0
  let inHunk = false
  let sawOldHeader = false

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      gitHeaders++
      inHunk = false
      sawOldHeader = false
      continue
    }
    if (line.startsWith('@@')) {
      inHunk = true
      sawOldHeader = false
      continue
    }
    if (!inHunk) {
      if (line.startsWith('--- ')) {
        sawOldHeader = true
      } else if (sawOldHeader && line.startsWith('+++ ')) {
        plainHeaders++
        sawOldHeader = false
      } else {
        sawOldHeader = false
      }
      continue
    }
    if (line.startsWith('+')) additions++
    else if (line.startsWith('-')) deletions++
  }

  if (additions === 0 && deletions === 0) {
    for (const line of lines) {
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) continue
      if (line.startsWith('index ') || line.startsWith('@@') || line.startsWith('\\')) continue
      if (line.startsWith('+')) additions++
      else if (line.startsWith('-')) deletions++
    }
  }

  return {
    files: gitHeaders > 0 ? gitHeaders : plainHeaders,
    additions,
    deletions,
  }
}

function isMetaLine(line: string): boolean {
  for (const prefix of META_PREFIXES) {
    if (line.startsWith(prefix)) return true
  }
  return false
}

/**
 * Classify every line for rendering. Stateful on purpose: once inside a hunk a
 * line beginning with `---` is removed code, not a file header.
 */
export function classifyTurnDiff(diff: string | null | undefined): TurnDiffLineKind[] {
  const lines = splitTurnDiff(diff)
  const kinds: TurnDiffLineKind[] = new Array(lines.length)
  let inHunk = false
  let sawHunk = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('diff --git ')) {
      inHunk = false
      kinds[i] = 'meta'
      continue
    }
    if (line.startsWith('@@')) {
      inHunk = true
      sawHunk = true
      kinds[i] = 'hunk'
      continue
    }
    if (!inHunk) {
      kinds[i] = isMetaLine(line) ? 'meta' : 'context'
      continue
    }
    if (line.startsWith('\\')) kinds[i] = 'meta'
    else if (line.startsWith('+')) kinds[i] = 'add'
    else if (line.startsWith('-')) kinds[i] = 'del'
    else kinds[i] = 'context'
  }

  // Front truncation can drop every `@@`, leaving only hunk bodies. Judge those
  // by the +/- prefix, as the summary counter does, so the tail of a big diff
  // is still readable instead of rendering as flat context.
  if (!sawHunk) {
    for (let i = 0; i < lines.length; i++) {
      if (kinds[i] === 'meta') continue
      const line = lines[i]
      if (line.startsWith('+++') || line.startsWith('---')) kinds[i] = 'meta'
      else if (line.startsWith('+')) kinds[i] = 'add'
      else if (line.startsWith('-')) kinds[i] = 'del'
    }
  }

  return kinds
}
