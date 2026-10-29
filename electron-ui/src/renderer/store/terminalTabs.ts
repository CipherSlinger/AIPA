/**
 * Pure tab transitions for the terminal dock.
 *
 * Kept free of React, DOM and IPC so the harness can drive every transition
 * without rendering xterm. `terminalStore.ts` is a thin Zustand wrapper around
 * these functions; the dock calls the actions and never mutates arrays itself.
 */

export type TerminalStatus = 'starting' | 'running' | 'exited' | 'closed'

export interface TerminalTab {
  /** Stable identity of the tab inside the dock. */
  id: string
  /** Main-process session id; empty until `pty:create` answers. */
  ptyId: string
  /** Unique tab label, e.g. "cmd.exe · AIPA". */
  title: string
  /** Absolute folder the shell was asked to start in. */
  cwd: string
  /** Short shell name reported by main, once known ("cmd.exe", "bash"). */
  shell?: string
  status: TerminalStatus
  exitCode?: number | null
  /** Translated, user-facing failure. Present only when spawning failed. */
  failure?: string
  /**
   * The stable `PTY_*` code behind `failure`, kept beside the sentence rather
   * than parsed out of it. The UI can then tell "this folder is outside the
   * allowed roots" (`PTY_CWD_REJECTED`) apart from "the shell could not start"
   * without reading translated prose that changes with the locale.
   */
  failureCode?: string | null
  /** The folder the failed start was about; the grant dialog is seeded here. */
  failureCwd?: string
  /**
   * Retry generation. `useTerminalSession` keys its one-and-only effect on the
   * tab id plus this number, so a retry tears the dead xterm down and builds
   * exactly one new PTY for it. A tab created fresh starts at 0, which is why
   * an id reused after a close cannot inherit the old tab's retry.
   */
  retryEpoch?: number
  /**
   * True once a shell actually ran in this tab (`markTabRunning`). A tab whose
   * start failed never produced output and never ran a command, so moving it
   * to a newly granted folder costs the user nothing; one that did has a
   * history this app must not silently replace.
   */
  hasOutput?: boolean
  /** True when node-pty was unavailable and the basic shell ran instead. */
  fallback?: boolean
}

export interface TerminalTabsState {
  tabs: TerminalTab[]
  activeId: string | null
}

/**
 * Text handed to a tab whose PTY has not answered yet, keyed by tab id.
 *
 * Tab ids are `terminal-N` and are reused after a close, so every entry is
 * dropped when its tab closes, exits or fails: a command typed for a dead
 * shell must never be handed to a later tab that happens to share the id.
 */
export type TerminalInputQueues = Record<string, string[]>

export const TERMINAL_MIN_HEIGHT = 120
export const TERMINAL_DEFAULT_HEIGHT = 280
/** The dock may never own more than this share of the window. */
export const TERMINAL_MAX_VIEWPORT_RATIO = 0.6

/** Bounded, integer dock height. The viewport height is supplied by the caller. */
export function clampDockHeight(value: unknown, viewportHeight: number): number {
  const viewport = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800
  const max = Math.max(TERMINAL_MIN_HEIGHT, Math.round(viewport * TERMINAL_MAX_VIEWPORT_RATIO))
  const numeric = typeof value === 'number' ? value : Number(value)
  const fallback = Number.isFinite(numeric) ? numeric : TERMINAL_DEFAULT_HEIGHT
  return Math.min(max, Math.max(TERMINAL_MIN_HEIGHT, Math.round(fallback)))
}

/** "C:\Users\me\Desktop\AIPA" -> "…/Desktop/AIPA"; home becomes "~". */
export function shortCwd(cwd: string, homeDir?: string): string {
  if (!cwd) return ''
  let display = cwd
  if (homeDir && homeDir.trim()) {
    const home = homeDir.replace(/[\\/]+$/, '')
    const lower = display.toLowerCase()
    const lowerHome = home.toLowerCase()
    if (lower === lowerHome) {
      display = '~'
    } else if (lower.startsWith(lowerHome + '\\') || lower.startsWith(lowerHome + '/')) {
      display = `~${display.slice(home.length)}`
    }
  }
  if (display === '~') return display
  const parts = display.split(/[\\/]+/).filter(Boolean)
  if (parts.length <= 3) return display
  return `…/${parts.slice(-2).join('/')}`
}

