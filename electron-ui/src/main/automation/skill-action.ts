/**
 * The disk side of a skill-backed job.
 *
 * A job stores a `{ source, dir }` identity (see `AutomationSkillRef`); this
 * module turns it into a file *today*, at run time. Roots are recomputed on
 * every call rather than persisted, which is what lets the project folder be
 * renamed without stranding a schedule — and it is also the reason the root is
 * revalidated here instead of trusted from the job.
 *
 * The root list is shared with `skills:list`/`skills:read` so the picker cannot
 * offer a skill the scheduler would refuse to resolve, or vice versa.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getPref } from '../config/config-manager'
import { parseSkillMd, type ParsedSkillMd } from '../skills/skillMd'
import { createLogger } from '../utils/logger'
import { getAllowedFsRoots, isPathInside, safePath } from '../utils/validate'
import {
  buildSkillPromptBlock,
  SKILL_NAME_MAX_CHARS,
  type SkillPromptBlock,
} from './skill-ref'
import type { AutomationSkillDigest, AutomationSkillRef, AutomationSkillSource } from './types'

const log = createLogger('automation:skill')

/**
 * The most of a SKILL.md this module will read.
 *
 * Far above the prompt ceiling, so the cut always happens at
 * `SKILL_PROMPT_MAX_CHARS` for any real skill — which is what makes the
 * record's "cut at 8000 of N" true — while a rogue or accidental large file
 * cannot be slurped whole into a job at start-up.
 */
export const SKILL_FILE_MAX_BYTES = 512 * 1024

