/**
 * CLI Settings Manager
 *
 * Reads and writes ~/.claude/settings.json with safety constraints:
 * - Only allows modification of whitelisted top-level fields (permissions, hooks)
 * - Atomic writes (write to tmp, then rename)
 * - Handles missing files gracefully
 *
 * Created for Iteration 518 (Permissions UI PRD)
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createLogger } from '../utils/logger'

const log = createLogger('cli-settings')

// Only these top-level fields can be modified via the UI
const WRITABLE_FIELDS = new Set(['permissions', 'hooks', 'language', 'cleanupPeriodDays', 'env'])

function getSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

/**
 * Read ~/.claude/settings.json and return its contents as a JSON object.
 * Returns {} if the file does not exist.
 * Throws if the file exists but contains invalid JSON.
 */
export function readCLISettings(): Record<string, unknown> {
  const settingsPath = getSettingsPath()
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('settings.json root must be a JSON object')
    }
    return parsed as Record<string, unknown>
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }
    throw err
  }
}

/**
 * Write a merge patch to ~/.claude/settings.json.
 *
 * Only fields in WRITABLE_FIELDS are applied; all other fields in the patch are
 * silently ignored (with a log warning). Existing fields not in the patch are preserved.
 *
 * Uses atomic write: writes to a .tmp file then renames.
 */
export function writeCLISettings(patch: Record<string, unknown>): void {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    throw new Error('patch must be a JSON object')
  }

  const settingsPath = getSettingsPath()
  const settingsDir = path.dirname(settingsPath)

  // Ensure ~/.claude/ directory exists
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true })
  }

  // Read current contents
  let current: Record<string, unknown> = {}
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      current = parsed as Record<string, unknown>
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`Cannot read existing settings.json: ${(err as Error).message}`)
    }
    // File doesn't exist yet — that's fine, we'll create it
  }

  // Apply only whitelisted fields from the patch
  for (const key of Object.keys(patch)) {
    if (WRITABLE_FIELDS.has(key)) {
      // Empty string or null means "remove the field" (e.g. language = "" → follow system)
      // Empty object means "remove the field" (e.g. env = {} → no env vars configured)
      const val = patch[key]
      if (val === '' || val === null || (typeof val === 'object' && val !== null && !Array.isArray(val) && Object.keys(val).length === 0)) {
        delete current[key]
      } else {
        current[key] = val
      }
    } else {
      log.warn(`writeCLISettings: ignoring protected field "${key}"`)
    }
  }

  // Atomic write: write to tmp file, then rename
  const tmpPath = settingsPath + '.tmp.' + Date.now()
  const json = JSON.stringify(current, null, 2) + '\n'
  fs.writeFileSync(tmpPath, json, 'utf-8')
  fs.renameSync(tmpPath, settingsPath)

  log.info('writeCLISettings: successfully updated', settingsPath)
}
