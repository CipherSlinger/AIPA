/**
 * Memory Manager
 *
 * Reads and writes Claude Code memory files:
 *   ~/.claude/MEMORY.md  — global memory index
 *   ~/.claude/projects/<hash>/memory/*.md — project-scoped memories
 *
 * Memory file frontmatter format:
 *   ---
 *   name: xxx
 *   description: one-line description
 *   type: user | feedback | project | reference
 *   ---
 *   content here
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createHash } from 'crypto'
import { createLogger } from '../utils/logger'
import { isPathInside } from '../utils/validate'

const log = createLogger('memory-manager')

export interface MemoryFile {
  filePath: string
  name: string
  description: string
  type: 'user' | 'feedback' | 'project' | 'reference' | 'unknown'
  content: string
  scope: 'global' | 'project'
  projectHash?: string
  mtime: number
}

/** Every way a memory path can fail without throwing out of assembly. */
export type MemoryUnreadableReason = 'stat' | 'read' | 'parse' | 'scan'

/**
 * A memory path that existed but could not be read.
 *
 * A missing file is deliberately absent: "nothing there" is not the same fact
 * as "there, but broken", and only the second one is worth telling a user
 * about. Paths are diagnostics, never prompt content.
 */
export interface MemoryUnreadable {
  path: string
  scope: 'global' | 'project'
  reason: MemoryUnreadableReason
  projectHash?: string
}

export interface MemoryFileListing {
  files: MemoryFile[]
  unreadable: MemoryUnreadable[]
}

/**
 * Cap on diagnostic entries, so a directory full of broken files cannot bloat
 * a prompt response or a persisted run record.
 */
export const MAX_MEMORY_UNREADABLE = 50

function getClaudeDir(): string {
  return path.join(os.homedir(), '.claude')
}

function getGlobalMemoryDir(): string {
  return path.join(getClaudeDir(), 'memory')
}

// ── Cache ──────────────────────────────────────────
//
// `memory:list` runs on every message send (the renderer awaits it while
// assembling the prompt), and it used to walk every project directory and
// read every memory file — hundreds of milliseconds of synchronous I/O in
// the main process before the prompt is even routed.
//
// The filesystem is still the source of truth. We keep three layers:
//   - fileCache: parsed file keyed by (path, mtimeMs, size). A stat decides
//     whether the content may be reused; in-place edits change mtime/size.
//   - dirCache: markdown filenames in a directory, keyed by the directory's
//     mtime. Adding/removing a file touches that mtime, so an unchanged
//     directory skips its readdir (and therefore the file list rebuild).
//   - projectsCache: the `~/.claude/projects` listing, keyed the same way, so
//     adding no project skips the top-level readdir too.
//
// Every mutation this module performs invalidates the affected entries, so
// the UI sees its own writes immediately even on coarse-timestamp filesystems.
interface CachedFile {
  mtimeMs: number
  size: number
  memory: MemoryFile | null
  /** Why the file produced no memory; undefined when `memory` is present. */
  reason?: 'stat' | 'read' | 'parse'
}
const fileCache = new Map<string, CachedFile>()

interface CachedDir {
  mtimeMs: number
  mdFiles: string[]
}
const dirCache = new Map<string, CachedDir>()

let projectsCache: { mtimeMs: number; hashes: string[] } | null = null

/** A failed stat is only worth reporting when the path is not simply absent. */
function isMissingError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

interface DirectoryStat {
  stat: fs.Stats | null
  /** Set only when the path exists but could not be used as a directory. */
  error?: unknown
}

function statDirectoryDetailed(dir: string): DirectoryStat {
  try {
    const stat = fs.statSync(dir)
    // A file where a memory directory is expected is not worth reporting; the
    // old code treated it as absent, and a missing directory is not a failure.
    return stat.isDirectory() ? { stat } : { stat: null }
  } catch (err) {
    return { stat: null, error: err }
  }
}

interface DirectoryListing {
  files: string[]
  /** True when the directory exists but its entries could not be listed. */
  scanError: boolean
}

