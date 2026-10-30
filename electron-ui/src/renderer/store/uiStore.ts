// UI store — extracted from store/index.ts (Iteration 440)
import { create } from 'zustand'
import { ToastAction, ToastItem, ToastType } from '../components/ui/Toast'
import type { SettingsTab } from '../components/settings/settingsConstants'
import { usePluginStore } from './pluginStore'

/**
 * The exact rows the archive handed the search overlay, in listing order.
 *
 * It is a snapshot taken when the user pressed the archive's ask button: the
 * archive knows which sessions it is showing, but the overlay cannot re-derive
 * that list (its filters, the filing map and the ledger's own grouping all
 * change independently). `total` is what the archive was showing before the
 * cap, so the overlay can say how many rows the cap left out.
 */
export interface ArchiveAskScopeSeed {
  sessionIds: string[]
  total: number
  truncated: boolean
}

export type SidebarTab = 'history' | 'files' | 'notes' | 'workflows' | 'changes'
// 'skills' is kept as an alias: the Skills panel is now a section of the Employees
// page, so entry points (Ctrl+4, /skills, command palette) resolve to 'workflows'.
export type NavItem = 'chat' | 'department' | 'archive' | 'history' | 'files' | 'settings' | 'notes' | 'skills' | 'memory' | 'workflows' | 'changes' | 'run-activity' | 'tasks' | `plugin:${string}`
export type MainView =
  | 'chat'
  | 'department'
  | 'archive'
  | 'tasks'
  | 'workflows'
  | 'notes'
  | 'changes'
  | 'files'
  | 'settings'
  | 'persona-editor'
  | 'workflow-editor'
  | 'workflow-detail'
  | 'skill-creator'
  | 'skill-marketplace'
  | 'run-activity'
  | 'plugin'

interface UiState {
  sidebarTab: SidebarTab
  sidebarOpen: boolean
  commandPaletteOpen: boolean
  toasts: ToastItem[]
  setSidebarTab: (tab: SidebarTab) => void
  setSidebarOpen: (v: boolean) => void
  setCommandPaletteOpen: (v: boolean) => void
  toggleSidebar: () => void
  toggleCommandPalette: () => void
  focusMode: boolean
  toggleFocusMode: () => void
  // `action` is the fourth positional argument so the hundreds of existing
  // `addToast(type, message, duration?)` calls keep compiling untouched.
  addToast: (type: ToastType, message: string, duration?: number, action?: ToastAction) => void
  removeToast: (id: string) => void

  // NavRail active item tracking
  activeNavItem: NavItem
  setActiveNavItem: (item: NavItem) => void

  // Quote reply: text to prefill into the input bar
  quotedText: string | null
  setQuotedText: (text: string | null) => void

  // A drafted message handed to the composer from a surface that is not the
  // chat view (a failed automation run, say). Deliberately not `quotedText`:
  // a quote is evidence pasted above what the user types, while this *is* the
  // message the user is about to send, so it replaces the draft and never
  // becomes a quote block. A token distinguishes two prefills of the same text;
  // ChatInput consumes the channel in an effect and clears it, so a remount
  // cannot re-apply a question the user already saw.
  composerPrefill: { text: string; token: number } | null
  prefillComposer: (text: string) => void
  consumeComposerPrefill: () => void

  // A newly recruited employee's job description, handed from the department view
  // to the chat view. ChatPanel mounts on the far side of that view switch, so
  // the brief waits here until the composer is alive enough to send it as the
  // employee's first message.
  pendingRecruitBrief: string | null
  setPendingRecruitBrief: (text: string | null) => void

  // "/" and Ctrl+Shift+F ask for the in-session search field. The request waits
  // here because ChatPanel is unmounted in every other view: a DOM event fired
  // while another view is in front would reach no listener. ChatPanel consumes
  // the flag when it mounts, so a later remount does not reopen the search.
  searchFocusPending: boolean
  requestSearchFocus: () => void
  consumeSearchFocus: () => void

