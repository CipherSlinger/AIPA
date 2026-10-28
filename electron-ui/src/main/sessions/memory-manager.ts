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
}
const fileCache = new Map<string, CachedFile>()

interface CachedDir {
  mtimeMs: number
  mdFiles: string[]
}
const dirCache = new Map<string, CachedDir>()

let projectsCache: { mtimeMs: number; hashes: string[] } | null = null

function statDirectory(dir: string): fs.Stats | null {
  try {
    const st = fs.statSync(dir)
    return st.isDirectory() ? st : null
  } catch {
    return null
  }
}

/** Markdown filenames in `dir`; reused verbatim while the directory mtime holds. */
function listMarkdownFiles(dir: string, st: fs.Stats): string[] {
  const cached = dirCache.get(dir)
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.mdFiles
  try {
    const mdFiles = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
    dirCache.set(dir, { mtimeMs: st.mtimeMs, mdFiles })
    return mdFiles
  } catch {
    dirCache.delete(dir)
    return []
  }
}

function parseMemoryFile(
  filePath: string,
  scope: 'global' | 'project',
  projectHash?: string,
  st?: fs.Stats,
): MemoryFile | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)

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
    return { filePath, name, description, type, content, scope, projectHash, mtime }
  } catch {
    return null
  }
}

/**
 * Parse one file, reusing the previous parse while (mtime, size) is unchanged.
 * A stat is still required to notice an edit; the expensive read/parse is not.
 */
function parseMemoryFileCached(
  filePath: string,
  scope: 'global' | 'project',
  projectHash?: string,
): MemoryFile | null {
  let st: fs.Stats
  try {
    st = fs.statSync(filePath)
  } catch {
    fileCache.delete(filePath)
    return null
  }
  const cached = fileCache.get(filePath)
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    return cached.memory
  }
  const memory = parseMemoryFile(filePath, scope, projectHash, st)
  fileCache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, memory })
  return memory
}

/** List global memory files from ~/.claude/memory/ */
function listGlobalMemories(): MemoryFile[] {
  const memDir = getGlobalMemoryDir()
  const st = statDirectory(memDir)
  if (!st) return []
  const results: MemoryFile[] = []
  for (const f of listMarkdownFiles(memDir, st)) {
    const m = parseMemoryFileCached(path.join(memDir, f), 'global')
    if (m) results.push(m)
  }
  return results
}

/** Project hashes under ~/.claude/projects, reused while that directory is unchanged. */
function readProjectHashes(): string[] {
  const projectsDir = path.join(getClaudeDir(), 'projects')
  const st = statDirectory(projectsDir)
  if (!st) {
    projectsCache = null
    return []
  }
  if (projectsCache && projectsCache.mtimeMs === st.mtimeMs) return projectsCache.hashes
  try {
    const hashes = fs.readdirSync(projectsDir).filter(isValidProjectHash)
    projectsCache = { mtimeMs: st.mtimeMs, hashes }
    return hashes
  } catch {
    return []
  }
}

/** List project-scoped memory files */
function listProjectMemories(): MemoryFile[] {
  const projectsDir = path.join(getClaudeDir(), 'projects')
  const results: MemoryFile[] = []
  for (const hash of readProjectHashes()) {
    const memDir = path.join(projectsDir, hash, 'memory')
    const st = statDirectory(memDir)
    if (!st) continue
    for (const f of listMarkdownFiles(memDir, st)) {
      const m = parseMemoryFileCached(path.join(memDir, f), 'project', hash)
      if (m) results.push(m)
    }
  }
  return results
}

/** Drop cached filesystem state after this module writes; safe to over-clear. */
function invalidateMemoryCache(filePath?: string): void {
  if (filePath) fileCache.delete(path.resolve(filePath))
  dirCache.clear()
  projectsCache = null
}

export function listMemoryFiles(scope?: 'global' | 'project' | 'all'): MemoryFile[] {
  if (scope === 'global') return listGlobalMemories()
  if (scope === 'project') return listProjectMemories()
  return [...listGlobalMemories(), ...listProjectMemories()]
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
