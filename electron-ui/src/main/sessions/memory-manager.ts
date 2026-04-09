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

const log = createLogger('memory-manager')

export interface MemoryFile {
  filePath: string
  name: string
  description: string
  type: 'user' | 'feedback' | 'project' | 'reference' | 'unknown'
  content: string
  scope: 'global' | 'project'
  projectHash?: string
}

function getClaudeDir(): string {
  return path.join(os.homedir(), '.claude')
}

function getGlobalMemoryDir(): string {
  return path.join(getClaudeDir(), 'memory')
}

function parseMemoryFile(filePath: string, scope: 'global' | 'project', projectHash?: string): MemoryFile | null {
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

    return { filePath, name, description, type, content, scope, projectHash }
  } catch {
    return null
  }
}

/** List global memory files from ~/.claude/memory/ */
function listGlobalMemories(): MemoryFile[] {
  const memDir = getGlobalMemoryDir()
  if (!fs.existsSync(memDir)) return []
  try {
    return fs.readdirSync(memDir)
      .filter(f => f.endsWith('.md'))
      .map(f => parseMemoryFile(path.join(memDir, f), 'global'))
      .filter((m): m is MemoryFile => m !== null)
  } catch {
    return []
  }
}

/** List project-scoped memory files */
function listProjectMemories(): MemoryFile[] {
  const projectsDir = path.join(getClaudeDir(), 'projects')
  if (!fs.existsSync(projectsDir)) return []
  const results: MemoryFile[] = []
  try {
    for (const hash of fs.readdirSync(projectsDir)) {
      const memDir = path.join(projectsDir, hash, 'memory')
      if (!fs.existsSync(memDir)) continue
      for (const f of fs.readdirSync(memDir)) {
        if (!f.endsWith('.md')) continue
        const m = parseMemoryFile(path.join(memDir, f), 'project', hash)
        if (m) results.push(m)
      }
    }
  } catch {
    // ignore
  }
  return results
}

export function listMemoryFiles(scope?: 'global' | 'project' | 'all'): MemoryFile[] {
  if (scope === 'global') return listGlobalMemories()
  if (scope === 'project') return listProjectMemories()
  return [...listGlobalMemories(), ...listProjectMemories()]
}

export function readMemoryFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

function buildMemoryFileContent(name: string, description: string, type: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\ntype: ${type}\n---\n${body}`
}

export function writeMemoryFile(
  filePath: string,
  content: string,
): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = filePath + '.tmp.' + Date.now()
  fs.writeFileSync(tmp, content, 'utf-8')
  fs.renameSync(tmp, filePath)
  log.info('writeMemoryFile:', filePath)
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
  } else if (projectHash) {
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
  // Safety: only allow deletion within ~/.claude/
  const claudeDir = getClaudeDir()
  if (!path.resolve(filePath).startsWith(path.resolve(claudeDir))) {
    throw new Error('Path outside ~/.claude/ is not allowed')
  }
  fs.unlinkSync(filePath)
  log.info('deleteMemoryFile:', filePath)
}
