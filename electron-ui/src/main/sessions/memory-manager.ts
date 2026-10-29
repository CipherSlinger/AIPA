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

export function readMemoryFile(filePath: string): string {
  return fs.readFileSync(resolveMemoryPath(filePath), 'utf-8')
}

function buildMemoryFileContent(name: string, description: string, type: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\ntype: ${type}\n---\n${body}`
}

export function writeMemoryFile(
  filePath: string,
  content: string,
): void {
  const safe = resolveMemoryPath(filePath)
  const dir = path.dirname(safe)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = safe + '.tmp.' + Date.now()
  fs.writeFileSync(tmp, content, 'utf-8')
  fs.renameSync(tmp, safe)
  invalidateMemoryCache(safe)
  log.info('writeMemoryFile:', safe)
}

export function createMemoryFile(
  name: string,
  description: string,
  type: string,
  body: string,
  scope: 'global' | 'project',
  projectHash?: string,
): string {
  let dir: string
  if (scope === 'global') {
    dir = getGlobalMemoryDir()
  } else if (projectHash && isValidProjectHash(projectHash)) {
    dir = path.join(getClaudeDir(), 'projects', projectHash, 'memory')
  } else {
    dir = getGlobalMemoryDir()
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // Sanitize name to filename
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50)
  const filePath = path.join(dir, `${slug}.md`)
  const content = buildMemoryFileContent(name, description, type, body)
  writeMemoryFile(filePath, content)
  return filePath
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