  // Ctrl+L asks for the composer, but ChatInput only exists while the chat
  // view is mounted. The shortcut therefore switches views first and parks
  // the focus request here; ChatInput consumes it on mount. Same hand-off
  // pattern as searchFocusPending, and for the same reason: a DOM event fired
  // while another view is in front reaches no listener.
  focusInputPending: boolean
  requestInputFocus: () => void
  consumeInputFocus: () => void

  // Alt+1..9 asks the department page to drill into one node. The request waits
  // here because DepartmentDashboard mounts on the far side of the view switch
  // (it is lazy), so a request fired while another view is in front would reach
  // no component. The page consumes it once it is alive. A node that has
  // disappeared by then is dropped rather than opening a blank page.
  pendingDepartmentOpenId: string | null
  openDepartment: (id: string) => void
  consumePendingDepartmentOpenId: () => string | null

  // Global (cross-session) search overlay. Lives in the store, not in App, so
  // any view — and the shortcuts that fire while another view is mounted — can
  // open it without a DOM listener.
  globalSearchOpen: boolean
  setGlobalSearchOpen: (open: boolean) => void

  // Text the next overlay mount should start with (command palette → search).
  // The overlay reads it once and clears it, so reopening the search later
  // does not resurrect a question the user already saw.
  globalSearchSeed: string
  setGlobalSearchSeed: (seed: string) => void

  // Department whose page asked the next overlay mount to open scoped to it.
  // The overlay reads it once and clears it, so a later search does not
  // silently stay scoped to a department the user only visited once.
  globalSearchSeedDeptId: string | null
  setGlobalSearchSeedDeptId: (id: string | null) => void

  // A list of sessions the archive asked the next overlay mount to search and
  // ask within. Unlike the department seed this cannot be derived from the org
  // tree — it is an exact snapshot of the rows the archive was showing, capped.
  // The overlay reads it once and clears it, so a later search is never
  // silently limited to a list the user picked in another view.
  globalSearchSeedScope: ArchiveAskScopeSeed | null
  setGlobalSearchSeedScope: (scope: ArchiveAskScopeSeed | null) => void

  // Whether "Ask AIPA about your history" can actually run. `null` means the
  // one-time probe has not answered yet; the palette treats that as available
  // so a slow probe can never hide a working command. `false` removes the
  // command, matching the overlay, which hides its ask row in that case.
  askHistoryAvailable: boolean | null
  setAskHistoryAvailable: (available: boolean | null) => void

  // Evidence hand-off from the search overlay to ChatPanel. The overlay knows
  // the matched message only as a timestamp; ChatPanel owns the parsed message
  // array that turns it into an index. The nonce makes two clicks on the same
  // message distinguishable.
  pendingReveal: {
    sessionId: string
    messageIndex: number
    query: string
    nonce: number
  } | null
  requestReveal: (reveal: { sessionId: string; messageIndex: number; query: string }) => void
  consumeReveal: () => void

  // Always-on-top (pin window)
  alwaysOnTop: boolean
  setAlwaysOnTop: (v: boolean) => void

  // Terminal session resumption
  terminalResumeSessionId: string | null
  setTerminalResumeSessionId: (id: string | null) => void

  // Settings modal (opens as overlay instead of sidebar panel)
  settingsModalOpen: boolean
  setSettingsModalOpen: (v: boolean) => void
  openSettingsModal: () => void
  closeSettingsModal: () => void
  // Pending settings tab — consumed by SettingsPanel on open to jump to a specific tab
  pendingSettingsTab: SettingsTab | null
  openSettingsAt: (tab: SettingsTab) => void
  clearPendingSettingsTab: () => void

  // Main content area view (Iteration 412: settings; Iteration 414: editors; Iteration 460: workflow-detail; Iteration 534: notes; Iteration 535: skill-creator; department: department dashboard)
  mainView: MainView
  setMainView: (view: MainView) => void