/** Path identity: resolved, and case-folded on Windows where paths are case-insensitive. */
export function canonicalSkillPath(p: string): string {
  const resolved = path.resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * The only directories skills may be read from, personal first.
 *
 * A per-tab cwd may not be persisted yet, so the renderer-supplied workingDir
 * is accepted too — but only after sandboxing it against the allowed FS roots.
 * A rejected directory is skipped with a warning rather than aborting the list,
 * because the persisted preference is still a usable root.
 */
export function resolveSkillRoots(workingDir?: string): string[] {
  const roots = [path.join(os.homedir(), '.claude', 'skills')]
  const dirs = [getPref('workingDir') as string, workingDir]
  for (const dir of dirs) {
    if (!dir || typeof dir !== 'string' || !dir.trim()) continue
    try {
      safePath(dir, getAllowedFsRoots(getPref('workingDir') as string))
    } catch (err) {
      log.warn('skills: rejected unsafe workingDir:', String(err))
      continue
    }
    const root = path.join(dir, '.claude', 'skills')
    // The persisted pref and the renderer's cwd are usually the same directory,
    // so without this the same project root would be scanned twice.
    if (roots.some(r => canonicalSkillPath(r) === canonicalSkillPath(root))) continue
    roots.push(root)
  }
  return roots
}

/** Roots that can hold a skill of this source, in precedence order. */
function resolveSkillRootsFor(source: AutomationSkillSource, workingDir?: string): string[] {
  const roots = resolveSkillRoots(workingDir)
  return source === 'personal' ? roots.slice(0, 1) : roots.slice(1)
}

export interface ResolvedSkill {
  /** The `SKILL.md` the run will read. */
  filePath: string
  /** The root the identity resolved against (already resolved, not canonical-cased). */
  root: string
  /** The directory the `SKILL.md` sits in; the root itself for a root-level skill. */
  dirPath: string
}

/**
 * Resolve an identity against an explicit root list.
 *
 * Split from `resolveSkillFile` so a test can point the resolver at a scratch
 * tree instead of the user's real `~/.claude/skills`. Both the directory and the
 * file are checked against the root after `path.resolve`, and only a regular
 * file counts: a directory named `SKILL.md`, or a symlink leading out of the
 * root, is not an installed skill.
 */
export function resolveSkillInRoots(
  ref: AutomationSkillRef,
  roots: string[],
): ResolvedSkill | null {
  for (const root of roots) {
    const resolvedRoot = path.resolve(root)
    const dirPath = ref.dir ? path.join(resolvedRoot, ref.dir) : resolvedRoot
    const resolvedDir = path.resolve(dirPath)
    if (resolvedDir !== resolvedRoot && !isPathInside(resolvedRoot, resolvedDir)) continue
    const filePath = path.join(resolvedDir, 'SKILL.md')
    try {
      if (!fs.statSync(filePath).isFile()) continue
    } catch {
      continue
    }
    return { filePath, root: resolvedRoot, dirPath: resolvedDir }
  }
  return null
}

/** Resolve an identity against the roots that exist right now. */
export function resolveSkillFile(
  ref: AutomationSkillRef,
  workingDir?: string,
): ResolvedSkill | null {
  try {
    return resolveSkillInRoots(ref, resolveSkillRootsFor(ref.source, workingDir))
  } catch (err) {
    log.warn('Could not resolve a skill root:', String(err))
    return null
  }
}

/** Whether the skill a job names still exists. Save-time check; never throws. */
export function skillExists(ref: AutomationSkillRef, workingDir?: string): boolean {
  return resolveSkillFile(ref, workingDir) !== null
}

/** Read at most `maxBytes` from the head of a file without following a directory. */
function readBounded(filePath: string, maxBytes: number): string {
  const fd = fs.openSync(filePath, 'r')
  try {
    const size = Math.min(fs.fstatSync(fd).size, maxBytes)
    const buffer = Buffer.alloc(size)
    let read = 0
    while (read < size) {
      const chunk = fs.readSync(fd, buffer, read, size - read, read)
      if (chunk <= 0) break
      read += chunk
    }
    // A cut in the middle of a multi-byte character becomes U+FFFD. That is
    // only reachable for a file far past the prompt ceiling, where the body is
    // about to be cut again at 8,000 characters anyway.
    return buffer.subarray(0, read).toString('utf-8')
  } finally {
    fs.closeSync(fd)
  }
}

export type SkillPromptRead =
  | { ok: true; prompt: string; block: SkillPromptBlock; digest: AutomationSkillDigest }
  | { ok: false; error: 'skill_missing' | 'skill_unreadable' }

/**
 * Read the skill a run names and build its prompt.
 *
 * The caller (the scheduler) treats `skill_missing` the way it treats a
 * deleted workflow: disable the job and record why. `skill_unreadable` is kept
 * separate on purpose — a permissions error or a locked file is not "you
 * deleted it", and telling the user to reinstall a skill that is still there
 * would be a lie.
 */
export function readSkillPrompt(
  ref: AutomationSkillRef,
  workingDir?: string,
): SkillPromptRead {
  const resolved = resolveSkillFile(ref, workingDir)
  if (!resolved) return { ok: false, error: 'skill_missing' }
  return readSkillPromptAt(resolved, ref)
}

/**
 * Read a skill that has already been resolved.
 *
 * Split out so a caller that resolved against an explicit root list (a test, or
 * a future surface that reads a different root set) cannot accidentally be sent
 * back through the real home directory. The identity still decides `source` and
 * `dir` on the receipt, because that is what the job stored.
 */
export function readSkillPromptAt(
  resolved: ResolvedSkill,
  ref: AutomationSkillRef,
): SkillPromptRead {
  let parsed: ParsedSkillMd
  try {
    parsed = parseSkillMd(readBounded(resolved.filePath, SKILL_FILE_MAX_BYTES))
  } catch (err) {
    log.warn(`Could not read SKILL.md at ${resolved.filePath}:`, String(err))
    return { ok: false, error: 'skill_unreadable' }
  }
  const block = buildSkillPromptBlock(parsed.body)
  const name = (parsed.name || '').trim().slice(0, SKILL_NAME_MAX_CHARS)
  return {
    ok: true,
    prompt: block.text,
    block,
    digest: {
      source: ref.source,
      dir: ref.dir,
      ...(name ? { name } : {}),
      chars: block.chars,
      sourceChars: block.sourceChars,
      truncated: block.truncated,
    },
  }
}
