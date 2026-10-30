import { BrowserWindow, app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import { getPref, getRawPref, setPref } from '../config/config-manager'
import { configureAllowedRoots } from '../utils/allowed-roots'
import { writeConsolidatedMemoryFile, deleteConsolidatedMemoryFile } from '../sessions/memory-manager'
import { createDreamService } from '../memory/dream-service'
import { createDreamTranscriptReader } from '../memory/dream-transcript'
import { setDreamService, getDreamService } from '../memory/dream-runtime'
import { registerDreamHandlers } from './memory-dream-handlers'
import { startAutomationScheduler } from '../automation/scheduler'
import { runAutomation } from '../automation/runner'
import { runInternalTurn } from './register/cli/internal-turns'
import { safeHandle } from './register/safe-handle'
import { registerPtyHandlers } from './register/pty-handlers'
import { registerCliHandlers } from './register/cli/register-cli-handlers'
import { registerSessionCoreHandlers } from './register/session-handlers'
import { registerSessionSearchHandlers } from './register/session-search-handlers'
import { registerAskHistoryHandlers } from './register/ask-history-handlers'
import { registerGeneralizeHandlers } from './register/generalize-handlers'
import { registerSessionAuxiliaryHandlers } from './register/session-auxiliary-handlers'
import { registerConfigHandlers } from './register/config-handlers'
import { registerFsHandlers } from './fs-handlers'
import { registerFsWatchHandlers } from './register/fs-watch-handlers'
import { registerFsStatHandlers } from './register/fs-stat-handlers'
import { registerAttachmentHandlers } from './attachment-handlers'
import { registerShellHandlers } from './register/shell-handlers'
import { registerWindowHandlers } from './window-handlers'
import { registerSkillsHandlers } from './skills-handlers'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import { registerBackupHandlers } from './backup-handlers'
import { registerSpeculationHandlers } from './register/speculation-handlers'
import { registerClawdHandlers } from './register/clawd-handlers'
import { registerRecruitHandlers } from './register/recruit-handlers'
import { registerNavPluginHandlers } from './register/nav-plugin-handlers'
import { registerAutomationHandlers } from './automation-handlers'
import { registerTaskHandlers } from './task-handlers'

export { INTERNAL_BRIDGE_PREFIX } from './register/cli/send-message'

const log = createLogger('ipc')

// Guard against double-registration (e.g., when createWindow is called
// from app.on('activate') on macOS). Registering a handler twice on the
// same channel crashes Electron with "Attempted to register a second handler".
let handlersRegistered = false

/**
 * The window push events should go to. It is a module-level reference rather
 * than a captured argument because `createWindow` runs again after the first
 * window is destroyed (macOS activate, tray "show"), and handlers registered
 * once must keep working against the new one.
 */
let liveWindow: BrowserWindow | null = null

export function registerAllHandlers(
  win: BrowserWindow,
  options: { onAutomationsChanged?: () => void; onTasksChanged?: () => void } = {},
): void {
  liveWindow = win
  if (handlersRegistered) {
    log.info('IPC handlers already registered, updating window reference only')
    // `send` and the scheduler read `liveWindow`, so a recreated window is
    // picked up without re-registering every handler.
    return
  }
  handlersRegistered = true

  // The folders the user granted in earlier sessions become roots before any
  // handler can consult the gate. Persisting back through the prefs store keeps
  // the grant and its list in one file: the security list is part of what the
  // app prefers, and a second store would be a second thing to back up.
  try {
    configureAllowedRoots(getPref('allowedFolders'), folders => setPref('allowedFolders', folders))
  } catch (err) {
    // A failed read must not take the app down; it starts with no grants, which
    // means refusals rather than access, the safe direction.
    log.warn('allowed-roots: could not load grants:', String(err))
  }

  const send = (channel: string, ...args: unknown[]) => {
    const target = liveWindow
    if (target && !target.isDestroyed()) target.webContents.send(channel, ...args)
    // The scheduler has a single "something changed" signal, and the menus need
    // it too: they exist while the window is hidden in the tray, where the
    // renderer (and this broadcast) is not what the user is looking at. A
    // listener that throws must not break the renderer notification above.
    if (channel === 'automation:changed') {
      try { options.onAutomationsChanged?.() } catch { /* menu refresh is best-effort */ }
    }
    // The pet's needs-you badge exists while the main window is hidden, so the
    // renderer broadcast above is not enough: the badge needs the count too.
    if (channel === 'tasks:changed') {
      try { options.onTasksChanged?.() } catch { /* badge refresh is best-effort */ }
    }
  }

  try {
    // IPC readiness ping -- renderer can verify IPC is working
    safeHandle('ipc:ping', () => ({ ok: true, timestamp: Date.now() }))

    registerPtyHandlers(win, send)
    registerCliHandlers(send)
    registerSessionCoreHandlers()
    registerSessionSearchHandlers()
    registerAskHistoryHandlers()
    registerGeneralizeHandlers()
    registerSessionAuxiliaryHandlers()
    registerConfigHandlers()
    registerFsHandlers()
    registerFsWatchHandlers(send)
    registerFsStatHandlers()
    registerAttachmentHandlers()
    registerShellHandlers(win, send)
    registerWindowHandlers(win)
    registerSkillsHandlers()
    registerDiagnosticsHandlers()
    registerBackupHandlers(send)
    registerSpeculationHandlers()
    registerClawdHandlers()
    registerRecruitHandlers(send)
    registerNavPluginHandlers(win, send)
    registerAutomationHandlers()
    // Tasks own a directory and its materials. Increment 1 is foundation only:
    // nothing here reads or writes a conversation, a department or workingDir.
    registerTaskHandlers(send)

    // Background memory consolidation ("dream"). Created even while the
    // preference is off: the console must be able to show its state and turn
    // it on without restarting the app — `isEnabled` is read on every tick.
    const dream = createDreamService({
      storePath: path.join(app.getPath('userData'), 'memory-dream.json'),
      claudeDir: path.join(os.homedir(), '.claude'),
      writeMemoryFile: writeConsolidatedMemoryFile,
      deleteMemoryFile: deleteConsolidatedMemoryFile,
      isEnabled: () => getPref('dreamConsolidationEnabled') !== false,
      runTurn: async (prompt, options) => {
        // The advisor model is the user's explicit choice for background work;
        // otherwise inherit the chat model. `runInternalTurn` drops a Claude id
        // on the Codex path, so cross-engine ids cannot break the turn.
        const advisor = getRawPref('advisorModel')
        const model = typeof advisor === 'string' && advisor.trim()
          ? advisor.trim()
          : (getPref('model') as string | undefined)
        // A session may have been opened in a directory that no longer exists
        // (deleted worktree); let the engine run in its own default instead of
        // failing the pass on spawn.
        const cwd = options.cwd && fs.existsSync(options.cwd) ? options.cwd : undefined
        const result = await runInternalTurn({
          prompt,
          timeoutMs: options.timeoutMs,
          internalTag: 'dream-consolidate',
          answerOnly: true,
          ...(cwd ? { cwd } : {}),
          ...(model ? { model } : {}),
        })
        return { success: result.success, text: result.text, error: result.error }
      },
      readTranscript: createDreamTranscriptReader(),
      getPersonalMemories: () => {
        const items = getRawPref('memories')
        if (!Array.isArray(items)) return []
        return items
          .map(item => (
            item && typeof item === 'object' && typeof (item as { content?: unknown }).content === 'string'
              ? (item as { content: string }).content
              : ''
          ))
          .filter(text => text.trim().length > 0)
      },
      emitPass: (record) => send('memory:dream:pass', record),
    })
    setDreamService(dream)
    registerDreamHandlers(getDreamService)
    dream.start()

    // Started last: its first tick may run a due job, and every channel it
    // broadcasts on already exists by then. The scheduler resolves the window
    // lazily: it outlives this one and must not hold a destroyed reference.
    startAutomationScheduler(
      () => (liveWindow && !liveWindow.isDestroyed() ? liveWindow : null),
      send,
      runAutomation,
    )
    log.info('All IPC handlers registered successfully')
  } catch (err) {
    log.error('Failed to register some IPC handlers:', String(err))
    // Even on partial failure, continue -- partial handlers are better than none
  }
}
