import { ipcMain } from 'electron'
import { createLogger } from '../utils/logger'
import { isPathInside } from '../utils/validate'
import { canonicalSkillPath, resolveSkillRoots } from '../automation/skill-action'
import { parseSkillMd, sanitizeSkillDirName, type ParsedSkillMd } from '../skills/skillMd'
import {
  decodeSkillBytes,
  installSkill,
  makeSkillFileToken,
  updateSkill,
  type SkillFileToken,
} from '../skills/skillInstall'
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

const log = createLogger('ipc:skills')

/** A token from `skills:read`, validated at the IPC boundary. */
function isSkillFileToken(value: unknown): value is SkillFileToken {
  if (!value || typeof value !== 'object') return false
  const token = value as Record<string, unknown>
  return typeof token.hash === 'string'
    && typeof token.mtimeMs === 'number'
    && typeof token.size === 'number'
}

// Kept as a re-export for callers that import it from this handler. The rule
// itself lives in `skills/skillMd.ts`, which the renderer can import without
// pulling Electron into the browser bundle; the creator page previews its path
// with that same function.
export { sanitizeSkillDirName }

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

  /**
   * Read a SKILL.md and hand back the token the editor sends with the update.
   *
   * The token is a hash of the exact bytes, not a path: `skills:update` resolves
   * the skill by identity again, so a path that moved between the read and the
   * write cannot quietly redirect the save.
   */
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
      const skillPath = path.basename(resolved) === 'SKILL.md'
        ? resolved
        : path.join(resolved, 'SKILL.md')
      if (!fs.existsSync(skillPath)) return { error: 'SKILL.md not found' }
      // The lexical check above does not see through a symlink. The update
      // refuses to write through one, so a read that followed it would fill
      // the editor with a file the save can never touch. Refuse both halves.
      const realFile = fs.realpathSync(skillPath)
      const contained = roots.some(root => {
        try {
          const realRoot = fs.realpathSync(root)
          return realFile === realRoot || isPathInside(realRoot, realFile)
        } catch {
          return false
        }
      })
      if (!contained) return { error: 'Path outside skills directories is not allowed' }
      const bytes = fs.readFileSync(realFile)
      const content = decodeSkillBytes(bytes)
      if (content === null) return { error: 'SKILL.md is not valid UTF-8' }
      const stat = fs.statSync(realFile)
      return { content, token: makeSkillFileToken(bytes, stat.mtimeMs) }
    } catch (err) {
      return { error: String(err) }
    }
  })

  /**
   * The installer refuses to replace an existing SKILL.md unless the caller
   * asks for it explicitly with `replace: true`; the form turns that refusal
   * into "open it" / "replace it" rather than a generic error. A successful
   * write goes through a temp file and a rename (see skills/skillInstall.ts),
   * so a crash cannot leave a half-written skill behind.
   */
  ipcMain.handle('skills:install', (_e, args?: { name?: unknown; content?: unknown; replace?: unknown }) => {
    try {
      const result = installSkill({
        name: typeof args?.name === 'string' ? args.name : '',
        content: typeof args?.content === 'string' ? args.content : '',
        replace: args?.replace === true,
      })
      if (!result.success) log.warn('skills:install refused:', result.code, result.error)
      return result
    } catch (err) {
      // Resolve, never throw: an IPC rejection reaches the renderer as
      // "Error invoking remote method …", which a user cannot act on.
      log.warn('skills:install error:', String(err))
      return { success: false, code: 'write_failed', error: String(err) } as const
    }
  })

  /**
   * Edit an installed SKILL.md in place.
   *
   * The renderer names the skill the way the scheduler does (`{ source, dir }`)
   * and this handler resolves it through the same `resolveSkillRoots`, so the
   * page cannot edit a different file from the one the list showed. The token
   * from `skills:read` is required unless `force` is set; `force` is sent only
   * after the user has been told the file changed underneath them.
   */
  ipcMain.handle('skills:update', (
    _e,
    args?: {
      source?: unknown
      dir?: unknown
      name?: unknown
      description?: unknown
      body?: unknown
      token?: unknown
      force?: unknown
      workingDir?: unknown
    },
  ) => {
    try {
      const source = args?.source
      if (source !== 'personal' && source !== 'project') {
        return {
          success: false as const,
          code: 'invalid_input' as const,
          error: 'A skill update needs a personal or project source',
        }
      }
      // Same roots as `skills:list` and the scheduler: personal first, then
      // every allowed project's `.claude/skills`. A project skill only ever
      // resolves against the project roots.
      const allRoots = getSkillsRoots(
        typeof args?.workingDir === 'string' ? args.workingDir : undefined,
      )
      const roots = source === 'personal' ? allRoots.slice(0, 1) : allRoots.slice(1)
      const token = isSkillFileToken(args?.token) ? args.token : undefined
      const result = updateSkill({
        ref: { source, dir: typeof args?.dir === 'string' ? args.dir : '' },
        roots,
        name: typeof args?.name === 'string' ? args.name : '',
        description: typeof args?.description === 'string' ? args.description : '',
        body: typeof args?.body === 'string' ? args.body : '',
        ...(token ? { token } : {}),
        force: args?.force === true,
      })
      if (!result.success) log.warn('skills:update refused:', result.code, result.error)
      return result
    } catch (err) {
      // Resolve, never throw: an IPC rejection reaches the renderer as
      // "Error invoking remote method …", which a user cannot act on.
      log.warn('skills:update error:', String(err))
      return { success: false as const, code: 'write_failed' as const, error: String(err) }
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