/** Markdown filenames in `dir`; reused verbatim while the directory mtime holds. */
function listMarkdownFiles(dir: string, st: fs.Stats): DirectoryListing {
  const cached = dirCache.get(dir)
  if (cached && cached.mtimeMs === st.mtimeMs) return { files: cached.mdFiles, scanError: false }
  try {
    const mdFiles = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
    dirCache.set(dir, { mtimeMs: st.mtimeMs, mdFiles })
    return { files: mdFiles, scanError: false }
  } catch {
    dirCache.delete(dir)
    return { files: [], scanError: true }
  }
}

interface ParsedMemory {
  memory: MemoryFile | null
  /** `read` for an I/O failure, `parse` for a broken frontmatter block. */
  reason?: 'read' | 'parse'
}

interface CachedParse {
  memory: MemoryFile | null
  /** Adds `stat` because a file can also disappear or be unreadable at stat time. */
  reason?: 'stat' | 'read' | 'parse'
}

function parseMemoryFileDetailed(
  filePath: string,
  scope: 'global' | 'project',
  projectHash?: string,
  st?: fs.Stats,
): ParsedMemory {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return { memory: null, reason: 'read' }
  }

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  // An opening fence with no closing fence is a broken file, not a memory
  // whose body happens to start with dashes. Every other shape keeps the old
  // fallback (the whole file becomes content), so prompt text does not move.
  if (!fmMatch && raw.startsWith('---\n')) {
    return { memory: null, reason: 'parse' }
  }

  let name = path.basename(filePath, '.md')
  let description = ''
  let type: MemoryFile['type'] = 'unknown'
  let content = raw

  if (fmMatch) {
    const frontmatter = fmMatch[1]
    content = fmMatch[2].trim()
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
    const typeMatch = frontmatter.match(/^type:\s*(.+)$/m)
    if (nameMatch) name = nameMatch[1].trim()
    if (descMatch) description = descMatch[1].trim()
    if (typeMatch) {
      const t = typeMatch[1].trim()
      if (['user', 'feedback', 'project', 'reference'].includes(t)) {
        type = t as MemoryFile['type']
      }
    }
  }

  let mtime = 0
  try { mtime = (st ?? fs.statSync(filePath)).mtimeMs } catch { /* ignore */ }
  return { memory: { filePath, name, description, type, content, scope, projectHash, mtime } }
}

/**
 * Parse one file, reusing the previous parse while (mtime, size) is unchanged.
 * A stat is still required to notice an edit; the expensive read/parse is not.
 */
function parseMemoryFileCachedDetailed(
  filePath: string,
  scope: 'global' | 'project',
  projectHash?: string,
): CachedParse {
  let st: fs.Stats
  try {
    st = fs.statSync(filePath)
  } catch (err) {
    fileCache.delete(filePath)
    // A file that vanished between readdir and stat is missing, not broken.
    return { memory: null, reason: isMissingError(err) ? undefined : 'stat' }
  }
  // A directory can carry a `.md` name; reading it always fails, so report it
  // as a read failure rather than silently dropping the entry.
  if (st.isDirectory()) {
    fileCache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, memory: null, reason: 'read' })
    return { memory: null, reason: 'read' }
  }
  const cached = fileCache.get(filePath)
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    return { memory: cached.memory, reason: cached.memory ? undefined : cached.reason }
  }
  const parsed = parseMemoryFileDetailed(filePath, scope, projectHash, st)
  fileCache.set(filePath, {
    mtimeMs: st.mtimeMs,
    size: st.size,
    memory: parsed.memory,
    reason: parsed.reason,
  })
  return parsed
}

/** List global memory files from ~/.claude/memory/, reporting what failed. */
function listGlobalMemoriesDetailed(): MemoryFileListing {
  const memDir = getGlobalMemoryDir()
  const { stat, error } = statDirectoryDetailed(memDir)
  const unreadable: MemoryUnreadable[] = []
  if (!stat) {
    if (error && !isMissingError(error)) {
      unreadable.push({ path: memDir, scope: 'global', reason: 'stat' })
    }
    return { files: [], unreadable }
  }

  const files: MemoryFile[] = []
  const listing = listMarkdownFiles(memDir, stat)
  if (listing.scanError) {
    unreadable.push({ path: memDir, scope: 'global', reason: 'scan' })
  }
  for (const name of listing.files) {
    const filePath = path.join(memDir, name)
    const parsed = parseMemoryFileCachedDetailed(filePath, 'global')
    if (parsed.memory) files.push(parsed.memory)
    else if (parsed.reason) unreadable.push({ path: filePath, scope: 'global', reason: parsed.reason })
  }
  return { files, unreadable }
}

