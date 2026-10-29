import { create } from 'zustand'
import {
  activateTab,
  addTab,
  beginTabRetry,
  closeAllTabs,
  closeTab,
  dropAllTerminalInput,
  dropTerminalInput,
  enqueueTerminalInput,
  isLiveTerminalTab,
  markTabExited,
  markTabFailed,
  markTabFallback,
  markTabRunning,
  retitleTab,
  shouldConfirmCloseAll,
  takeTerminalInput,
  TERMINAL_DEFAULT_HEIGHT,
  TERMINAL_MIN_HEIGHT,
  type TerminalInputQueues,
  type TerminalStatus,
  type TerminalTab,
  type TerminalTabsState,
} from './terminalTabs'

export type { TerminalStatus, TerminalTab }

export type TerminalTypeOutcome =
  | { status: 'typed'; tabId: string; title: string }
  | { status: 'queued'; tabId: string; title: string }
  /** No folder to start a shell in; nothing was queued or written. */
  | { status: 'no-cwd' }

interface TerminalState extends TerminalTabsState {
  /** Whether the dock is mounted. AppShell renders it only while true. */
  open: boolean
  /** Requested dock height in px; the dock clamps it to 120..60% viewport. */
  height: number
  /** Text waiting for a tab's PTY, keyed by tab id. See `terminalTabs.ts`. */
  queuedInput: TerminalInputQueues
  /** True while the dock is asking whether to stop the shells it would close. */
  closeAllPending: boolean
  toggleOpen: () => void
  setOpen: (open: boolean) => void
  setHeight: (height: number) => void
  addTab: (input: { cwd: string; shell?: string; title?: string }) => void
  closeTab: (id: string) => void
  /** Close every tab; each one's unmount destroys its PTY. */
  closeAll: () => void
  activateTab: (id: string) => void
  markRunning: (id: string, ptyId: string) => void
  markExited: (id: string, exitCode: number | null) => void
  markFailed: (id: string, failure: string, failureCode?: string | null, failureCwd?: string) => void
  /**
   * Start one failed tab again, optionally in a newly granted folder. The
   * epoch bump is what makes the tab's session effect build exactly one fresh
   * PTY; this action itself never speaks to the PTY channel.
   */
  retryTab: (id: string, cwd?: string) => void
  markFallback: (id: string) => void
  retitleTab: (id: string, title: string) => void
  resetTabs: () => void
  /**
   * Type `text` into a live shell — never submit it. Opens the dock, reuses a
   * live tab, or creates one in `cwd` when the dock has none. A running PTY is
   * written to now; a starting one queues until `flushQueuedInput`.
   */
  typeIntoTerminal: (input: { cwd: string; text: string }) => TerminalTypeOutcome
  /** Hand a tab's queued text to its now-ready PTY; null when nothing waited. */
  flushQueuedInput: (tabId: string) => string | null
  /**
   * Close all, asking first while a shell is still alive. The question is a
   * store flag so the dock's dialog is the one and only confirmation — the
   * palette routes here too and cannot close a live shell without it.
   */
  requestCloseAll: () => void
  confirmCloseAll: () => void
  cancelCloseAll: () => void
}

const HEIGHT_STORAGE_KEY = 'aipa:terminal-height'

function readSavedHeight(): number {
  if (typeof localStorage === 'undefined') return TERMINAL_DEFAULT_HEIGHT
  try {
    const raw = Number(localStorage.getItem(HEIGHT_STORAGE_KEY))
    if (Number.isFinite(raw) && raw >= TERMINAL_MIN_HEIGHT) return Math.round(raw)
  } catch { /* private mode / disabled storage */ }
  return TERMINAL_DEFAULT_HEIGHT
}

/**
 * Terminal dock state.
 *
 * The transitions themselves live in `terminalTabs.ts` (pure, no React/DOM);
 * this file only persists the height and wraps them in Zustand actions.
 *
 * Hiding the dock keeps its tabs, and therefore its shells, running: a toggle
 * is a view action, not a kill switch, and a build the user started must not
 * die because they wanted the panel out of the way. While the dock is hidden
 * with work in it, the status bar says so and opens it again on click. Only
 * closing a tab (or Close all) destroys a PTY.
 */
