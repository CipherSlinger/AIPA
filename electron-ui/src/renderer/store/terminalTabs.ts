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
  /** True when node-pty was unavailable and the basic shell ran instead. */
  fallback?: boolean
}

export interface TerminalTabsState {
  tabs: TerminalTab[]
  activeId: string | null
}

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
    exitCode: undefined,
  })
}

export function markTabExited(
  state: TerminalTabsState,
  id: string,
  exitCode: number | null,
): TerminalTabsState {
  return patchTab(state, id, { status: 'exited', exitCode })
}

export function markTabFailed(
  state: TerminalTabsState,
  id: string,
  failure: string,
): TerminalTabsState {
  return patchTab(state, id, {
    status: 'exited',
    exitCode: null,
    failure,
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
