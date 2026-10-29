/**
 * Project identity and filtering for the memdir tab.
 *
 * A project-scoped memory file only knows the `~/.claude/projects/<slug>`
 * folder name it lives in. That folder name is the lossy slug `cwdToProjectSlug`
 * produces — every non-alphanumeric character became a hyphen — so it cannot be
 * reversed into the real directory. The readable label therefore comes from the
 * session list, which is the same source the rest of the app reads: a Codex row
 * carries the engine's real `cwd`; a Claude row carries `project`, the app's
 * existing slug decode. When no session names a hash, the hash itself is shown.
 * It is never turned into a path this module made up.
 */

/** A structured memory row, reduced to what filtering needs. */
export interface MemoryProjectFile {
  scope: 'global' | 'project'
  projectHash?: string
}

/** The subset of a session row the label join reads. */
export interface ProjectSessionRef {
  projectSlug?: string
  project?: string
  cwd?: string
}

export type MemoryProjectFilter = 'all' | 'global' | `project:${string}`

export interface MemoryProjectOption {
  hash: string
  /** Readable folder path, or the hash itself when nothing names it. */
  label: string
  /** False when the label is the raw folder id, not a name. */
  known: boolean
}

export interface MemoryProjectFilterOption extends MemoryProjectOption {
  /** Memory files that actually live in this project. */
  count: number
}

export type MemoryCreateScope = 'global' | 'project'

/**
 * What stops a project-scoped create, or null when the choice is usable.
 * `project_unavailable` means there is nothing to pick yet (no sessions);
 * `invalid_project` means the picked hash is not one the main process accepts.
 */
export type MemoryCreateScopeIssue = 'project_unavailable' | 'invalid_project' | null

/**
 * Mirrors `isValidProjectHash` in `main/sessions/memory-manager.ts`: a project
 * folder is one path segment and nothing else. Any hash this rejects is a hash
 * `createMemoryFile` would refuse, so it must not be offered in the picker.
 */
export function isCreatableProjectHash(hash: unknown): hash is string {
  return (
    typeof hash === 'string' &&
    hash.length > 0 &&
    !hash.includes('/') &&
    !hash.includes('\\') &&
    hash !== '.' &&
    hash !== '..'
  )
}

/**
 * The best readable name any session gives this project folder.
 *
 * A real `cwd` wins outright: it is a directory the engine reported, not a
 * reconstruction. Otherwise the session's `project` field is the app's own
 * slug decode, which is lossy but is what every other session view prints.
 */
export function projectLabelFromSessions(
  hash: string,
  sessions: readonly ProjectSessionRef[],
): string | null {
  if (!hash) return null
  let decoded: string | null = null
  for (const session of sessions) {
    if (session.projectSlug !== hash) continue
    if (session.cwd) return session.cwd
    if (!decoded && session.project) decoded = session.project
  }
  return decoded
}

/** Readable label plus whether it is a name or merely the folder id. */
export function memoryProjectLabel(
  hash: string,
  sessions: readonly ProjectSessionRef[],
): { label: string; known: boolean } {
  const label = projectLabelFromSessions(hash, sessions)
  return label ? { label, known: true } : { label: hash, known: false }
}

/**
 * One filter entry per project that actually has memory files. A project with
 * no files is absent on purpose: offering it would produce a filter that can
 * only ever show an empty list.
 */
export function collectMemoryProjects(
  files: readonly MemoryProjectFile[],
  sessions: readonly ProjectSessionRef[],
): MemoryProjectFilterOption[] {
  const counts = new Map<string, number>()
  for (const file of files) {
    if (file.scope !== 'project' || !file.projectHash) continue
    counts.set(file.projectHash, (counts.get(file.projectHash) ?? 0) + 1)
  }
  const options: MemoryProjectFilterOption[] = []
  for (const [hash, count] of counts) {
    const { label, known } = memoryProjectLabel(hash, sessions)
    options.push({ hash, label, known, count })
  }
  return options.sort((a, b) => a.label.localeCompare(b.label) || a.hash.localeCompare(b.hash))
}