export const useTerminalStore = create<TerminalState>((set, get) => ({
  open: false,
  height: readSavedHeight(),
  tabs: [],
  activeId: null,
  queuedInput: {},
  closeAllPending: false,

  toggleOpen: () => set(state => ({ open: !state.open })),
  setOpen: (open) => set({ open }),
  setHeight: (height) => {
    const current = get().height
    const next = Number.isFinite(height)
      ? Math.max(TERMINAL_MIN_HEIGHT, Math.round(height))
      : current
    set({ height: next })
    try { localStorage.setItem(HEIGHT_STORAGE_KEY, String(next)) } catch { /* non-fatal */ }
  },

  addTab: (input) => set(state => addTab(state, input)),
  closeTab: (id) => set(state => {
    const next = closeTab(state, id)
    const queuedInput = dropTerminalInput(state.queuedInput, id)
    if (next === state && queuedInput === state.queuedInput) return state
    // Closing the last tab by hand also dismisses a close-all question that no
    // longer has anything to ask about.
    const closeAllPending = next.tabs.length === 0 ? false : state.closeAllPending
    return { ...next, queuedInput, closeAllPending }
  }),
  closeAll: () => set(state => ({
    ...closeAllTabs(state),
    queuedInput: dropAllTerminalInput(state.queuedInput),
    closeAllPending: false,
  })),
  activateTab: (id) => set(state => activateTab(state, id)),
  markRunning: (id, ptyId) => set(state => markTabRunning(state, id, ptyId)),
  markExited: (id, exitCode) => set(state => ({
    ...markTabExited(state, id, exitCode),
    // The shell is gone; input that never made it in must not outlive it.
    queuedInput: dropTerminalInput(state.queuedInput, id),
  })),
  markFailed: (id, failure, failureCode, failureCwd) => set(state => ({
    ...markTabFailed(state, id, failure, failureCode, failureCwd),
    queuedInput: dropTerminalInput(state.queuedInput, id),
  })),
  retryTab: (id, cwd) => set(state => {
    const next = beginTabRetry(state, id, cwd)
    // Not a failed tab (closed, reused, or somehow alive): nothing to restart.
    if (next === state) return state
    return {
      ...next,
      // Keystrokes typed at the dead prompt belong to the shell that never
      // existed; the replacement must not receive them as commands.
      queuedInput: dropTerminalInput(state.queuedInput, id),
    }
  }),
  markFallback: (id) => set(state => markTabFallback(state, id)),
  retitleTab: (id, title) => set(state => retitleTab(state, id, title)),
  resetTabs: () => set({
    tabs: [],
    activeId: null,
    queuedInput: {},
    closeAllPending: false,
  }),

  typeIntoTerminal: ({ cwd, text }) => {
    if (!cwd || !text) return { status: 'no-cwd' }
    const state = get()
    const active = state.tabs.find(tab => tab.id === state.activeId)
    const target = (active && isLiveTerminalTab(active) ? active : null)
      ?? state.tabs.find(tab => tab.status === 'running')
      ?? state.tabs.find(tab => tab.status === 'starting')

    if (!target) {
      const next = addTab(state, { cwd })
      const tab = next.tabs[next.tabs.length - 1]
      set({
        ...next,
        open: true,
        closeAllPending: false,
        queuedInput: enqueueTerminalInput(state.queuedInput, tab.id, text),
      })
      return { status: 'queued', tabId: tab.id, title: tab.title }
    }

    const activated = activateTab(state, target.id)
    // Anything already waiting for this tab goes first, and that entry is
    // consumed here so a ready PTY never receives it twice.
    const pending = takeTerminalInput(state.queuedInput, target.id)
    const payload = pending.text ? `${pending.text} ${text}` : text

    if (target.status === 'running' && target.ptyId) {
      // The same bridge call the mounted session handle makes. `payload` ends
      // in no CR/LF: the shell shows the command at its prompt and has run
      // nothing. The user's Enter is the only execution trigger in this path.
      try {
        if (typeof window !== 'undefined') {
          void window.electronAPI?.ptyWrite({ sessionId: target.ptyId, data: payload })
        }
      } catch { /* the tab's exit handler will mark it */ }
      set({ ...activated, open: true, queuedInput: pending.queues })
      return { status: 'typed', tabId: target.id, title: target.title }
    }

    set({
      ...activated,
      open: true,
      queuedInput: enqueueTerminalInput(pending.queues, target.id, payload),
    })
    return { status: 'queued', tabId: target.id, title: target.title }
  },

  flushQueuedInput: (tabId) => {
    const pending = takeTerminalInput(get().queuedInput, tabId)
    if (pending.text === null) return null
    set({ queuedInput: pending.queues })
    return pending.text
  },

  requestCloseAll: () => {
    const state = get()
    if (state.tabs.length === 0) return
    if (shouldConfirmCloseAll(state.tabs)) {
      // The dock owns the dialog; opening it is what makes the question visible
      // when the request came from the palette.
      set({ closeAllPending: true, open: true })
      return
    }
    get().closeAll()
  },
  confirmCloseAll: () => get().closeAll(),
  cancelCloseAll: () => set({ closeAllPending: false }),
}))
