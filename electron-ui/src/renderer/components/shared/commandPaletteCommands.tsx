// Command palette command definitions — extracted from CommandPalette.tsx (Iteration 315)

import React from 'react'
import {
  Plus, Download, PanelLeft, Settings, History,
  FolderOpen, Zap, Trash2, HelpCircle, Cpu, Sparkles,
  Brain, Workflow, Play, NotebookPen, ClipboardPaste, Radio, Archive,
  Sun, Moon, Languages, Copy, Pin, StickyNote, ArrowUpDown,
  FileText, Stethoscope, Pencil, BarChart2, Shield,
  Database, DollarSign, SkipBack, RefreshCw, ExternalLink, Hourglass, ListChecks,
  Type, TerminalSquare, Eraser, GitBranch,
} from 'lucide-react'
import { useChatStore, useSessionStore, useUiStore, usePrefsStore } from '../../store'
import { useTerminalStore } from '../../store/terminalStore'
import { clearTerminal } from '../terminal/terminalRegistry'
import type { SidebarTab, NavItem } from '../../store'
import { MODEL_OPTIONS } from '../settings/settingsConstants'
import type { SessionListItem } from '../../types/app.types'
import { getWorkflowQueuePlan } from '../workflows/workflowConstants'
import { errorCodeText } from '../workflows/scheduleSummary'
import { formatDateMedium, type AppLocale } from '../../utils/formatDate'
import { buildAutomationDescriptors, canRunAutomation } from './automationPalette'
import { buildTrashPaletteEntry } from '../../lib/trashPresence'
import { planFolderPick, recordedFolderOf } from '../../lib/folderPick'
import { pickFolderForView } from '../../lib/folderPickAction'
import { approvalPaletteRows, dispatchApprovalFocus } from '../automation/approvalFocus'
import { formatDuration } from '../layout/statusBarConstants'
import { cachedGitStatus, requestGitStatusPanel } from '../layout/gitStatusPanel'
import type { Translate } from '../automation/scheduleText'
import type { AutomationJobData } from '../../../preload'

export interface PaletteCommand {
  id: string
  name: string
  description: string
  icon?: React.ReactNode
  shortcut?: string
  action: () => void
  category: 'action' | 'slash' | 'session' | 'model' | 'persona' | 'workflow' | 'automation' | 'approval' | 'snippet'
}

interface CommandBuilderArgs {
  t: (key: string, params?: Record<string, string>) => string
  onClose: () => void
  onExport: () => void
  onNewConversation: () => void
  onSendSlashCommand: (cmd: string) => void
  toggleSidebar: () => void
  setSidebarTab: (tab: SidebarTab) => void
  setSidebarOpen: (open: boolean) => void
  setActiveNavItem: (item: NavItem) => void
  addToQueue: (text: string) => void
  addToast: (type: 'success' | 'error' | 'info' | 'warning', msg: string, duration?: number) => void
  sessions: SessionListItem[]
  /** Text currently typed into the palette; seeds the global search overlay. */
  query?: string
  /** `null` = the one-time probe has not answered; `false` hides the ask entry. */
  askHistoryAvailable?: boolean | null
  /** App locale, so session dates match the welcome hero and the archive. */
  resolvedLocale: AppLocale
}