/**
 * Projects a create can target.
 *
 * Sessions contribute folders even before they have any memory file — that is
 * the whole point of "create a memory in this project". Memory files contribute
 * their own project in case its transcripts are gone. Ranked so a real cwd beats
 * a decoded slug, and a name beats the bare hash.
 */
export function collectCreatableProjects(
  files: readonly MemoryProjectFile[],
  sessions: readonly ProjectSessionRef[],
): MemoryProjectOption[] {
  const byHash = new Map<string, { label: string; known: boolean; rank: number }>()

  const consider = (hash: unknown, label: string | null, rank: number): void => {
    if (!isCreatableProjectHash(hash)) return
    const previous = byHash.get(hash)
    if (previous && previous.rank >= rank) return
    byHash.set(hash, label ? { label, known: true, rank } : { label: hash, known: false, rank: 0 })
  }

  for (const session of sessions) {
    if (!isCreatableProjectHash(session.projectSlug)) continue
    if (session.cwd) consider(session.projectSlug, session.cwd, 3)
    else if (session.project) consider(session.projectSlug, session.project, 2)
    else consider(session.projectSlug, null, 1)
  }
  for (const file of files) {
    if (file.scope === 'project') consider(file.projectHash, null, 1)
  }

  return [...byHash]
    .map(([hash, entry]) => ({ hash, label: entry.label, known: entry.known }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.hash.localeCompare(b.hash))
}

export function projectFilterForHash(hash: string): MemoryProjectFilter {
  return `project:${hash}`
}

/** The hash a `project:<hash>` filter names, or null for all/global. */
export function projectHashFromFilter(filter: MemoryProjectFilter): string | null {
  const prefix = 'project:'
  return filter.startsWith(prefix) ? filter.slice(prefix.length) : null
}

export function matchesProjectFilter(
  file: MemoryProjectFile,
  filter: MemoryProjectFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'global') return file.scope === 'global'
  const hash = projectHashFromFilter(filter)
  return file.scope === 'project' && hash !== null && hash.length > 0 && file.projectHash === hash
}

/** The label to print for the active project filter (null for all/global). */
export function projectFilterLabel(
  filter: MemoryProjectFilter,
  projects: readonly MemoryProjectOption[],
): string | null {
  const hash = projectHashFromFilter(filter)
  if (hash === null) return null
  return projects.find(project => project.hash === hash)?.label ?? hash
}

/**
 * A search hit names a file. Opening it resets the project filter to All, the
 * same way it already resets the type filter: expanding a row the filter hides
 * would land on nothing. No hit leaves the user's filter alone.
 */
export function widenProjectFilterForFocus(
  filter: MemoryProjectFilter,
  hasFocusHit: boolean,
): MemoryProjectFilter {
  return hasFocusHit ? 'all' : filter
}

/**
 * Whether a project-scoped create can be submitted.
 *
 * The picker only offers hashes passing `isCreatableProjectHash`, and the
 * selected hash has to be one of those entries — a stale selection from a
 * session list that changed underneath must not be posted to main.
 */
export function createScopeIssue(
  scope: MemoryCreateScope,
  projectHash: string | undefined,
  projects: readonly MemoryProjectOption[],
): MemoryCreateScopeIssue {
  if (scope === 'global') return null
  if (projects.length === 0) return 'project_unavailable'
  if (!isCreatableProjectHash(projectHash)) return 'invalid_project'
  if (!projects.some(project => project.hash === projectHash)) return 'invalid_project'
  return null
}

export type MemdirEmptyReason = 'none' | 'project' | 'type' | null

/**
 * Why the list is empty: no files at all, none in the active project filter,
 * or none of the active type within that filter. Each is a different fact and
 * gets its own sentence.
 */
export function memdirEmptyReason(
  files: readonly (MemoryProjectFile & { type: string })[],
  projectFilter: MemoryProjectFilter,
  typeFilter: string,
): MemdirEmptyReason {
  if (files.length === 0) return 'none'
  const inProject = files.filter(file => matchesProjectFilter(file, projectFilter))
  if (inProject.length === 0) return 'project'
  if (typeFilter === 'all') return null
  return inProject.some(file => file.type === typeFilter) ? null : 'type'
}
