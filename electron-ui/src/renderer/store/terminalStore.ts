import { create } from 'zustand'
import {
  activateTab,
  addTab,
  closeAllTabs,
  closeTab,
  markTabExited,
  markTabFailed,
  markTabFallback,
  markTabRunning,
  retitleTab,
  TERMINAL_DEFAULT_HEIGHT,
  TERMINAL_MIN_HEIGHT,
  type TerminalStatus,
  type TerminalTab,
  type TerminalTabsState,
} from './terminalTabs'

export type { TerminalStatus, TerminalTab }

interface TerminalState extends TerminalTabsState {
  /** Whether the dock is mounted. AppShell renders it only while true. */
  open: boolean
  /** Requested dock height in px; the dock clamps it to 120..60% viewport. */
  height: number
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
  markFailed: (id: string, failure: string) => void
  markFallback: (id: string) => void
  retitleTab: (id: string, title: string) => void
  resetTabs: () => void
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
  closeTab: (id) => set(state => closeTab(state, id)),
  closeAll: () => set(state => closeAllTabs(state)),
  activateTab: (id) => set(state => activateTab(state, id)),
  markRunning: (id, ptyId) => set(state => markTabRunning(state, id, ptyId)),
  markExited: (id, exitCode) => set(state => markTabExited(state, id, exitCode)),
  markFailed: (id, failure) => set(state => markTabFailed(state, id, failure)),
  markFallback: (id) => set(state => markTabFallback(state, id)),
  retitleTab: (id, title) => set(state => retitleTab(state, id, title)),
  resetTabs: () => set({ tabs: [], activeId: null }),
}))
