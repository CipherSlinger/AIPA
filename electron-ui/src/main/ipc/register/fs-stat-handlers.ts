import { createLogger } from '../../utils/logger'
import { getPref } from '../../config/config-manager'
import { getAllowedFsRoots } from '../../utils/validate'
import { partitionStatPaths, statPaths } from '../../fs/stat-paths'
import { safeHandle } from './safe-handle'

const log = createLogger('ipc')

// ----------------------------------------
// Turn-diff disk checks
// ----------------------------------------
//
// The turn-diff card asks only about files it already shows, and only for a
// cheap size + mtime snapshot. Paths are confined by the same `safePath` rule
// as `fs:watchDirectories`; a rejected path comes back as an error code so the
// card can say "not checked" instead of implying the file is unchanged.
export function registerFsStatHandlers(): void {
  safeHandle('fs:statPaths', async (_e, args?: { paths?: unknown }) => {
    try {
      const requested = Array.isArray(args?.paths) ? args.paths : []
      const workingDir = getPref('workingDir')
      const { allowed, rejected } = partitionStatPaths(requested, getAllowedFsRoots(workingDir))
      const settled = await statPaths(allowed)
      return [...settled, ...rejected]
    } catch (err) {
      // The renderer must interpret an empty answer as "nothing was checked",
      // never as "everything matches".
      log.warn('fs:statPaths error:', String(err))
      return []
    }
  })
}
