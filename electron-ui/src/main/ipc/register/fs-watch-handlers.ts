import { app } from 'electron'
import { createLogger } from '../../utils/logger'
import { getPref } from '../../config/config-manager'
import { safePath, getAllowedFsRoots } from '../../utils/validate'
import {
  createDirectoryWatchService,
  type DirectoryWatchService,
} from '../../fs/watch-service'
import { safeHandle } from './safe-handle'
import type { SendFn } from './types'

const log = createLogger('ipc')

// ----------------------------------------
// File-browser directory watching
// ----------------------------------------
//
// The renderer names exactly the directories its tree is showing. Watching the
// whole workspace recursively would cost a handle per subtree and wake the app
// for changes nobody can see. Each mounted FileBrowser is an owner of its own
// subscription, so two browsers in one window share a directory's watcher
// instead of clearing each other's set.
let fsWatchService: DirectoryWatchService | null = null

export function registerFsWatchHandlers(send: SendFn): void {
  if (fsWatchService) return
  const service = createDirectoryWatchService({
    onChange: (change) => send('fs:changed', { changes: [change] }),
    // A watch can die after it was reported as running (folder deleted, OS
    // handle revoked). Say so on the same push channel rather than leaving the
    // renderer's "watching" badge claiming something untrue.
    onStateChange: (state) => send('fs:changed', { changes: [], state }),
  })
  fsWatchService = service

  const watchedSenders = new Set<number>()

  safeHandle('fs:watchDirectories', (event, args?: { directories?: unknown; subscriberId?: unknown }) => {
    const requested = Array.isArray(args?.directories) ? args.directories.slice(0, 256) : []
    // A renderer-chosen suffix, not an identity: the sender id is prepended
    // below so one window cannot address another window's subscription.
    const subscriber = typeof args?.subscriberId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(args.subscriberId)
      ? args.subscriberId
      : 'default'

    const workingDir = getPref('workingDir')
    const allowedRoots = getAllowedFsRoots(workingDir)
    const accepted: string[] = []
    const rejected: Array<{ directory: string; error: string }> = []
    if (Array.isArray(args?.directories) && args.directories.length > requested.length) {
      // Refuse to hide the overflow: the badge must not claim the whole tree
      // is live when only its first 256 folders are watched.
      rejected.push({ directory: '', error: 'too_many_directories' })
    }
    for (const candidate of requested) {
      if (typeof candidate !== 'string' || !candidate.trim()) {
        rejected.push({ directory: '', error: 'invalid_path' })
        continue
      }
      try {
        // Same root confinement as every other fs:* handler.
        accepted.push(safePath(candidate, allowedRoots))
      } catch (err) {
        log.debug('fs:watchDirectories rejected path:', String(err))
        rejected.push({ directory: candidate, error: 'not_allowed' })
      }
    }

    const senderId = event.sender.id
    if (!watchedSenders.has(senderId)) {
      watchedSenders.add(senderId)
      // A closed window owns no subscription; its watchers must not outlive it.
      event.sender.once('destroyed', () => {
        watchedSenders.delete(senderId)
        service.releaseOwnerPrefix(`${senderId}:`)
      })
    }

    const state = service.setDirectories(`${senderId}:${subscriber}`, accepted)
    return rejected.length > 0
      ? { ...state, failed: [...state.failed, ...rejected] }
      : state
  })

  // Quitting is the last teardown boundary: no watcher or debounce timer may
  // survive the app.
  app.once('before-quit', () => {
    service.dispose()
    fsWatchService = null
  })
}