/** Next free numeric tab id; closing a middle tab does not make ids collide. */
export function nextTabOrdinal(tabs: TerminalTab[]): number {
  let max = 0
  for (const tab of tabs) {
    const match = /^terminal-(\d+)$/.exec(tab.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max + 1
}

/**
 * Make a label unique among the live tabs. Two shells opened in the same
 * folder would otherwise share a label, and a close button that names "bash ·
 * AIPA" twice names nothing.
 */
export function uniqueTabTitle(base: string, tabs: TerminalTab[], ownId?: string): string {
  const trimmed = base.trim() || 'Terminal'
  const used = new Set(tabs.filter(tab => tab.id !== ownId).map(tab => tab.title))
  if (!used.has(trimmed)) return trimmed
  let n = 2
  while (used.has(`${trimmed} (${n})`)) n += 1
  return `${trimmed} (${n})`
}

export function addTab(
  state: TerminalTabsState,
  input: { cwd: string; shell?: string; title?: string },
): TerminalTabsState {
  const ordinal = nextTabOrdinal(state.tabs)
  const base = input.title?.trim()
    || (input.shell?.trim()
      ? `${input.shell.trim()} · ${shortCwd(input.cwd)}`
      : `Terminal ${ordinal}`)
  const tab: TerminalTab = {
    id: `terminal-${ordinal}`,
    ptyId: '',
    title: uniqueTabTitle(base, state.tabs),
    cwd: input.cwd,
    ...(input.shell ? { shell: input.shell } : {}),
    status: 'starting',
  }
  return { tabs: [...state.tabs, tab], activeId: tab.id }
}

export function closeTab(state: TerminalTabsState, id: string): TerminalTabsState {
  const index = state.tabs.findIndex(tab => tab.id === id)
  if (index === -1) return state
  const tabs = state.tabs.filter(tab => tab.id !== id)
  let activeId = state.activeId
  if (activeId === id) {
    // Prefer the tab that slid into the closed one's place, then its
    // predecessor. Closing the last tab leaves the dock empty, not closed.
    activeId = tabs.length === 0 ? null : tabs[Math.min(index, tabs.length - 1)].id
  }
  return { tabs, activeId }
}

export function activateTab(state: TerminalTabsState, id: string): TerminalTabsState {
  if (state.activeId === id || !state.tabs.some(tab => tab.id === id)) return state
  return { ...state, activeId: id }
}

/**
 * Close every tab at once.
 *
 * `null` is the empty dock, not a closed one: each tab's unmount is what
 * destroys its PTY, so the caller keeps the dock mounted until the list is
 * empty. Closing an empty dock is the dock's own `open` flag, not this
 * transition.
 */
export function closeAllTabs(state: TerminalTabsState): TerminalTabsState {
  if (state.tabs.length === 0) return state
  return { tabs: [], activeId: null }
}

function patchTab(
  state: TerminalTabsState,
  id: string,
  patch: Partial<TerminalTab>,
): TerminalTabsState {
  let changed = false
  const tabs = state.tabs.map(tab => {
    if (tab.id !== id) return tab
    changed = true
    return { ...tab, ...patch }
  })
  return changed ? { ...state, tabs } : state
}

export function markTabRunning(
  state: TerminalTabsState,
  id: string,
  ptyId: string,
): TerminalTabsState {
  return patchTab(state, id, {
    ptyId,
    status: 'running',
    failure: undefined,
    failureCode: undefined,
    failureCwd: undefined,
    exitCode: undefined,
    // A shell exists now: this tab has a history of its own from here on.
    hasOutput: true,
  })
}

export function markTabExited(
  state: TerminalTabsState,
  id: string,
  exitCode: number | null,
): TerminalTabsState {
  return patchTab(state, id, { status: 'exited', exitCode })
}

/**
 * Record a spawn failure: the translated sentence plus the code and folder it
 * was about. The sentence is what the user reads; the code and folder are what
 * the grant offer is decided on, so neither is ever parsed back out of prose.
 */
export function markTabFailed(
  state: TerminalTabsState,
  id: string,
  failure: string,
  failureCode: string | null = null,
  failureCwd?: string,
): TerminalTabsState {
  return patchTab(state, id, {
    status: 'exited',
    exitCode: null,
    failure,
    failureCode,
    failureCwd: failureCwd && failureCwd.trim() ? failureCwd : undefined,
  })
}

/** A tab's retry generation, normalised: missing or junk means the first try. */
export function retryEpochOf(tab: Pick<TerminalTab, 'retryEpoch'>): number {
  const epoch = tab.retryEpoch
  return typeof epoch === 'number' && Number.isFinite(epoch) && epoch > 0 ? Math.floor(epoch) : 0
}

/**
 * Restart one failed tab in place — optionally in a different folder.
 *
 * The new epoch is the whole safety story: `useTerminalSession` owns exactly
 * one effect per (tab id, epoch), so bumping it destroys the dead xterm and
 * creates exactly one PTY. Nothing else in the app starts a terminal session,
 * which is why a retry cannot produce a duplicate shell or an orphaned widget.
 *
 * Only a tab that failed may be retried. A running shell must never be killed
 * by a click on a record that has since moved on, so any other state is left
 * untouched and the caller can treat that as "nothing happened".
 */
export function beginTabRetry(
  state: TerminalTabsState,
  id: string,
  cwd?: string,
): TerminalTabsState {
  const tab = state.tabs.find(candidate => candidate.id === id)
  if (!tab || !tab.failure) return state
  const nextCwd = typeof cwd === 'string' && cwd.trim() ? cwd : tab.cwd
  return patchTab(state, id, {
    cwd: nextCwd,
    status: 'starting',
    ptyId: '',
    failure: undefined,
    failureCode: undefined,
    failureCwd: undefined,
    exitCode: undefined,
    fallback: undefined,
    retryEpoch: retryEpochOf(tab) + 1,
  })
}

export function markTabFallback(state: TerminalTabsState, id: string): TerminalTabsState {
  return patchTab(state, id, { fallback: true })
}

export function retitleTab(
  state: TerminalTabsState,
  id: string,
  base: string,
): TerminalTabsState {
  const title = uniqueTabTitle(base, state.tabs, id)
  return patchTab(state, id, { title })
}

/** Shell label for a failed spawn that never reported one. */
export function fallbackShellLabel(platform?: string): string {
  return platform === 'win32' ? 'cmd.exe' : 'shell'
}

/** A tab whose PTY exists or is still being created, i.e. can take input. */
export function isLiveTerminalTab(tab: TerminalTab): boolean {
  return tab.status === 'running' || tab.status === 'starting'
}

/** True while closing every tab would kill a shell the user may be using. */
export function shouldConfirmCloseAll(tabs: TerminalTab[]): boolean {
  return tabs.some(isLiveTerminalTab)
}

/** Empty or missing text is not input; callers get the same queue back. */
export function enqueueTerminalInput(
  queues: TerminalInputQueues,
  tabId: string,
  text: string,
): TerminalInputQueues {
  if (!tabId || !text) return queues
  const existing = queues[tabId]
  return { ...queues, [tabId]: existing ? [...existing, text] : [text] }
}

/**
 * Take everything queued for one tab, in enqueue order, and clear that entry.
 *
 * PTY input is a character stream with no line boundary until the user presses
 * Enter, so several commands handed to the same not-yet-ready shell share its
 * one prompt line; a space keeps the result readable. Nothing that would
 * submit the line is appended here — or anywhere else in this path.
 */
export function takeTerminalInput(
  queues: TerminalInputQueues,
  tabId: string,
): { queues: TerminalInputQueues; text: string | null } {
  const entries = queues[tabId]
  if (!entries || entries.length === 0) return { queues, text: null }
  const next = { ...queues }
  delete next[tabId]
  return { queues: next, text: entries.join(' ') }
}

/** Forget one tab's queued input; used on close, exit and spawn failure. */
export function dropTerminalInput(
  queues: TerminalInputQueues,
  tabId: string,
): TerminalInputQueues {
  if (!queues[tabId]) return queues
  const next = { ...queues }
  delete next[tabId]
  return next
}

export function dropAllTerminalInput(queues: TerminalInputQueues): TerminalInputQueues {
  return Object.keys(queues).length === 0 ? queues : {}
}