export function buildActionCommands(args: CommandBuilderArgs): PaletteCommand[] {
  const {
    t, onClose, onExport, onNewConversation, onSendSlashCommand,
    toggleSidebar, setSidebarTab, setSidebarOpen, setActiveNavItem, addToast,
  } = args

  // `null` means the one-time probe has not answered yet: keep the command.
  // `false` means the overlay would hide its ask row, so the command must not
  // promise a feature that is not there.
  const { askHistoryAvailable = null } = args

  // Same folder the dock's + button uses: the conversation's folder first, then
  // the global preference, then home. Read imperatively rather than subscribed:
  // the palette is rebuilt when it opens, and every action re-reads live state.
  const terminalCwd = () =>
    useChatStore.getState().workingDir
    || usePrefsStore.getState().prefs.workingDir
    || useSessionStore.getState().homeDir
    || ''
  const terminalState = useTerminalStore.getState()
  const hasActiveTerminal = terminalState.tabs.length > 0 && terminalState.activeId !== null

  // The palette cannot run git itself. The chip records what it last read, so
  // a folder already known not to be a repository can say so in the row
  // instead of only promising a panel that will never open.
  const workingTreeFolder = terminalCwd()
  const knownTree = cachedGitStatus(workingTreeFolder)
  const workingTreeDescription = !workingTreeFolder
    ? t('command.workingTreeNoFolder')
    : knownTree && !knownTree.ok && knownTree.code === 'not_a_repo'
      ? t('command.workingTreeNotRepo')
      : knownTree && !knownTree.ok && knownTree.code === 'git_missing'
        ? t('command.workingTreeGitMissing')
        : t('command.workingTreeChangesDesc')

  // What the folder row will do, read once when the palette is built. The
  // action re-reads before it runs: the dialog may be answered after the user
  // has moved to another conversation, and the plan must describe that one.
  const chatNow = useChatStore.getState()
  const folderPlan = planFolderPick(
    chatNow.activeTabId,
    recordedFolderOf(args.sessions, chatNow.currentSessionId),
  )

  return [
    {
      id: 'new-conversation',
      name: t('command.newConversation'),
      description: t('command.newConversationDesc'),
      icon: <Plus size={14} />,
      shortcut: 'Ctrl+N',
      action: () => { onNewConversation(); onClose() },
      category: 'action',
    },
    {
      id: 'export-conversation',
      name: t('command.exportConversation'),
      description: t('command.exportConversationDesc'),
      icon: <Download size={14} />,
      shortcut: 'Ctrl+Shift+E',
      action: () => { onExport(); onClose() },
      category: 'action',
    },
    {
      id: 'toggle-sidebar',
      name: t('command.toggleSidebar'),
      description: t('command.toggleSidebarDesc'),
      icon: <PanelLeft size={14} />,
      shortcut: 'Ctrl+B',
      action: () => { toggleSidebar(); onClose() },
      category: 'action',
    },
    {
      id: 'open-settings',
      name: t('command.openSettings'),
      description: t('command.openSettingsDesc'),
      icon: <Settings size={14} />,
      shortcut: 'Ctrl+,',
      action: () => { useUiStore.getState().openSettingsModal(); onClose() },
      category: 'action',
    },
    {
      id: 'manage-snippets',
      name: t('command.manageSnippets'),
      description: t('command.manageSnippetsDesc'),
      icon: <Type size={14} />,
      action: () => { useUiStore.getState().openSettingsAt('snippets'); onClose() },
      category: 'action',
    },
    {
      id: 'toggle-terminal',
      name: t('command.toggleTerminal'),
      description: t('command.toggleTerminalDesc'),
      icon: <TerminalSquare size={14} />,
      shortcut: 'Ctrl+`',
      action: () => { useTerminalStore.getState().toggleOpen(); onClose() },
      category: 'action',
    },
    {
      id: 'new-terminal-tab',
      name: t('command.newTerminalTab'),
      description: terminalCwd() ? t('command.newTerminalTabDesc') : t('terminal.dock.noCwd'),
      icon: <Plus size={14} />,
      action: () => {
        onClose()
        const cwd = terminalCwd()
        if (!cwd) {
          addToast('info', t('terminal.dock.noCwd'))
          return
        }
        // The dock's own + and this row must open the same kind of shell: both
        // go through the store action rather than constructing a tab here.
        const store = useTerminalStore.getState()
        store.setOpen(true)
        store.addTab({ cwd })
      },
      category: 'action',
    },
    {
      id: 'clear-active-terminal',
      name: t('command.clearActiveTerminal'),
      description: hasActiveTerminal
        ? t('command.clearActiveTerminalDesc')
        : t('command.clearActiveTerminalNoTab'),
      icon: <Eraser size={14} />,
      action: () => {
        onClose()
        const store = useTerminalStore.getState()
        if (!store.activeId || store.tabs.length === 0) {
          addToast('info', t('command.clearActiveTerminalNoTab'))
          return
        }
        // Bring the dock forward so the screen that gets cleared is the one the
        // user is looking at.
        store.setOpen(true)
        if (!clearTerminal(store.activeId)) {
          // The tab exists but its xterm has not mounted yet (the dock was just
          // opened), so there is no scrollback to clear. Say so — a silent
          // no-op would read as "cleared".
          addToast('info', t('command.clearActiveTerminalNotMounted'))
        }
      },
      category: 'action',
    },
    {
      id: 'close-all-terminals',
      name: t('command.closeAllTerminals'),
      description: terminalState.tabs.length === 0
        ? t('command.noTerminalTabs')
        : t('command.closeAllTerminalsDesc'),
      icon: <Trash2 size={14} />,
      action: () => {
        onClose()
        const store = useTerminalStore.getState()
        if (store.tabs.length === 0) {
          addToast('info', t('command.noTerminalTabs'))
          return
        }
        // Exactly what the dock's X calls. While a shell is alive the store
        // raises the dock's confirmation (and opens the dock so it is visible);
        // the palette has no path to close a live shell without that answer.
        store.requestCloseAll()
      },
      category: 'action',
    },
    {
      id: 'working-tree-changes',
      name: t('command.workingTreeChanges'),
      description: workingTreeDescription,
      icon: <GitBranch size={14} />,
      action: () => {
        onClose()
        const folder = terminalCwd()
        if (!folder) {
          addToast('info', t('command.workingTreeNoFolder'))
          return
        }
        // The panel lives in the status bar. If the user hid it, reveal it
        // first: the request is remembered as pending, so the chip that mounts
        // as a result still opens the panel. A click that shows nothing would
        // be worse than this one visible side effect.
        if (!useUiStore.getState().showStatusBar) useUiStore.getState().toggleStatusBar()
        requestGitStatusPanel()
      },
      category: 'action',
    },
    {
      id: 'open-history',
      name: t('command.openHistory'),
      description: t('command.openHistoryDesc'),
      icon: <History size={14} />,
      action: () => { setSidebarOpen(true); setSidebarTab('history'); onClose() },
      category: 'action',
    },
    {
      id: 'open-files',
      name: t('command.openFiles'),
      description: t('command.openFilesDesc'),
      icon: <FolderOpen size={14} />,
      action: () => { setSidebarOpen(true); setSidebarTab('files'); onClose() },
      category: 'action',
    },
    {
      id: 'open-notes',
      name: t('command.openNotes'),
      description: t('command.openNotesDesc'),
      icon: <NotebookPen size={14} />,
      shortcut: 'Ctrl+3',
      action: () => { setActiveNavItem('notes'); onClose() },
      category: 'action',
    },
    {
      id: 'open-skills',
      name: t('command.openSkills'),
      description: t('command.openSkillsDesc'),
      icon: <Sparkles size={14} />,
      shortcut: 'Ctrl+4',
      action: () => { setActiveNavItem('skills'); onClose() },
      category: 'action',
    },
    {
      id: 'open-memory',
      name: t('command.openMemory'),
      description: t('command.openMemoryDesc'),
      icon: <Brain size={14} />,
      shortcut: 'Ctrl+5',
      action: () => { setActiveNavItem('memory'); onClose() },
      category: 'action',
    },
    {
      id: 'open-workflows',
      name: t('command.openWorkflows'),
      description: t('command.openWorkflowsDesc'),
      icon: <Workflow size={14} />,
      shortcut: 'Ctrl+6',
      action: () => { setActiveNavItem('workflows'); onClose() },
      category: 'action',
    },
    {
      id: 'open-archive',
      name: t('command.openArchive'),
      description: t('command.openArchiveDesc'),
      icon: <Archive size={14} />,
      shortcut: 'Ctrl+8',
      action: () => { setActiveNavItem('archive'); onClose() },
      category: 'action',
    },
    ...(askHistoryAvailable !== false ? [{
      id: 'ask-history',
      name: t('command.askHistory'),
      description: t('command.askHistoryDesc'),
      icon: <Sparkles size={14} />,
      action: () => {
        // The palette query becomes the question; the overlay reads the seed
        // once on mount. An empty query just opens the search as usual.
        const seed = (args.query || '').trim()
        const ui = useUiStore.getState()
        if (seed) ui.setGlobalSearchSeed(seed)
        ui.setGlobalSearchOpen(true)
        onClose()
      },
      category: 'action' as const,
    }] : []),
    {
      id: 'change-working-dir',
      name: t('command.changeWorkingDir'),
      // The row says what the pick will do before the dialog opens. A palette
      // row that only promised "change the working directory" would be wrong
      // for an opened conversation: its folder is recorded in the thread and
      // a pick cannot move it — only a new conversation can start there.
      description: folderPlan.mode === 'new_conversation'
        ? t('command.workingDir.newConversationDesc')
        : folderPlan.mode === 'global'
          ? t('command.workingDir.defaultDesc')
          : t('command.workingDir.thisConversationDesc'),
      icon: <FolderOpen size={14} />,
      action: async () => {
        onClose()
        await pickFolderForView()
      },
      category: 'action',
    },
    {
      id: 'toggle-always-on-top',
      name: t('command.toggleAlwaysOnTop'),
      description: t('command.toggleAlwaysOnTopDesc'),
      icon: <Pin size={14} />,
      shortcut: 'Ctrl+Shift+T',
      action: () => {
        const ui = useUiStore.getState()
        const newValue = !ui.alwaysOnTop
        window.electronAPI.windowSetAlwaysOnTop(newValue)
        ui.setAlwaysOnTop(newValue)
        addToast('info', t(newValue ? 'window.pinnedOn' : 'window.pinnedOff'))
        onClose()
      },
      category: 'action',
    },
    {
      id: 'copy-last-response',
      name: t('command.copyLastResponse'),
      description: t('command.copyLastResponseDesc'),
      icon: <Copy size={14} />,
      action: () => {
        const msgs = useChatStore.getState().messages
        const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
        if (lastAssistant && 'content' in lastAssistant && (lastAssistant as any).content) {
          navigator.clipboard.writeText((lastAssistant as any).content).then(() => {
            addToast('success', t('command.lastResponseCopied'))
          })
        } else {
          addToast('info', t('command.noResponseToCopy'))
        }
        onClose()
      },
      category: 'action',
    },
    // Save clipboard as note
    {
      id: 'clipboard-to-note',
      name: t('command.clipboardToNote'),
      description: t('command.clipboardToNoteDesc'),
      icon: <ClipboardPaste size={14} />,
      action: async () => {
        try {
          const text = await navigator.clipboard.readText()
          if (!text || !text.trim()) {
            addToast('warning', t('command.clipboardEmpty'))
            onClose()
            return
          }
          const notes = usePrefsStore.getState().prefs.notes || []
          if (notes.length >= 100) {
            addToast('warning', t('message.notesLimitReached'))
            onClose()
            return
          }
          const now = Date.now()
          const title = text.trim().slice(0, 50).replace(/\n/g, ' ')
          const newNote = { id: `note-${now}`, title, content: text.trim().slice(0, 10000), createdAt: now, updatedAt: now }
          usePrefsStore.getState().setPrefs({ notes: [newNote, ...notes] })
          window.electronAPI.prefsSet('notes', [newNote, ...notes])
          addToast('success', t('command.clipboardNoteSaved'))
        } catch {
          addToast('error', t('command.clipboardReadFailed'))
        }
        onClose()
      },
      category: 'action',
    },
    // Session Quick Switcher (Iteration 434)
    {
      id: 'session-quick-switcher',
      name: t('session.quickSwitcher'),
      description: t('session.quickSwitcherDesc'),
      icon: <ArrowUpDown size={14} />,
      shortcut: 'Ctrl+K',
      action: () => {
        useUiStore.getState().setSessionSwitcherOpen(true)
        onClose()
      },
      category: 'action',
    },
    // Pin a note to current session (Iteration 434)
    {
      id: 'pin-session-note',
      name: t('session.addNote'),
      description: t('session.addNoteDesc'),
      icon: <StickyNote size={14} />,
      action: () => {
        window.dispatchEvent(new CustomEvent('aipa:editSessionNote'))
        onClose()
      },
      category: 'action',
    },
    // Toggle commands
    {
      id: 'toggle-theme',
      name: t('command.toggleTheme'),
      description: t('command.toggleThemeDesc'),
      icon: (usePrefsStore.getState().prefs.theme || 'light') === 'light' ? <Moon size={14} /> : <Sun size={14} />,
      shortcut: 'Ctrl+Shift+D',
      action: () => {
        const cur = usePrefsStore.getState().prefs.theme || 'light'
        const next = cur === 'light' ? 'vscode' : 'light'
        usePrefsStore.getState().setPrefs({ theme: next })
        window.electronAPI.prefsSet('theme', next)
        onClose()
      },
      category: 'action',
    },
    {
      id: 'toggle-language',
      name: t('command.toggleLanguage'),
      description: t('command.toggleLanguageDesc'),
      icon: <Languages size={14} />,
      shortcut: 'Ctrl+Shift+L',
      action: () => {
        const cur = usePrefsStore.getState().prefs.language || 'en'
        const next = cur === 'zh-CN' ? 'en' : 'zh-CN'
        usePrefsStore.getState().setPrefs({ language: next })
        window.electronAPI.prefsSet('language', next)
        onClose()
      },
      category: 'action',
    },
    {
      id: 'daily-inspiration',
      name: t('command.dailyInspiration'),
      description: t('command.dailyInspirationDesc'),
      icon: <Sparkles size={14} />,
      action: () => {
        const quotes = [
          'The best way to predict the future is to create it. - Peter Drucker',
          'Done is better than perfect. - Sheryl Sandberg',
          'The only way to do great work is to love what you do. - Steve Jobs',
          'Simplicity is the ultimate sophistication. - Leonardo da Vinci',
          'The secret of getting ahead is getting started. - Mark Twain',
          'What you do today can improve all your tomorrows. - Ralph Marston',
          'It always seems impossible until it is done. - Nelson Mandela',
          'Small progress is still progress.',
          'Focus on being productive instead of busy. - Tim Ferriss',
          'The way to get started is to quit talking and begin doing. - Walt Disney',
          'Your time is limited, don\'t waste it living someone else\'s life. - Steve Jobs',
          'Believe you can and you\'re halfway there. - Theodore Roosevelt',
          'The mind is everything. What you think you become. - Buddha',
          'Strive not to be a success, but rather to be of value. - Albert Einstein',
          'The best time to plant a tree was 20 years ago. The second best time is now.',
          'You miss 100% of the shots you don\'t take. - Wayne Gretzky',
          'Everything you\'ve ever wanted is on the other side of fear. - George Addair',
          'Start where you are. Use what you have. Do what you can. - Arthur Ashe',
          'The only limit to our realization of tomorrow is our doubts of today. - FDR',
          'Act as if what you do makes a difference. It does. - William James',
        ]
        const quote = quotes[Math.floor(Math.random() * quotes.length)]
        addToast('info', quote, 8000)
        onClose()
      },
      category: 'action',
    },
    {
      id: 'run-diagnostics',
      name: t('diagnostics.runDiagnostics'),
      description: t('diagnostics.runDiagnosticsDesc'),
      icon: <Zap size={14} />,
      action: () => {
        // Open settings modal -- diagnostics is in About tab
        useUiStore.getState().openSettingsModal()
        onClose()
      },
      category: 'action',
    },
  ]
}