interface ProjectHashes {
  hashes: string[]
  unreadable: MemoryUnreadable[]
}

/** Project hashes under ~/.claude/projects, reused while that directory is unchanged. */
function readProjectHashesDetailed(): ProjectHashes {
  const projectsDir = path.join(getClaudeDir(), 'projects')
  const { stat, error } = statDirectoryDetailed(projectsDir)
  if (!stat) {
    projectsCache = null
    const unreadable: MemoryUnreadable[] = []
    if (error && !isMissingError(error)) {
      unreadable.push({ path: projectsDir, scope: 'project', reason: 'scan' })
    }
    return { hashes: [], unreadable }
  }
  if (projectsCache && projectsCache.mtimeMs === stat.mtimeMs) {
    return { hashes: projectsCache.hashes, unreadable: [] }
  }
  try {
    const hashes = fs.readdirSync(projectsDir).filter(isValidProjectHash)
    projectsCache = { mtimeMs: stat.mtimeMs, hashes }
    return { hashes, unreadable: [] }
  } catch {
    projectsCache = null
    return { hashes: [], unreadable: [{ path: projectsDir, scope: 'project', reason: 'scan' }] }
  }
}

function readProjectHashes(): string[] {
  return readProjectHashesDetailed().hashes
}

/** List project-scoped memory files, reporting what failed. */
function listProjectMemoriesDetailed(): MemoryFileListing {
  const projectsDir = path.join(getClaudeDir(), 'projects')
  const files: MemoryFile[] = []
  const { hashes, unreadable } = readProjectHashesDetailed()
  for (const hash of hashes) {
    const memDir = path.join(projectsDir, hash, 'memory')
    const { stat, error } = statDirectoryDetailed(memDir)
    if (!stat) {
      // A project with no memory directory is the common case, not a failure.
      if (error && !isMissingError(error)) {
        unreadable.push({ path: memDir, scope: 'project', reason: 'stat', projectHash: hash })
      }
      continue
    }
    const listing = listMarkdownFiles(memDir, stat)
    if (listing.scanError) {
      unreadable.push({ path: memDir, scope: 'project', reason: 'scan', projectHash: hash })
    }
    for (const name of listing.files) {
      const filePath = path.join(memDir, name)
      const parsed = parseMemoryFileCachedDetailed(filePath, 'project', hash)
      if (parsed.memory) files.push(parsed.memory)
      else if (parsed.reason) {
        unreadable.push({ path: filePath, scope: 'project', reason: parsed.reason, projectHash: hash })
      }
    }
  }
  return { files, unreadable }
}

/** Drop cached filesystem state after this module writes; safe to over-clear. */
function invalidateMemoryCache(filePath?: string): void {
  if (filePath) fileCache.delete(path.resolve(filePath))
  dirCache.clear()
  projectsCache = null
}

/**
 * List memory files together with the paths that existed but could not be
 * read. Best-effort: one broken file never throws out of assembly, and a
 * missing file is never reported as unreadable.
 */
export function listMemoryFilesDetailed(scope?: 'global' | 'project' | 'all'): MemoryFileListing {
  const files: MemoryFile[] = []
  const unreadable: MemoryUnreadable[] = []
  if (scope !== 'project') {
    const global = listGlobalMemoriesDetailed()
    files.push(...global.files)
    unreadable.push(...global.unreadable)
  }
  if (scope !== 'global') {
    const project = listProjectMemoriesDetailed()
    files.push(...project.files)
    unreadable.push(...project.unreadable)
  }
  return { files, unreadable: unreadable.slice(0, MAX_MEMORY_UNREADABLE) }
}

/** Thin wrapper for callers that only need the files. */
export function listMemoryFiles(scope?: 'global' | 'project' | 'all'): MemoryFile[] {
  return listMemoryFilesDetailed(scope).files
}

/**
 * Resolve a memory file path, rejecting anything outside the two memory roots:
 *   ~/.claude/memory
 *   ~/.claude/projects/<projectHash>/memory
 * A plain prefix check is not enough — `~/.claude-evil/x` starts with `~/.claude`.
 */
