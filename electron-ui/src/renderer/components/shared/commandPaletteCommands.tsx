// Command palette command definitions — extracted from CommandPalette.tsx (Iteration 315)

import React from 'react'
import {
  Plus, Download, PanelLeft, Terminal, Settings, History,
  FolderOpen, Zap, Trash2, HelpCircle, Cpu, Sparkles,
  Brain, Workflow, Play, NotebookPen, ClipboardPaste, Radio,
  Sun, Moon, Languages, Copy, Pin,
} from 'lucide-react'
import { useChatStore, useSessionStore, useUiStore, usePrefsStore } from '../../store'
import type { SidebarTab, NavItem } from '../../store'
import { MODEL_OPTIONS } from '../settings/settingsConstants'
import type { SessionListItem } from '../../types/app.types'

export interface PaletteCommand {
  id: string
  name: string
  description: string
  icon?: React.ReactNode
  shortcut?: string
  action: () => void
  category: 'action' | 'slash' | 'session' | 'model' | 'persona' | 'workflow'
}

interface CommandBuilderArgs {
  t: (key: string, params?: Record<string, string>) => string
  onClose: () => void
  onExport: () => void
  onNewConversation: () => void
  onSendSlashCommand: (cmd: string) => void
  toggleSidebar: () => void
  toggleTerminal: () => void
  setSidebarTab: (tab: SidebarTab) => void
  setSidebarOpen: (open: boolean) => void
  setActiveNavItem: (item: NavItem) => void
  addToQueue: (text: string) => void
  addToast: (type: 'success' | 'error' | 'info' | 'warning', msg: string, duration?: number) => void
  sessions: SessionListItem[]
}

export function buildActionCommands(args: CommandBuilderArgs): PaletteCommand[] {
  const {
    t, onClose, onExport, onNewConversation, onSendSlashCommand,
    toggleSidebar, toggleTerminal, setSidebarTab, setSidebarOpen, setActiveNavItem, addToast,
  } = args

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
      id: 'toggle-terminal',
      name: t('command.toggleTerminal'),
      description: t('command.toggleTerminalDesc'),
      icon: <Terminal size={14} />,
      shortcut: 'Ctrl+`',
      action: () => {
        // Set resume session ID so terminal opens with current chat context
        const chatStore = useChatStore.getState()
        const ui = useUiStore.getState()
        if (chatStore.currentSessionId && !ui.terminalOpen) {
          ui.setTerminalResumeSessionId(chatStore.currentSessionId)
        }
        toggleTerminal()
        onClose()
      },
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
      id: 'open-channel',
      name: t('command.openChannel'),
      description: t('command.openChannelDesc'),
      icon: <Radio size={14} />,
      shortcut: 'Ctrl+7',
      action: () => { setActiveNavItem('channel'); onClose() },
      category: 'action',
    },
    {
      id: 'change-working-dir',
      name: t('command.changeWorkingDir'),
      description: t('command.changeWorkingDirDesc'),
      icon: <FolderOpen size={14} />,
      action: async () => {
        onClose()
        const p = await window.electronAPI.fsShowOpenDialog()
        if (p) {
          useChatStore.getState().setWorkingDir(p)
          window.electronAPI.prefsSet('workingDir', p)
        }
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
    // Toggle commands
    {
      id: 'toggle-theme',
      name: t('command.toggleTheme'),
      description: t('command.toggleThemeDesc'),
      icon: (usePrefsStore.getState().prefs.theme || 'vscode') === 'light' ? <Moon size={14} /> : <Sun size={14} />,
      shortcut: 'Ctrl+Shift+D',
      action: () => {
        const cur = usePrefsStore.getState().prefs.theme || 'vscode'
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
  ]
}

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
  const activePersonaId = usePrefsStore.getState().prefs.activePersonaId
  const cmds: PaletteCommand[] = []

  if (personas.length === 0) return cmds

  if (activePersonaId) {
    cmds.push({
      id: 'persona-none',
      name: `${t('persona.selectPersona')}: ${t('persona.noPersona')}`,
      description: t('persona.deactivated'),
      icon: <Sparkles size={14} />,
      action: () => {
        usePrefsStore.getState().setPrefs({ activePersonaId: undefined, systemPrompt: '', responseTone: 'default' })
        window.electronAPI.prefsSet('activePersonaId', undefined)
        window.electronAPI.prefsSet('systemPrompt', '')
        window.electronAPI.prefsSet('responseTone', 'default')
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
        usePrefsStore.getState().setPrefs({
          activePersonaId: p.id,
          model: p.model,
          systemPrompt: p.systemPrompt,
          responseTone: p.responseTone || 'default',
        })
        window.electronAPI.prefsSet('activePersonaId', p.id)
        window.electronAPI.prefsSet('model', p.model)
        window.electronAPI.prefsSet('systemPrompt', p.systemPrompt)
        window.electronAPI.prefsSet('responseTone', p.responseTone || 'default')
        useUiStore.getState().addToast('success', t('persona.switchedTo', { name: p.name }))
        onClose()
      },
      category: 'persona',
    })
  }

  return cmds
}

export function buildSessionCommands(args: Pick<CommandBuilderArgs, 't' | 'onClose' | 'sessions'>): PaletteCommand[] {
  const { t, onClose, sessions } = args
  const recentSessions = [...sessions]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20)

  return recentSessions.map(session => {
    const title = session.title || `Session ${session.sessionId.slice(0, 8)}...`
    const dateStr = new Date(session.timestamp).toLocaleDateString()
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
      for (const step of wf.steps) {
        addToQueue(step.prompt)
      }
      addToast('success', t('workflow.running', { name: wf.name, count: String(wf.steps.length) }))
      onClose()
    },
    category: 'workflow' as const,
  }))
}