  // Which section of the Employees page to scroll to when arriving from another
  // entry point. The page finds it through `data-employees-section`; there is
  // one anchor primitive, not a second navigation system. 'trash' is special
  // only in that its anchor does not exist until the section's rows have
  // loaded — the section itself waits for them (see TrashSection).
  pendingEmployeesSection: 'skills' | 'agents' | 'workflows' | 'trash' | null
  openEmployeesSection: (section: 'skills' | 'agents' | 'workflows' | 'trash') => void
  clearPendingEmployeesSection: () => void

  // The skill the global search asked the Employees page to open, identified by
  // its directory path — the same id the search row carries. It waits here
  // because the overlay closes as the view switches, so the page mounts after
  // the click; the page consumes it once its skill list is loaded, so a path
  // that no longer resolves is dropped instead of opening nothing forever.
  pendingSkillPath: string | null
  openSkillDetail: (dirPath: string) => void
  consumePendingSkillPath: () => string | null

  // The scheduled job the global search asked Settings → Automations to reveal.
  // Same hand-off: the settings list mounts after the overlay closes, then
  // scrolls the row into view and clears the request.
  pendingAutomationJobId: string | null
  focusAutomationJob: (jobId: string) => void
  consumePendingAutomationJobId: () => string | null

  // Track whether the current chat was entered from a department view (Iteration 538)
  fromDepartment: boolean
  setFromDepartment: (v: boolean) => void

  // Persona/Workflow editor: ID of item being edited (null = new)
  editingPersonaId: string | null
  editingWorkflowId: string | null
  personaEditorReturnView: 'chat' | 'settings' | 'workflows'
  openPersonaEditor: (personaId: string | null, returnView?: 'chat' | 'settings' | 'workflows') => void
  openWorkflowEditor: (workflowId: string | null) => void
  openWorkflowDetail: (workflowId: string) => void
  /**
   * The cross-job run list. A page, not a settings tab: it spans every job, so
   * the page that owns one job at a time is the wrong owner. No rail item — it
   * is reached from the status bar and the command palette, and the rail has no
   * permanent slot for a surface people open after the fact.
   */
  openRunActivity: () => void

  // Session Quick Switcher (Ctrl+K)
  sessionSwitcherOpen: boolean
  setSessionSwitcherOpen: (v: boolean) => void
  toggleSessionSwitcher: () => void

  // Session Pinned Notes (keyed by session ID)
  sessionNotes: Record<string, string>
  setSessionNote: (sessionId: string, note: string) => void
  removeSessionNote: (sessionId: string) => void

  // Pinned Note ID per session (Iteration 439) — max 1 note pinned to chat header
  pinnedNoteIds: Record<string, string>
  setPinnedNoteId: (sessionId: string, noteId: string) => void
  removePinnedNoteId: (sessionId: string) => void

  // Per-session unread message counts (Iteration 459): maps sessionId -> unread count
  unreadCounts: Record<string, number>
  unreadSessionCount: number  // derived: total sessions with unread > 0
  incrementUnreadForSession: (sessionId: string) => void
  clearUnreadForSession: (sessionId: string) => void
  clearUnreadSessions: () => void

  // Status bar visibility toggle (/statusline slash command)
  showStatusBar: boolean
  toggleStatusBar: () => void
}

// Restore last sidebar tab from localStorage
const savedSidebarTab = (() => {
  try {
    const saved = localStorage.getItem('aipa:sidebar-tab')
    const valid = ['history', 'files', 'notes', 'workflows', 'changes']
    if (saved && valid.includes(saved)) return saved as UiState['sidebarTab']
  } catch { }
  return 'history' as const
})()


type NavPatch = Partial<Pick<UiState, 'activeNavItem' | 'mainView' | 'sidebarTab' | 'sidebarOpen' | 'settingsModalOpen' | 'pendingSettingsTab' | 'pendingEmployeesSection' | 'unreadCounts' | 'unreadSessionCount'>>