function resolveMemoryPath(filePath: string): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Invalid memory file path')
  }
  const resolved = path.resolve(filePath)
  const allowedRoots = [getGlobalMemoryDir(), ...getProjectMemoryDirs()]
  if (!allowedRoots.some(root => isPathInside(root, resolved))) {
    throw new Error('Path outside memory directories is not allowed')
  }
  return resolved
}

/** The `memory` subdirectory of every project, plus nothing else. */
function getProjectMemoryDirs(): string[] {
  const projectsDir = path.join(getClaudeDir(), 'projects')
  return readProjectHashes().map(hash => path.join(projectsDir, hash, 'memory'))
}

/**
 * Project directory names are Claude's sanitised cwd slugs, but only a single
 * path segment is ever valid as a directory name.
 */
function isValidProjectHash(hash: string): boolean {
  return !!hash && !hash.includes('/') && !hash.includes('\\') && hash !== '.' && hash !== '..'
}

// ── Structured read / write (memory console editor) ──────────────────────
//
// The editor needs three facts the old string-returning channel could not
// carry: which bytes were read (so it can notice a file changing underneath
// it), whether the file exists at all, and whether it is too large to load.
// Returning data instead of throwing keeps "refused" distinct from "failed".

/**
 * Ceiling on a single memory file the console will read or write.
 *
 * Memory files are notes, not documents; 25× the largest real one is still
 * small enough to keep the main process responsive, and a file past this cap
 * is refused by name rather than truncated into a half-editable draft.
 */
export const MAX_MEMORY_FILE_BYTES = 256 * 1024

export type MemoryReadCode = 'not_found' | 'outside_roots' | 'too_large' | 'read_failed'
export type MemoryWriteCode =
  | 'outside_roots' | 'too_large' | 'invalid_content' | 'changed_on_disk' | 'write_failed'
export type MemoryCreateCode =
  | 'outside_roots' | 'invalid_name' | 'memory_exists' | 'too_large'
  | 'invalid_content' | 'write_failed'

export interface MemoryReadSuccess {
  ok: true
  content: string
  /** Hex SHA-256 over the exact UTF-8 bytes returned in `content`. */
  sha256: string
  size: number
  mtime: number
}

export interface MemoryReadFailure {
  ok: false
  code: MemoryReadCode
  message: string
}

export type MemoryReadResult = MemoryReadSuccess | MemoryReadFailure

export interface MemoryWriteSuccess {
  ok: true
  sha256: string
  size: number
  mtime: number
}

export interface MemoryWriteFailure {
  ok: false
  code: MemoryWriteCode
  message: string
  /** Current on-disk state, present for `changed_on_disk` when it was readable. */
  sha256?: string
  mtime?: number
}

export type MemoryWriteResult = MemoryWriteSuccess | MemoryWriteFailure

export type MemoryCreateResult =
  | { ok: true; filePath: string }
  | {
      ok: false
      code: MemoryCreateCode
      message: string
      /** The file the slug collided with, for `memory_exists`. */
      filePath?: string
      /** The existing file's display name, so the UI can name the obstacle. */
      name?: string
    }

