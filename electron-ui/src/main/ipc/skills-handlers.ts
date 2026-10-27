import { ipcMain } from 'electron'
import { createLogger } from '../utils/logger'
import { getPref } from '../config/config-manager'
import { getAllowedFsRoots, isPathInside, safePath } from '../utils/validate'
import fs from 'fs'
import path from 'path'
import os from 'os'

const log = createLogger('ipc:skills')

interface SkillInfo {
  name: string
  description: string
  source: 'personal' | 'project'
  dirPath: string
  fileName: string
}

function parseSkillMd(content: string): { name?: string; description?: string; body: string } {
  // Parse YAML frontmatter from SKILL.md
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!fmMatch) {
    const firstLine = content.split('\n').find(l => l.trim()) || ''
    return { body: content, description: firstLine.replace(/^#+\s*/, '').slice(0, 120) }
  }
  const frontmatter = fmMatch[1]
  const body = fmMatch[2]
  let name: string | undefined
  let description: string | undefined
  for (const line of frontmatter.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)/)
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '')
    const descMatch = line.match(/^description:\s*(.+)/)
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '')
  }
  if (!description) {
    const firstLine = body.split('\n').find(l => l.trim()) || ''
    description = firstLine.replace(/^#+\s*/, '').slice(0, 120)
  }
  return { name, description, body }
}

function scanSkillsDir(dir: string, source: 'personal' | 'project'): SkillInfo[] {
  const skills: SkillInfo[] = []
  if (!fs.existsSync(dir)) return skills
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Look for SKILL.md inside directory
        const skillPath = path.join(dir, entry.name, 'SKILL.md')
        if (fs.existsSync(skillPath)) {
          try {
            const content = fs.readFileSync(skillPath, 'utf-8')
            const parsed = parseSkillMd(content)
            skills.push({
              name: parsed.name || entry.name,
              description: parsed.description || '',
              source,
              dirPath: path.join(dir, entry.name),
              fileName: entry.name,
            })
          } catch {
            // Skip unreadable files
          }
        }
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        // Top-level SKILL.md
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8')
          const parsed = parseSkillMd(content)
          skills.push({
            name: parsed.name || path.basename(dir),
            description: parsed.description || '',
            source,
            dirPath: dir,
            fileName: entry.name,
          })
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch (err) {
    log.debug('scanSkillsDir error:', String(err))
  }
  return skills
}

/**
 * The only directories skills may be read from / deleted out of.
 * A per-tab cwd may not be persisted yet, so the renderer-supplied workingDir
 * is accepted too — but only after sandboxing it against the allowed FS roots.
 */
function getSkillsRoots(workingDir?: string): string[] {
  const roots = [path.join(os.homedir(), '.claude', 'skills')]
  const dirs = [getPref('workingDir') as string, workingDir]
  for (const dir of dirs) {
    if (!dir || !dir.trim()) continue
    try {
      safePath(dir, getAllowedFsRoots(getPref('workingDir') as string))
      roots.push(path.join(dir, '.claude', 'skills'))
    } catch (err) {
      log.warn('skills: rejected unsafe workingDir:', String(err))
    }
  }
  return roots
}

export function registerSkillsHandlers(): void {
  ipcMain.handle('skills:list', (_e, workingDir?: string) => {
    // getSkillsRoots drops any workingDir outside the allowed FS roots.
    const roots = getSkillsRoots(workingDir)
    const skills: SkillInfo[] = [
      ...scanSkillsDir(roots[0], 'personal'),
      ...roots.slice(1).flatMap(d => scanSkillsDir(d, 'project')),
    ]
    return skills
  })

  ipcMain.handle('skills:read', (_e, dirPath: string) => {
    try {
      // Restrict reads to a skills root: either the skill directory itself
      // (dirPath/SKILL.md) or a top-level SKILL.md file inside the root.
      const resolved = path.resolve(dirPath)
      const roots = getSkillsRoots()
      const atRoot = roots.some(root => path.resolve(root) === resolved)
      if (!atRoot && !roots.some(root => isPathInside(root, resolved))) {
        return { error: 'Path outside skills directories is not allowed' }
      }
      if (path.basename(resolved) === 'SKILL.md') {
        return { content: fs.readFileSync(resolved, 'utf-8') }
      }
      const skillPath = path.join(resolved, 'SKILL.md')
      if (!fs.existsSync(skillPath)) return { error: 'SKILL.md not found' }
      return { content: fs.readFileSync(skillPath, 'utf-8') }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('skills:install', (_e, { name, content }: { name: string; content: string }) => {
    try {
      // Sanitize name for filesystem use
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
      const skillDir = path.join(os.homedir(), '.claude', 'skills', safeName)
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
      return { success: true, dirPath: skillDir }
    } catch (err) {
      log.warn('skills:install error:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('skills:delete', (_e, dirPath: string) => {
    try {
      // Only allow deleting a child of the personal skills directory — never
      // the directory itself, and never a sibling like ~/.claude/skills-evil.
      const personalDir = path.join(os.homedir(), '.claude', 'skills')
      const resolved = path.resolve(dirPath)
      if (!isPathInside(personalDir, resolved)) {
        return { error: 'Can only delete personal skills' }
      }
      if (fs.existsSync(resolved)) {
        fs.rmSync(resolved, { recursive: true, force: true })
      }
      return { success: true }
    } catch (err) {
      log.warn('skills:delete error:', String(err))
      return { error: String(err) }
    }
  })
}
