import * as fs from 'fs'
import { safePath } from '../utils/validate'

/**
 * Stat-only file checks for the turn-diff card.
 *
 * The card must never claim a file still matches a recorded diff when the
 * check did not actually run. This module therefore returns one explicit
 * result per requested path: either a stat snapshot, a definite "gone", or an
 * error code the renderer maps to `unchecked`. It never reads or writes file
 * contents, and a malformed request degrades per path instead of throwing.
 */

/** Hard ceiling for one IPC call; the renderer caps its own list as well. */
export const MAX_STAT_PATHS = 256

export interface StatPathResult {
  /** The normalized (allowed) or original (rejected) path, so results can be matched. */
  path: string
  exists: boolean
  isFile: boolean
  size: number | null
  mtimeMs: number | null
  /** A stable code (`not_allowed`, `stat_failed`, `EACCES`, …); never contents. */
  error: string | null
}

export type StatPathFn = (filePath: string) => Promise<{
  isFile(): boolean
  size: number
  mtimeMs: number
}>

function failed(path: string, error: string): StatPathResult {
  return { path, exists: false, isFile: false, size: null, mtimeMs: null, error }
}

/**
 * Apply the same containment rule as every other `fs:*` handler.
 *
 * Reusing `safePath` is deliberate: a renderer cannot widen the roots by
 * naming a path, and a rejected path is reported rather than silently dropped.
 * The overflow case is reported too, so the caller never mistakes an
 * unrequested tail of its list for "checked and unchanged".
 */
export function partitionStatPaths(
  candidates: readonly unknown[],
  allowedRoots: readonly string[],
): { allowed: string[]; rejected: StatPathResult[] } {
  const allowed: string[] = []
  const rejected: StatPathResult[] = []
  const requested = candidates.slice(0, MAX_STAT_PATHS)
  if (candidates.length > MAX_STAT_PATHS) rejected.push(failed('', 'too_many_paths'))

  for (const candidate of requested) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      rejected.push(failed('', 'invalid_path'))
      continue
    }
    try {
      allowed.push(safePath(candidate, [...allowedRoots]))
    } catch {
      rejected.push(failed(candidate, 'not_allowed'))
    }
  }
  return { allowed, rejected }
}

/**
 * Stat every already-validated absolute path. A missing file is a definite
 * fact (`exists: false`, no error); every other failure is an error code so
 * the caller can keep the state `unchecked`.
 */
export async function statPaths(
  paths: readonly string[],
  stat: StatPathFn = fs.promises.stat,
): Promise<StatPathResult[]> {
  const requested = paths.slice(0, MAX_STAT_PATHS)
  return Promise.all(requested.map(async (filePath) => {
    try {
      const info = await stat(filePath)
      return {
        path: filePath,
        exists: true,
        isFile: info.isFile(),
        size: typeof info.size === 'number' && Number.isFinite(info.size) ? info.size : null,
        mtimeMs: typeof info.mtimeMs === 'number' && Number.isFinite(info.mtimeMs) ? info.mtimeMs : null,
        error: null,
      }
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code ?? '')
        : ''
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return { path: filePath, exists: false, isFile: false, size: null, mtimeMs: null, error: null }
      }
      return failed(filePath, code || 'stat_failed')
    }
  }))
}