function sha256Of(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Read one memory file together with the identity of the bytes read.
 *
 * The path gate is the same `resolveMemoryPath` every other channel uses; a
 * path outside it is refused as `outside_roots`, never silently re-rooted.
 */
export function readMemoryFile(filePath: string): MemoryReadResult {
  let safe: string
  try {
    safe = resolveMemoryPath(filePath)
  } catch (err) {
    return { ok: false, code: 'outside_roots', message: errorMessage(err) }
  }

  let st: fs.Stats
  try {
    st = fs.statSync(safe)
  } catch (err) {
    if (isMissingError(err)) return { ok: false, code: 'not_found', message: 'Memory file not found' }
    return { ok: false, code: 'read_failed', message: errorMessage(err) }
  }
  if (!st.isFile()) {
    // A directory carrying a `.md` name is readable by neither the viewer nor
    // the editor; say the read failed rather than pretending it is empty.
    return { ok: false, code: 'read_failed', message: 'Not a regular file' }
  }
  if (st.size > MAX_MEMORY_FILE_BYTES) {
    return {
      ok: false,
      code: 'too_large',
      message: `Memory file is larger than ${MAX_MEMORY_FILE_BYTES} bytes`,
    }
  }

  let content: string
  try {
    content = fs.readFileSync(safe, 'utf-8')
  } catch (err) {
    return { ok: false, code: 'read_failed', message: errorMessage(err) }
  }
  const size = Buffer.byteLength(content, 'utf-8')
  // The file can grow between stat and read; the cap is about what we carry,
  // not what the directory reported a moment ago.
  if (size > MAX_MEMORY_FILE_BYTES) {
    return {
      ok: false,
      code: 'too_large',
      message: `Memory file is larger than ${MAX_MEMORY_FILE_BYTES} bytes`,
    }
  }
  return { ok: true, content, sha256: sha256Of(content), size, mtime: st.mtimeMs }
}

function buildMemoryFileContent(name: string, description: string, type: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\ntype: ${type}\n---\n${body}`
}

/**
 * Write one memory file atomically.
 *
 * `expectedSha256` is a compare-and-swap token: when the caller opened the
 * file it recorded the hash it saw, and the write is refused if the file has
 * changed since. Without it the caller is asserting it already showed the
 * user the current bytes (a first create, or an explicit "overwrite anyway"),
 * so the write is unconditional. A refused write touches nothing — the
 * temporary file is only created after the conflict check passes.
 */
export function writeMemoryFile(
  filePath: string,
  content: unknown,
  expectedSha256?: string,
): MemoryWriteResult {
  if (typeof content !== 'string') {
    return { ok: false, code: 'invalid_content', message: 'Memory content must be a string' }
  }

  let safe: string
  try {
    safe = resolveMemoryPath(filePath)
  } catch (err) {
    return { ok: false, code: 'outside_roots', message: errorMessage(err) }
  }

  const size = Buffer.byteLength(content, 'utf-8')
  if (size > MAX_MEMORY_FILE_BYTES) {
    return {
      ok: false,
      code: 'too_large',
      message: `Memory file is larger than ${MAX_MEMORY_FILE_BYTES} bytes`,
    }
  }

  if (typeof expectedSha256 === 'string') {
    let currentSha: string | undefined
    let currentMtime: number | undefined
    let found = false
    try {
      const st = fs.statSync(safe)
      if (st.isFile()) {
        found = true
        currentMtime = st.mtimeMs
        currentSha = sha256Of(fs.readFileSync(safe, 'utf-8'))
      }
    } catch (err) {
      if (!isMissingError(err)) {
        return { ok: false, code: 'write_failed', message: errorMessage(err) }
      }
    }
    // A file that vanished since it was opened is also a conflict: blindly
    // recreating it would undo whatever removed or moved it.
    if (!found || currentSha !== expectedSha256) {
      return {
        ok: false,
        code: 'changed_on_disk',
        message: 'Memory file changed on disk since it was opened',
        sha256: currentSha,
        mtime: currentMtime,
      }
    }
  }

  const dir = path.dirname(safe)
  const tmp = safe + '.tmp.' + Date.now()
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(tmp, content, 'utf-8')
    fs.renameSync(tmp, safe)
  } catch (err) {
    // A failure between write and rename must not leave a stray `.tmp` file
    // that looks like memory to a later directory scan.
    try { fs.unlinkSync(tmp) } catch { /* already gone or never created */ }
    return { ok: false, code: 'write_failed', message: errorMessage(err) }
  }
  invalidateMemoryCache(safe)
  log.info('writeMemoryFile:', safe)

  let mtime = 0
  try { mtime = fs.statSync(safe).mtimeMs } catch { /* the write succeeded; mtime is optional */ }
  return { ok: true, sha256: sha256Of(content), size, mtime }
}

/**
 * Create a new memory file and never overwrite an existing one.
 *
 * The old version wrote straight over a same-slug file, which made two
 * different memories with one sanitized name silently become one. Here the
 * collision is reported with the path and display name of the file in the
 * way, and the caller offers to open it instead.
 */
export function createMemoryFile(
  name: string,
  description: string,
  type: string,
  body: string,
  scope: 'global' | 'project',
  projectHash?: string,
): MemoryCreateResult {
  let dir: string
  if (scope === 'global') {
    dir = getGlobalMemoryDir()
  } else if (projectHash && isValidProjectHash(projectHash)) {
    dir = path.join(getClaudeDir(), 'projects', projectHash, 'memory')
  } else {
    // A project-scoped create without a usable project is refused rather than
    // redirected: writing it to global would be a different file than asked for.
    return { ok: false, code: 'outside_roots', message: 'Invalid project scope for a new memory file' }
  }

  // Sanitize name to filename
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50)
  if (!slug) {
    return { ok: false, code: 'invalid_name', message: 'A memory file needs a name' }
  }

  const filePath = path.join(dir, `${slug}.md`)
  if (fs.existsSync(filePath)) {
    let existingName = path.basename(filePath, '.md')
    const parsed = parseMemoryFileDetailed(filePath, scope, projectHash)
    if (parsed.memory?.name) existingName = parsed.memory.name
    return {
      ok: false,
      code: 'memory_exists',
      message: `A memory file named "${existingName}" already exists`,
      filePath,
      name: existingName,
    }
  }

  // Create the project's memory directory before the write's path gate runs:
  // the gate resolves roots from existing directories, and a brand-new project
  // would otherwise reject the file it is about to create.
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const content = buildMemoryFileContent(name, description, type, body)
  const written = writeMemoryFile(filePath, content)
  if (!written.ok) {
    const code: MemoryCreateCode =
      written.code === 'too_large' ? 'too_large'
      : written.code === 'invalid_content' ? 'invalid_content'
      : written.code === 'outside_roots' ? 'outside_roots'
      : 'write_failed'
    return { ok: false, code, message: written.message }
  }
  return { ok: true, filePath }
}

export function deleteMemoryFile(filePath: string): void {
  // Safety: only allow deletion of memory files in the known memory roots.
  const safe = resolveMemoryPath(filePath)
  fs.unlinkSync(safe)
  invalidateMemoryCache(safe)
  log.info('deleteMemoryFile:', safe)
}

/**
 * Whether `deleteMemoryFile` would accept this path, without touching disk.
 *
 * The per-turn receipt names its sources and offers to forget file-backed
 * ones; it must advertise exactly the paths the delete channel will honour.
 * Sharing `resolveMemoryPath` keeps the two answers from drifting — a path
 * outside `~/.claude/memory` or `~/.claude/projects/<hash>/memory` is refused
 * here for the same reason it is refused there.
 */
export function isMemoryFilePath(filePath: string): boolean {
  try {
    resolveMemoryPath(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Resolve a file written by the background consolidation pass.
 *
 * The normal memory writer resolves roots by listing existing project
 * directories. A consolidation may be the first thing to create
 * `<projects>/<slug>/memory/`, so that check would reject its own new file.
 * This validates the shape instead: one project segment, a `memory` segment,
 * and a `dream-*.md` filename. No renderer path ever reaches it — the pass is
 * addressed by its record id.
 */
function resolveConsolidatedPath(filePath: string): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Invalid consolidation file path')
  }
  const projectsRoot = path.join(getClaudeDir(), 'projects')
  const resolved = path.resolve(filePath)
  const relative = path.relative(projectsRoot, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Consolidation file must live under the projects directory')
  }
  const parts = relative.split(path.sep)
  if (
    parts.length !== 3 ||
    !isValidProjectHash(parts[0]) ||
    parts[1] !== 'memory' ||
    !parts[2].startsWith('dream-') ||
    !parts[2].endsWith('.md')
  ) {
    throw new Error('Invalid consolidation file path')
  }
  return resolved
}

/**
 * Create a consolidation file. `wx` makes the write append-only in practice:
 * an existing pass file is never edited by a later pass, so deleting a file
 * removes exactly one consolidation.
 */
export function writeConsolidatedMemoryFile(filePath: string, content: string): void {
  const safe = resolveConsolidatedPath(filePath)
  fs.mkdirSync(path.dirname(safe), { recursive: true })
  fs.writeFileSync(safe, content, { encoding: 'utf-8', flag: 'wx' })
  invalidateMemoryCache(safe)
  log.info('writeConsolidatedMemoryFile:', safe)
}

export function deleteConsolidatedMemoryFile(filePath: string): void {
  const safe = resolveConsolidatedPath(filePath)
  if (fs.existsSync(safe)) fs.unlinkSync(safe)
  invalidateMemoryCache(safe)
  log.info('deleteConsolidatedMemoryFile:', safe)
}