// The recent-folder rows live next door: this file is already past the
// decomposition line, and the newest group has no business growing it. It is
// re-exported here so the palette keeps one import surface for every group.
export { buildRecentFolderCommands } from './recentFolderCommands'
export type { RecentFolderCommandBuilderArgs } from './recentFolderCommands'

export function buildSlashCommands(args: Pick<CommandBuilderArgs, 't' | 'onClose' | 'onNewConversation' | 'onSendSlashCommand'>): PaletteCommand[] {
  const { t, onClose, onNewConversation, onSendSlashCommand } = args
  return [
    {
      id: 'slash-compact',
      name: '/compact',
      description: t('command.compactDesc'),
      icon: <Zap size={14} />,
      action: () => { onSendSlashCommand('/compact'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-clear',
      name: '/clear',
      description: t('command.clearConversationDesc'),
      icon: <Trash2 size={14} />,
      action: () => { onNewConversation(); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-help',
      name: '/help',
      description: t('command.showHelpDesc'),
      icon: <HelpCircle size={14} />,
      action: () => { onSendSlashCommand('/help'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-init',
      name: '/init',
      description: t('command.initDesc', { default: 'Initialize a new Claude project in the current directory' }),
      icon: <FileText size={14} />,
      action: () => { onSendSlashCommand('/init'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-doctor',
      name: '/doctor',
      description: t('command.doctorDesc', { default: 'Check Claude CLI installation and connectivity' }),
      icon: <Stethoscope size={14} />,
      action: () => { onSendSlashCommand('/doctor'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-rename',
      name: '/rename',
      description: t('command.renameDesc', { default: 'Rename the current conversation' }),
      icon: <Pencil size={14} />,
      action: () => { onSendSlashCommand('/rename'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-export',
      name: '/export',
      description: t('command.exportSlashDesc', { default: 'Export conversation to markdown or JSON' }),
      icon: <Download size={14} />,
      action: () => { onSendSlashCommand('/export'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-plan',
      name: '/plan',
      description: t('command.planDesc', { default: 'Plan mode — think before acting' }),
      icon: <BarChart2 size={14} />,
      action: () => { onSendSlashCommand('/plan'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-permissions',
      name: '/permissions',
      description: t('command.permissionsDesc', { default: 'View and manage tool permissions' }),
      icon: <Shield size={14} />,
      action: () => { onSendSlashCommand('/permissions'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-mcp',
      name: '/mcp',
      description: t('command.mcpDesc', { default: 'Model Context Protocol server management' }),
      icon: <Radio size={14} />,
      action: () => { onSendSlashCommand('/mcp'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-ai-engine',
      name: '/ai-engine',
      description: t('command.aiEngineDesc', { default: 'Open AI engine and provider settings' }),
      icon: <Cpu size={14} />,
      action: () => { onSendSlashCommand('/ai-engine'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-memory',
      name: '/memory',
      description: t('command.memorySlashDesc', { default: 'View and manage Claude memory files' }),
      icon: <Database size={14} />,
      action: () => { onSendSlashCommand('/memory'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-model',
      name: '/model',
      description: t('command.modelSlashDesc', { default: 'Switch the active model' }),
      icon: <Cpu size={14} />,
      action: () => { onSendSlashCommand('/model'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-cost',
      name: '/cost',
      description: t('command.costDesc', { default: 'Show token usage and cost for this session' }),
      icon: <DollarSign size={14} />,
      action: () => { onSendSlashCommand('/cost'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-skills',
      name: '/skills',
      description: t('command.skillsDesc', { default: 'List available Claude skills' }),
      icon: <Sparkles size={14} />,
      action: () => { onSendSlashCommand('/skills'); onClose() },
      category: 'slash',
    },
    {
      id: 'slash-rewind',
      name: '/rewind',
      description: t('command.rewindDesc', { default: 'Rewind to a previous message in the conversation' }),
      icon: <SkipBack size={14} />,
      action: () => { onSendSlashCommand('/rewind'); onClose() },
      category: 'slash',
    },
  ]
}

export function buildModelCommands(args: Pick<CommandBuilderArgs, 't' | 'onClose'>): PaletteCommand[] {
  const { t, onClose } = args
  return MODEL_OPTIONS.map(opt => ({
    id: `model-${opt.id}`,
    name: `${t('chat.switchModel')}: ${t(opt.labelKey)}`,
    description: opt.id,
    icon: <Cpu size={14} />,
    action: () => {
      usePrefsStore.getState().setPrefs({ model: opt.id })
      window.electronAPI.prefsSet('model', opt.id)
      useUiStore.getState().addToast('success', t('chat.modelSwitched', { model: t(opt.labelKey) }))
      onClose()
    },
    category: 'model' as const,
  }))
}

export function buildPersonaCommands(args: Pick<CommandBuilderArgs, 't' | 'onClose'>): PaletteCommand[] {
  const { t, onClose } = args
  const personas = usePrefsStore.getState().prefs.personas || []
  const sessionPersonaId = useChatStore.getState().sessionPersonaId
  const cmds: PaletteCommand[] = []

  if (personas.length === 0) return cmds

  if (sessionPersonaId) {
    cmds.push({
      id: 'persona-none',
      name: `${t('persona.selectPersona')}: ${t('persona.noPersona')}`,
      description: t('persona.deactivated'),
      icon: <Sparkles size={14} />,
      action: () => {
        useChatStore.getState().setSessionPersonaId(undefined)
        usePrefsStore.getState().setPrefs({ systemPrompt: '', outputStyle: 'default' })
        window.electronAPI.prefsSet('systemPrompt', '')
        window.electronAPI.prefsSet('outputStyle', 'default')
        useUiStore.getState().addToast('info', t('persona.deactivated'))
        onClose()
      },
      category: 'persona',
    })
  }

  for (const p of personas) {
    cmds.push({
      id: `persona-${p.id}`,
      name: `${t('persona.selectPersona')}: ${p.emoji} ${p.name}`,
      description: MODEL_OPTIONS.find(m => m.id === p.model)?.labelKey ? t(MODEL_OPTIONS.find(m => m.id === p.model)!.labelKey) : p.model,
      icon: <Sparkles size={14} />,
      action: () => {
        const resolvedPrompt = p.presetKey ? t(`persona.presetPrompt.${p.presetKey}`) : p.systemPrompt
        useChatStore.getState().setSessionPersonaId(p.id)
        usePrefsStore.getState().setPrefs({
          model: p.model,
          systemPrompt: resolvedPrompt,
          outputStyle: p.outputStyle || 'default',
        })
        window.electronAPI.prefsSet('model', p.model)
        window.electronAPI.prefsSet('systemPrompt', resolvedPrompt)
        window.electronAPI.prefsSet('outputStyle', p.outputStyle || 'default')
        useUiStore.getState().addToast('success', t('persona.switchedTo', { name: p.presetKey ? t(`persona.preset.${p.presetKey}`) : p.name }))
        onClose()
      },
      category: 'persona',
    })
  }

  return cmds
}

export function buildSessionCommands(args: Pick<CommandBuilderArgs, 't' | 'onClose' | 'sessions' | 'resolvedLocale'>): PaletteCommand[] {
  const { t, onClose, sessions, resolvedLocale } = args
  const recentSessions = [...sessions]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20)

  return recentSessions.map(session => {
    const title = session.title || `Session ${session.sessionId.slice(0, 8)}...`
    const dateStr = formatDateMedium(resolvedLocale, session.timestamp)
    return {
      id: `session-${session.sessionId}`,
      name: title,
      description: t('command.openSessionFrom', { date: dateStr }),
      icon: <History size={14} />,
      action: () => {
        window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: session.sessionId }))
        onClose()
      },
      category: 'session' as const,
    }
  })
}

export function buildWorkflowCommands(args: Pick<CommandBuilderArgs, 't' | 'onClose' | 'addToQueue' | 'addToast'>): PaletteCommand[] {
  const { t, onClose, addToQueue, addToast } = args
  const workflows = usePrefsStore.getState().prefs.workflows || []
  return workflows.map(wf => ({
    id: `workflow-${wf.id}`,
    name: `${t('command.runWorkflow')}: ${wf.icon} ${wf.name}`,
    description: `${wf.steps.length} ${t('workflow.stepsLabel')} — ${wf.description || t('command.runWorkflowDesc')}`,
    icon: <Play size={14} />,
    action: () => {
      const { entries } = getWorkflowQueuePlan(wf, t)
      if (entries.length === 0) {
        addToast('info', t('workflow.nothingToRun'))
        onClose()
        return
      }
      for (const entry of entries) {
        addToQueue(entry.prompt)
      }
      addToast('success', t('workflow.running', { name: wf.name, count: String(entries.length) }))
      onClose()
    },
    category: 'workflow' as const,
  }))
}

/**
 * Snippets as palette rows, beside Personas and Workflows — the palette already
 * indexes pref-backed entities, so a snippet list that could only be found in
 * Settings would be the odd one out.
 *
 * The action reuses the composer's own `aipa:insertText` event (the path the
 * file browser and plugin host use), so a snippet inserts exactly where `::`
 * would have expanded it. That listener only exists while ChatPanel is
 * mounted; when the palette is opened from Settings, the row copies the text
 * instead of firing an event nobody hears, and says so in the toast.
 */
export function buildSnippetCommands(args: Pick<CommandBuilderArgs, 't' | 'onClose' | 'addToast'>): PaletteCommand[] {
  const { t, onClose, addToast } = args
  const snippets = usePrefsStore.getState().prefs.textSnippets || []
  return snippets.map(snippet => ({
    id: `snippet-${snippet.id}`,
    name: `::${snippet.keyword}`,
    description: snippet.content.replace(/\s+/g, ' ').trim().slice(0, 120),
    icon: <Type size={14} />,
    category: 'snippet' as const,
    action: () => {
      onClose()
      const composer = typeof document !== 'undefined'
        ? document.querySelector('.chat-textarea')
        : null
      if (composer) {
        window.dispatchEvent(new CustomEvent('aipa:insertText', { detail: snippet.content }))
        return
      }
      navigator.clipboard.writeText(snippet.content)
        .then(() => addToast('success', t('command.snippetCopied', { keyword: snippet.keyword })))
        .catch(() => addToast('error', t('command.snippetCopyFailed')))
    },
  }))
}

export interface TrashCommandBuilderArgs {
  t: CommandBuilderArgs['t']
  onClose: () => void
  /**
   * Rows in the holding area. `null` means the probe could not answer, which
   * hides the entry: "I could not check" is not "there is something".
   */
  trashCount: number | null
}

/**
 * Jump to Employees → "Recently deleted". Hidden rather than disabled when the
 * holding area is empty: the section renders nothing in that case, so the row
 * would promise a page that has nothing on it and no anchor to scroll to.
 */
export function buildTrashCommands({ t, onClose, trashCount }: TrashCommandBuilderArgs): PaletteCommand[] {
  const entry = buildTrashPaletteEntry(t, trashCount)
  if (!entry) return []
  return [{
    id: entry.id,
    name: entry.name,
    description: entry.description,
    icon: <Trash2 size={14} />,
    action: () => {
      // The store action goes through the same nav resolver as the 'skills'
      // entry point and adds the section request the page scrolls to.
      useUiStore.getState().openEmployeesSection('trash')
      onClose()
    },
    category: 'action',
  }]
}

export interface ApprovalCommandBuilderArgs {
  t: Translate
  onClose: () => void
  /**
   * The same probe the automation rows use. `null` means it could not answer,
   * which must leave the group out entirely rather than print an empty heading.
   */
  jobs: AutomationJobData[] | null
}

/**
 * Live permission waits as palette rows (wave 77C).
 *
 * One row per held request, not per job: answering is per request id, and a
 * row that named a job would hide that. The row opens the background-work
 * panel focused on that request — the palette cannot answer it, and must not
 * pretend to. Nothing here offers an "always allow": a request is answered
 * once, by the panel's own two buttons.
 */
export function buildApprovalCommands({
  t, onClose, jobs,
}: ApprovalCommandBuilderArgs): PaletteCommand[] {
  const waits = approvalPaletteRows(jobs)
  if (waits.length === 0) return []

  const now = Date.now()
  return waits.map(({ job, wait }) => ({
    id: `approval-${job.id}-${wait.requestId}`,
    name: job.name,
    description: t('command.waitingApprovals.description', {
      time: formatDuration(Math.max(0, now - wait.since)),
    }),
    icon: <Hourglass size={14} />,
    category: 'approval' as const,
    action: () => {
      onClose()
      dispatchApprovalFocus({ jobId: job.id, requestId: wait.requestId })
    },
  }))
}

export interface RunActivityCommandBuilderArgs {
  t: Translate
  onClose: () => void
  /** `null` = the probe failed or has not answered; `[]` = no jobs at all. */
  jobs: AutomationJobData[] | null
}

/**
 * The one row that opens the cross-job run list.
 *
 * It vanishes when there is not a single remembered run to show — the same rule
 * the trash and approval groups follow. A row that opened an empty page would
 * promise history that does not exist; the status-bar popover keeps its own
 * entry point because that is where a reader notices something ran.
 */
export function buildRunActivityCommands({
  t, onClose, jobs,
}: RunActivityCommandBuilderArgs): PaletteCommand[] {
  if (!jobs) return []
  const remembered = jobs.reduce((sum, job) => sum + (Array.isArray(job.history) ? job.history.length : 0), 0)
  if (remembered === 0) return []
  return [{
    id: 'open-run-activity',
    name: t('command.runActivity'),
    description: t('command.runActivityDesc'),
    icon: <ListChecks size={14} />,
    category: 'automation',
    action: () => {
      // Both entry points go through the store action, so the status bar and
      // the palette cannot land on two different pages.
      useUiStore.getState().openRunActivity()
      onClose()
    },
  }]
}

export interface AutomationCommandBuilderArgs {
  /** Wider than `CommandBuilderArgs['t']`: `scheduleText` passes numeric params. */
  t: Translate
  onClose: () => void
  addToast: CommandBuilderArgs['addToast']
  /** `null` = the probe failed or has not answered; `[]` = the probe succeeded, no jobs. */
  jobs: AutomationJobData[] | null
  resolvedLocale: AppLocale
}

/**
 * Scheduled jobs as a jump-and-trigger surface: open the last run, start one
 * now, or land on the page that manages the job. Creation, editing and
 * deletion stay in Settings — the palette would duplicate that list otherwise.
 */
export function buildAutomationCommands(args: AutomationCommandBuilderArgs): PaletteCommand[] {
  const { t, onClose, addToast, jobs, resolvedLocale } = args
  // A failed probe must not leave an empty "Automations" header behind.
  if (!jobs || jobs.length === 0) return []

  // The descriptor builder owns the next-occurrence wording now; it needs the
  // resolved locale (so the timestamp matches Settings) and one clock reading
  // for the whole list — not React context, which would make the builder
  // untestable. Only those two plain values cross the boundary.
  const built = buildAutomationDescriptors(jobs, t, resolvedLocale, Date.now())

  const runNow = async (job: AutomationJobData) => {
    // The row is only built for an idle job, but the list behind an open
    // palette can be a few seconds old. Refusing here is what keeps a second
    // start from being sent while the scheduler is already working.
    if (!canRunAutomation(job)) return
    try {
      const result = await window.electronAPI.automationRunNow(job.id)
      // Success is not announced: the scheduler's `automation:changed` is the
      // state, and the palette has already closed by the time it lands.
      if (!result.ok) {
        addToast('error', t('automation.errors.runFailed', { error: errorCodeText(result.error, t) }))
      }
    } catch (err) {
      addToast('error', t('automation.errors.runFailed', { error: String(err) }))
    }
  }

  return built.map(descriptor => {
    const job = descriptor.job
    const icon = descriptor.kind === 'run'
      ? <Play size={14} />
      : descriptor.kind === 'manage'
        ? <Settings size={14} />
        : <ExternalLink size={14} />

    return {
      id: descriptor.id,
      name: descriptor.name,
      description: descriptor.description,
      icon,
      category: 'automation' as const,
      action: () => {
        if (descriptor.kind === 'open') {
          if (!job.lastSessionId) return
          // A bare session id: the app-level bridge resolves it and closes any
          // overlay, so the palette does not need to know how sessions open.
          window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: job.lastSessionId }))
          onClose()
          return
        }
        if (descriptor.kind === 'run') {
          onClose()
          void runNow(job)
          return
        }
        useUiStore.getState().openSettingsAt('automations')
        onClose()
      },
    }
  })
}