function resolveNav(_s: UiState, item: NavItem): NavPatch {
  // Settings opens as a modal overlay, not in the sidebar
  if (item === 'settings') {
    return { settingsModalOpen: true, mainView: 'settings', activeNavItem: 'settings' }
  }
  // Department opens the department dashboard in main content area
  if (item === 'department') {
    return { activeNavItem: 'department', mainView: 'department', sidebarTab: 'history', sidebarOpen: false }
  }
  // Tasks is the task-owned work surface. It deliberately does not write
  // `prefs.workingDir` or open a conversation: increment 1 is a record and a
  // folder, not dispatch.
  if (item === 'tasks') {
    return { activeNavItem: 'tasks', mainView: 'tasks', sidebarOpen: false }
  }
  // Archive opens the company-wide task ledger
  if (item === 'archive') {
    return { activeNavItem: 'archive', mainView: 'archive', sidebarOpen: false }
  }
  // The cross-job run list. No rail icon equals this item, so nothing on the
  // rail stays highlighted while the page is in front — which is the honest
  // state: the page belongs to no section, it spans them all.
  if (item === 'run-activity') {
    return { activeNavItem: 'run-activity', mainView: 'run-activity', sidebarOpen: false }
  }
  // Chat/History opens chat panel in main content area
  if (item === 'chat' || item === 'history') {
    return {
      activeNavItem: 'chat',
      mainView: 'chat',
      sidebarTab: 'history',
      sidebarOpen: false,
      unreadCounts: {},
      unreadSessionCount: 0,
    }
  }
  // Notes opens via the Notes plugin in main view
  if (item === 'notes') item = 'plugin:aipa-notes'
  // Skills now live inside the Employees page — land there and scroll to the section
  if (item === 'skills') {
    return { activeNavItem: 'workflows', mainView: 'workflows', sidebarTab: 'workflows', sidebarOpen: false, pendingEmployeesSection: 'skills' }
  }
  // Workflows, Memory, Changes, Files all open directly in main view
  // Memory lives in Settings now; old entry points (Ctrl+5, command palette) land on that tab
  if (item === 'memory') {
    return { settingsModalOpen: true, mainView: 'settings', activeNavItem: 'settings', pendingSettingsTab: 'memory' }
  }
  if (item === 'workflows' || item === 'changes' || item === 'files') {
    try { localStorage.setItem('aipa:sidebar-tab', item) } catch { }
    return { activeNavItem: item, sidebarTab: item, mainView: item, sidebarOpen: false }
  }
  // Hot-pluggable plugins open in main view
  if (typeof item === 'string' && item.startsWith('plugin:')) {
    usePluginStore.getState().setActivePluginId(item.slice('plugin:'.length))
    return { activeNavItem: item, mainView: 'plugin', sidebarOpen: false }
  }
  return { activeNavItem: item }
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarTab: savedSidebarTab,
  sidebarOpen: true,
  commandPaletteOpen: false,
  focusMode: false,
  toasts: [],
  activeNavItem: 'department' as NavItem,
  quotedText: null,
  alwaysOnTop: false,
  setSidebarTab: (tab) => {
    try { localStorage.setItem('aipa:sidebar-tab', tab) } catch { }
    set({ sidebarTab: tab })
  },
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  toggleFocusMode: () => set((s) => {
    if (!s.focusMode) {
      // Entering focus mode: hide sidebar
      return { focusMode: true, sidebarOpen: false }
    }
    // Exiting focus mode: restore sidebar
    return { focusMode: false, sidebarOpen: true }
  }),
  addToast: (type, message, duration, action) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    // Error toasts persist longer (8s default vs 4s)
    const effectiveDuration = duration ?? (type === 'error' ? 8000 : 4000)
    set((s) => ({
      toasts: [...s.toasts, { id, type, message, duration: effectiveDuration, action }],
    }))
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  // Any nav click leaves Settings, so its highlight never lingers next to the new item
  setActiveNavItem: (item) => set((s) => ({ settingsModalOpen: false, ...resolveNav(s, item) })),
  setQuotedText: (text) => set({ quotedText: text }),
  composerPrefill: null,
  prefillComposer: (text) => set({ composerPrefill: { text, token: Date.now() } }),
  consumeComposerPrefill: () => set({ composerPrefill: null }),
  pendingRecruitBrief: null,
  setPendingRecruitBrief: (text) => set({ pendingRecruitBrief: text }),
  searchFocusPending: false,
  requestSearchFocus: () => set({ searchFocusPending: true }),
  consumeSearchFocus: () => set({ searchFocusPending: false }),
  focusInputPending: false,
  requestInputFocus: () => set({ focusInputPending: true }),
  consumeInputFocus: () => set({ focusInputPending: false }),
  globalSearchOpen: false,
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
  globalSearchSeed: '',
  setGlobalSearchSeed: (seed) => set({ globalSearchSeed: seed }),
  globalSearchSeedDeptId: null,
  setGlobalSearchSeedDeptId: (id) => set({ globalSearchSeedDeptId: id }),
  globalSearchSeedScope: null,
  setGlobalSearchSeedScope: (scope) => set({ globalSearchSeedScope: scope }),
  askHistoryAvailable: null,
  setAskHistoryAvailable: (available) => set({ askHistoryAvailable: available }),
  pendingReveal: null,
  requestReveal: (reveal) => set({
    pendingReveal: { ...reveal, nonce: Date.now() },
  }),
  consumeReveal: () => set({ pendingReveal: null }),
  setAlwaysOnTop: (v) => set({ alwaysOnTop: v }),
  terminalResumeSessionId: null,
  setTerminalResumeSessionId: (id) => set({ terminalResumeSessionId: id }),
  settingsModalOpen: false,
  setSettingsModalOpen: (v) => set({ settingsModalOpen: v }),
  // Settings takes over activeNavItem so the previously selected icon un-highlights
  openSettingsModal: () => set({ settingsModalOpen: true, mainView: 'settings', activeNavItem: 'settings' }),
  closeSettingsModal: () => set({ settingsModalOpen: false, mainView: 'chat', activeNavItem: 'chat' }),
  pendingSettingsTab: null,
  openSettingsAt: (tab) => set({ settingsModalOpen: true, mainView: 'settings', activeNavItem: 'settings', pendingSettingsTab: tab }),
  clearPendingSettingsTab: () => set({ pendingSettingsTab: null }),
  mainView: 'department' as const,
  setMainView: (view) => set({ mainView: view }),
  // Through `setActiveNavItem` so both entry points (status bar, palette) land
  // on one view and any open Settings closes first.
  openRunActivity: () => get().setActiveNavItem('run-activity'),
  pendingEmployeesSection: null,
  // Through `setActiveNavItem`, so the palette and the /skills entry point land
  // on the same view with the same section request; only the section is added.
  openEmployeesSection: (section) => {
    get().setActiveNavItem('workflows')
    set({ pendingEmployeesSection: section })
  },
  clearPendingEmployeesSection: () => set({ pendingEmployeesSection: null }),
  // Same destination as the 'skills' nav item, plus the row to open. The
  // section request stays set so that if the path no longer resolves the user
  // still lands on the skills grid rather than on a blank page.
  pendingSkillPath: null,
  openSkillDetail: (dirPath) => {
    // Through the nav resolver, not a hand-copied patch: the search row and the
    // /skills entry point must land on the same view with the same section
    // request, and a new nav field should reach both without an edit here.
    get().setActiveNavItem('skills')
    set({ pendingSkillPath: dirPath })
  },
  consumePendingSkillPath: () => {
    const path = get().pendingSkillPath
    if (path !== null) set({ pendingSkillPath: null })
    return path
  },
  pendingAutomationJobId: null,
  // Through `openSettingsAt`, so the search entry point and the palette /
  // status-bar entries cannot drift apart, plus the row to reveal.
  focusAutomationJob: (jobId) => {
    get().openSettingsAt('automations')
    set({ pendingAutomationJobId: jobId })
  },
  consumePendingAutomationJobId: () => {
    const id = get().pendingAutomationJobId
    if (id !== null) set({ pendingAutomationJobId: null })
    return id
  },
  pendingDepartmentOpenId: null,
  // Through `setActiveNavItem('department')`, not a hand-copied patch: the nav
  // rail, Ctrl+1 and this chord must land on the same page in the same state.
  openDepartment: (id) => {
    if (!id) return
    get().setActiveNavItem('department')
    set({ pendingDepartmentOpenId: id })
  },
  consumePendingDepartmentOpenId: () => {
    const id = get().pendingDepartmentOpenId
    if (id !== null) set({ pendingDepartmentOpenId: null })
    return id
  },
  fromDepartment: false,
  setFromDepartment: (v) => set({ fromDepartment: v }),
  editingPersonaId: null,
  editingWorkflowId: null,
  personaEditorReturnView: 'workflows' as const,
  openPersonaEditor: (personaId, returnView = 'workflows') => set({ mainView: 'persona-editor', editingPersonaId: personaId, settingsModalOpen: false, personaEditorReturnView: returnView }),
  openWorkflowEditor: (workflowId) => set({ mainView: 'workflow-editor', editingWorkflowId: workflowId, settingsModalOpen: false }),
  // Open workflow detail view in main panel (Iteration 460)
  openWorkflowDetail: (workflowId: string) => set({ mainView: 'workflow-detail' as const, editingWorkflowId: workflowId, settingsModalOpen: false }),
  sessionSwitcherOpen: false,
  setSessionSwitcherOpen: (v) => set({ sessionSwitcherOpen: v }),
  toggleSessionSwitcher: () => set((s) => ({ sessionSwitcherOpen: !s.sessionSwitcherOpen })),
  sessionNotes: (() => {
    try {
      const saved = localStorage.getItem('aipa:session-notes')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })(),
  setSessionNote: (sessionId, note) => set((s) => {
    const updated = { ...s.sessionNotes, [sessionId]: note }
    try { localStorage.setItem('aipa:session-notes', JSON.stringify(updated)) } catch { }
    return { sessionNotes: updated }
  }),
  removeSessionNote: (sessionId) => set((s) => {
    const updated = { ...s.sessionNotes }
    delete updated[sessionId]
    try { localStorage.setItem('aipa:session-notes', JSON.stringify(updated)) } catch { }
    return { sessionNotes: updated }
  }),

  // Pinned Note ID per session (Iteration 439)
  pinnedNoteIds: (() => {
    try {
      const saved = localStorage.getItem('aipa:pinned-note-ids')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })(),
  setPinnedNoteId: (sessionId, noteId) => set((s) => {
    const updated = { ...s.pinnedNoteIds, [sessionId]: noteId }
    try { localStorage.setItem('aipa:pinned-note-ids', JSON.stringify(updated)) } catch { }
    return { pinnedNoteIds: updated }
  }),
  removePinnedNoteId: (sessionId) => set((s) => {
    const updated = { ...s.pinnedNoteIds }
    delete updated[sessionId]
    try { localStorage.setItem('aipa:pinned-note-ids', JSON.stringify(updated)) } catch { }
    return { pinnedNoteIds: updated }
  }),

  // Per-session unread counts (Iteration 458)
  unreadCounts: {},
  unreadSessionCount: 0,
  incrementUnreadForSession: (sessionId) => set((s) => {
    const updated = { ...s.unreadCounts, [sessionId]: (s.unreadCounts[sessionId] || 0) + 1 }
    const total = Object.values(updated).reduce((sum, c) => sum + (c > 0 ? 1 : 0), 0)
    return { unreadCounts: updated, unreadSessionCount: total }
  }),
  clearUnreadForSession: (sessionId) => set((s) => {
    const updated = { ...s.unreadCounts }
    delete updated[sessionId]
    const total = Object.values(updated).reduce((sum, c) => sum + (c > 0 ? 1 : 0), 0)
    return { unreadCounts: updated, unreadSessionCount: total }
  }),
  clearUnreadSessions: () => set({ unreadCounts: {}, unreadSessionCount: 0 }),

  // Status bar visibility
  showStatusBar: true,
  toggleStatusBar: () => set((s) => ({ showStatusBar: !s.showStatusBar })),
}))
