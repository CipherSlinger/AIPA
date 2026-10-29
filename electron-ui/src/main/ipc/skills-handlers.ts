import { ipcMain } from 'electron'
import { createLogger } from '../utils/logger'
import { isPathInside } from '../utils/validate'
import { canonicalSkillPath, resolveSkillRoots } from '../automation/skill-action'
import { parseSkillMd, type ParsedSkillMd } from '../skills/skillMd'
import {
  listTrashedSkills,
  moveSkillToTrash,
  purgeTrashedSkills,
  removeTrashedSkill,
  restoreTrashedSkill,
  type SkillTrashFailure,
} from '../trash/skill-trash'
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
  /**
   * The identity a scheduled job stores: one directory segment under the skills
   * root, or `''` for a `SKILL.md` at the root itself. `dirPath`/`fileName`
   * cannot tell those two cases apart — both end in `SKILL.md` — so the picker
   * is handed this rather than being asked to reverse-engineer one.
   */
  skillDir: string
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
              skillDir: entry.name,
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
            // A top-level SKILL.md has no segment of its own; the root is the
            // skill, and the scheduler resolves `''` back to it.
            skillDir: '',
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

/**
 * The only directories skills may be read from / deleted out of.
 *
 * The list itself lives in `automation/skill-action.ts` because the scheduler
 * resolves a job's skill through the same roots: two copies would let the
 * picker offer a skill the runner then refuses, or hide one it would happily
 * run. That module also drops any workingDir outside the allowed FS roots.
 */
const getSkillsRoots = resolveSkillRoots

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
      const key = canonicalSkillPath(s.dirPath)
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

  /**
   * Deleting a skill is no longer permanent: the folder is moved into the
   * trash (see src/main/trash/skill-trash.ts) and can be restored for 30 days.
   * It used to be `rm -rf`'d on the spot, so one misclick destroyed a folder
   * the user may have written by hand. The folder and manifest move together;
   * the containment check (a child of `~/.claude/skills`, never the root) now
   * lives in `moveSkillToTrash` so the trash cannot be used to move arbitrary
   * directories either.
   */
  ipcMain.handle('skills:delete', (_e, dirPath: string) => {
    try {
      const result = moveSkillToTrash(dirPath)
      if (!result.ok) {
        log.warn('skills:delete refused:', result.code, result.error)
        return { success: false, error: result.error, code: result.code }
      }
      return { success: true, entry: result.entry }
    } catch (err) {
      // Resolve, never throw: an IPC rejection reaches the renderer as
      // "Error invoking remote method …", which a user cannot act on.
      log.warn('skills:delete error:', String(err))
      return { success: false, error: String(err), code: 'move_failed' }
    }
  })

  // ── Recently deleted skills ──────────────
  // Every handler resolves with a result object (never throws) and returns the
  // failure reason, so the panel can say why a restore was refused instead of
  // showing a remote-method error or a silent no-op.

  ipcMain.handle('skills:trash:list', () => {
    try {
      return listTrashedSkills()
    } catch (err) {
      log.warn('skills:trash:list error:', String(err))
      return { ok: false, code: 'write_failed', error: String(err) } satisfies SkillTrashFailure
    }
  })

  ipcMain.handle('skills:trash:restore', (_e, id: string) => {
    try {
      if (typeof id !== 'string' || !id.trim()) {
        return { ok: false, code: 'not_found', error: 'No item was given' } satisfies SkillTrashFailure
      }
      const result = restoreTrashedSkill(id)
      if (!result.ok) log.warn('skills:trash:restore refused:', result.code, result.error)
      return result
    } catch (err) {
      log.warn('skills:trash:restore error:', String(err))
      return { ok: false, code: 'move_failed', error: String(err) } satisfies SkillTrashFailure
    }
  })

  ipcMain.handle('skills:trash:purge', () => {
    try {
      return purgeTrashedSkills()
    } catch (err) {
      log.warn('skills:trash:purge error:', String(err))
      return { ok: false, code: 'delete_failed', error: String(err) } satisfies SkillTrashFailure
    }
  })

  ipcMain.handle('skills:trash:remove', (_e, id: string) => {
    try {
      if (typeof id !== 'string' || !id.trim()) {
        return { ok: false, code: 'not_found', error: 'No item was given' } satisfies SkillTrashFailure
      }
      const result = removeTrashedSkill(id)
      if (!result.ok) log.warn('skills:trash:remove refused:', result.code, result.error)
      return result
    } catch (err) {
      log.warn('skills:trash:remove error:', String(err))
      return { ok: false, code: 'delete_failed', error: String(err) } satisfies SkillTrashFailure
    }
  })
}
