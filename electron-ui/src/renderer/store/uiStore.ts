// UI store — extracted from store/index.ts (Iteration 440)
import { create } from 'zustand'
import { ToastItem, ToastType } from '../components/ui/Toast'

export type SidebarTab = 'history' | 'files' | 'notes' | 'skills' | 'memory' | 'workflows' | 'channel' | 'tasks' | 'changes'
export type NavItem = 'chat' | 'department' | 'history' | 'files' | 'settings' | 'notes' | 'skills' | 'memory' | 'workflows' | 'channel' | 'tasks' | 'changes'

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
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: string) => void

  // NavRail active item tracking
  activeNavItem: NavItem
  setActiveNavItem: (item: NavItem) => void

  // Quote reply: text to prefill into the input bar
  quotedText: string | null
  setQuotedText: (text: string | null) => void

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
  pendingSettingsTab: 'general' | 'ai-engine' | 'permissions' | 'stats' | 'hooks' | 'plugins' | 'mcp' | 'advanced' | 'sandbox' | 'about' | null
  openSettingsAt: (tab: 'general' | 'ai-engine' | 'permissions' | 'stats' | 'hooks' | 'plugins' | 'mcp' | 'advanced' | 'sandbox' | 'about') => void
  clearPendingSettingsTab: () => void

  // Main content area view (Iteration 412: settings; Iteration 414: editors; Iteration 460: workflow-detail; Iteration 534: notes; Iteration 535: skill-creator; department: department dashboard)
  mainView: 'chat' | 'settings' | 'persona-editor' | 'workflow-editor' | 'workflow-detail' | 'notes' | 'skill-creator' | 'skill-marketplace' | 'department'
  setMainView: (view: 'chat' | 'settings' | 'persona-editor' | 'workflow-editor' | 'workflow-detail' | 'notes' | 'skill-creator' | 'skill-marketplace' | 'department') => void

  // Track whether the current chat was entered from a department view (Iteration 538)
  fromDepartment: boolean
  setFromDepartment: (v: boolean) => void

  // Persona/Workflow editor: ID of item being edited (null = new)
  editingPersonaId: string | null
  editingWorkflowId: string | null
  personaEditorReturnView: 'chat' | 'settings'
  openPersonaEditor: (personaId: string | null, returnView?: 'chat' | 'settings') => void
  openWorkflowEditor: (workflowId: string | null) => void
  openWorkflowDetail: (workflowId: string) => void

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
    const valid = ['history', 'files', 'notes', 'skills', 'memory', 'workflows', 'channel', 'tasks', 'changes']
    if (saved && valid.includes(saved)) return saved as UiState['sidebarTab']
  } catch { }
  return 'history' as const
})()

export const useUiStore = create<UiState>((set) => ({
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
  addToast: (type, message, duration) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    // Error toasts persist longer (8s default vs 4s)
    const effectiveDuration = duration ?? (type === 'error' ? 8000 : 4000)
    set((s) => ({
      toasts: [...s.toasts, { id, type, message, duration: effectiveDuration }],
    }))
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  setActiveNavItem: (item) => set((s) => {
    // Settings opens as a modal overlay, not in the sidebar
    if (item === 'settings') {
      return { settingsModalOpen: true }
    }
    // Department opens the department dashboard in main content area (Iteration 612)
    if (item === 'department') {
      return { activeNavItem: 'department', mainView: 'department' as const, sidebarTab: 'history' as const }
    }
    // Notes opens in the main content area (Iteration 534)
    if (item === 'notes') {
      // Toggle: if already in notes main view, go back to chat
      if (s.mainView === 'notes') {
        return { activeNavItem: 'chat', mainView: 'chat' as const }
      }
      try { localStorage.setItem('aipa:sidebar-tab', item) } catch { }
      return { activeNavItem: item, sidebarTab: item, mainView: 'notes' as const }
    }
    if (item === 'history' || item === 'files' || item === 'skills' || item === 'memory' || item === 'workflows' || item === 'channel' || item === 'tasks' || item === 'changes') {
      try { localStorage.setItem('aipa:sidebar-tab', item) } catch { }
      // Clear all unread badges when viewing History
      const extra = item === 'history' ? { unreadCounts: {} as Record<string, number>, unreadSessionCount: 0 } : {}
      return { activeNavItem: item, sidebarTab: item, sidebarOpen: true, mainView: 'chat' as const, ...extra }
    }
    return { activeNavItem: item }
  }),
  setQuotedText: (text) => set({ quotedText: text }),
  setAlwaysOnTop: (v) => set({ alwaysOnTop: v }),
  terminalResumeSessionId: null,
  setTerminalResumeSessionId: (id) => set({ terminalResumeSessionId: id }),
  settingsModalOpen: false,
  setSettingsModalOpen: (v) => set({ settingsModalOpen: v }),
  openSettingsModal: () => set({ settingsModalOpen: true, mainView: 'settings' }),
  closeSettingsModal: () => set({ settingsModalOpen: false, mainView: 'chat' }),
  pendingSettingsTab: null,
  openSettingsAt: (tab) => set({ settingsModalOpen: true, mainView: 'settings', pendingSettingsTab: tab }),
  clearPendingSettingsTab: () => set({ pendingSettingsTab: null }),
  mainView: 'department' as const,
  setMainView: (view) => set({ mainView: view }),
  fromDepartment: false,
  setFromDepartment: (v) => set({ fromDepartment: v }),
  editingPersonaId: null,
  editingWorkflowId: null,
  personaEditorReturnView: 'settings' as const,
  openPersonaEditor: (personaId, returnView = 'settings') => set({ mainView: 'persona-editor', editingPersonaId: personaId, settingsModalOpen: false, personaEditorReturnView: returnView }),
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
