import { ipcMain } from 'electron'
import { createLogger } from '../utils/logger'
import { getPref } from '../config/config-manager'
import { getAllowedFsRoots, isPathInside, safePath } from '../utils/validate'
import { parseSkillMd, type ParsedSkillMd } from '../skills/skillMd'
import fs from 'fs'
import path from 'path'
import os from 'os'

const log = createLogger('ipc:skills')

/**
 * The directory name for an installed skill. This function is the authority:
 * the renderer mirrors it character for character
 * (src/renderer/lib/sessionReuse.ts -> skillInstallSlug) so that the path it
 * previews is the path that gets created.
 *
 * A title written entirely in a non-Latin script sanitizes to nothing usable
 * ("技能" -> "-"), which used to produce a folder of hyphens. A deterministic
 * hash of the original title is stable across the preview and the install, so
 * the two agree even though a readable transliteration is not something we can
 * honestly promise.
 */
export function sanitizeSkillDirName(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  if (/[a-z0-9]/.test(slug)) return slug.slice(0, 48)

  let hash = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `session-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

interface SkillInfo {
  name: string
  description: string
  source: 'personal' | 'project'
  dirPath: string
  fileName: string
  /** Provenance keys are absent for skills installed before wave 64. */
  sourceConversation?: string
  sourceTitle?: string
  createdAt?: string
}

/** Omit the keys entirely when the file has no provenance, so old rows are unchanged. */
function provenanceFields(parsed: ParsedSkillMd): Pick<
  SkillInfo,
  'sourceConversation' | 'sourceTitle' | 'createdAt'
> {
  return {
    ...(parsed.sourceConversation ? { sourceConversation: parsed.sourceConversation } : {}),
    ...(parsed.sourceTitle ? { sourceTitle: parsed.sourceTitle } : {}),
    ...(parsed.createdAt ? { createdAt: parsed.createdAt } : {}),
  }
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
              ...provenanceFields(parsed),
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
            ...provenanceFields(parsed),
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

/** Path identity: resolved, and case-folded on Windows where paths are case-insensitive. */
function canonicalPath(p: string): string {
  const resolved = path.resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
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
    } catch (err) {
      log.warn('skills: rejected unsafe workingDir:', String(err))
      continue
    }
    const root = path.join(dir, '.claude', 'skills')
    // The persisted pref and the renderer's cwd are usually the same directory,
    // so without this the same project root would be scanned twice.
    if (roots.some(r => canonicalPath(r) === canonicalPath(root))) continue
    roots.push(root)
  }
  return roots
}

export function registerSkillsHandlers(): void {
  ipcMain.handle('skills:list', (_e, workingDir?: string) => {
    // getSkillsRoots drops any workingDir outside the allowed FS roots.
    const roots = getSkillsRoots(workingDir)
    const scanned: SkillInfo[] = [
      ...scanSkillsDir(roots[0], 'personal'),
      ...roots.slice(1).flatMap(d => scanSkillsDir(d, 'project')),
    ]
    // A project root nested inside another can still surface the same skill
    // directory twice; keep the first hit so the personal label wins.
    const seen = new Set<string>()
    return scanned.filter(s => {
      const key = canonicalPath(s.dirPath)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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
      const safeName = sanitizeSkillDirName(name)
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
