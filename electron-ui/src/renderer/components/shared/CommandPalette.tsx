import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Download, PanelLeft, Terminal, Settings, History,
  FolderOpen, Zap, Trash2, HelpCircle, Search, Cpu, Sparkles,
  Brain, Workflow, Clock, ListRestart, Play, NotebookPen, ClipboardPaste,
  Sun, Moon, Languages, Palette, Copy,
} from 'lucide-react'
import { useChatStore, useSessionStore, useUiStore, usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { MODEL_OPTIONS } from '../settings/settingsConstants'

interface PaletteCommand {
  id: string
  name: string
  description: string
  icon?: React.ReactNode
  shortcut?: string
  action: () => void
  category: 'action' | 'slash' | 'session' | 'model' | 'persona' | 'workflow'
}

interface CommandPaletteProps {
  onClose: () => void
  onExport: () => void
  onNewConversation: () => void
  onSendSlashCommand: (cmd: string) => void
}

export default function CommandPalette({
  onClose,
  onExport,
  onNewConversation,
  onSendSlashCommand,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const focusTrapRef = useFocusTrap(true)
  const t = useT()

  const {
    toggleSidebar, toggleTerminal, setSidebarTab,
    setSidebarOpen, setActiveNavItem, addToast,
  } = useUiStore()

  const { sessions } = useSessionStore()
  const addToQueue = useChatStore(s => s.addToQueue)

  // Build command list
  const commands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = [
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
        action: () => { toggleTerminal(); onClose() },
        category: 'action',
      },
      {
        id: 'open-settings',
        name: t('command.openSettings'),
        description: t('command.openSettingsDesc'),
        icon: <Settings size={14} />,
        shortcut: 'Ctrl+,',
        action: () => { setSidebarOpen(true); setSidebarTab('settings'); onClose() },
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
        id: 'open-memory',
        name: t('command.openMemory'),
        description: t('command.openMemoryDesc'),
        icon: <Brain size={14} />,
        shortcut: 'Ctrl+6',
        action: () => { setActiveNavItem('memory'); onClose() },
        category: 'action',
      },
      {
        id: 'open-workflows',
        name: t('command.openWorkflows'),
        description: t('command.openWorkflowsDesc'),
        icon: <Workflow size={14} />,
        shortcut: 'Ctrl+7',
        action: () => { setActiveNavItem('workflows'); onClose() },
        category: 'action',
      },
      {
        id: 'open-schedules',
        name: t('command.openSchedules'),
        description: t('command.openSchedulesDesc'),
        icon: <Clock size={14} />,
        shortcut: 'Ctrl+8',
        action: () => { setActiveNavItem('schedules'); onClose() },
        category: 'action',
      },
      {
        id: 'open-prompthistory',
        name: t('command.openPromptHistory'),
        description: t('command.openPromptHistoryDesc'),
        icon: <ListRestart size={14} />,
        shortcut: 'Ctrl+9',
        action: () => { setActiveNavItem('prompthistory'); onClose() },
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
      // Model switching commands
      ...MODEL_OPTIONS.map(opt => ({
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
      })),
      // Persona switching commands
      ...(() => {
        const personas = usePrefsStore.getState().prefs.personas || []
        const activePersonaId = usePrefsStore.getState().prefs.activePersonaId
        const personaCmds: PaletteCommand[] = []
        if (personas.length > 0) {
          // Deactivate persona command
          if (activePersonaId) {
            personaCmds.push({
              id: 'persona-none',
              name: `${t('persona.selectPersona')}: ${t('persona.noPersona')}`,
              description: t('persona.deactivated'),
              icon: <Sparkles size={14} />,
              action: () => {
                usePrefsStore.getState().setPrefs({ activePersonaId: undefined, systemPrompt: '' })
                window.electronAPI.prefsSet('activePersonaId', undefined)
                window.electronAPI.prefsSet('systemPrompt', '')
                useUiStore.getState().addToast('info', t('persona.deactivated'))
                onClose()
              },
              category: 'persona' as const,
            })
          }
          // Each persona
          for (const p of personas) {
            personaCmds.push({
              id: `persona-${p.id}`,
              name: `${t('persona.selectPersona')}: ${p.emoji} ${p.name}`,
              description: MODEL_OPTIONS.find(m => m.id === p.model)?.labelKey ? t(MODEL_OPTIONS.find(m => m.id === p.model)!.labelKey) : p.model,
              icon: <Sparkles size={14} />,
              action: () => {
                usePrefsStore.getState().setPrefs({
                  activePersonaId: p.id,
                  model: p.model,
                  systemPrompt: p.systemPrompt,
                })
                window.electronAPI.prefsSet('activePersonaId', p.id)
                window.electronAPI.prefsSet('model', p.model)
                window.electronAPI.prefsSet('systemPrompt', p.systemPrompt)
                useUiStore.getState().addToast('success', t('persona.switchedTo', { name: p.name }))
                onClose()
              },
              category: 'persona' as const,
            })
          }
        }
        return personaCmds
      })(),
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
      // Slash commands
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

    // Add session items for quick session switching
    const recentSessions = [...sessions]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20) // show up to 20 most recent sessions

    for (const session of recentSessions) {
      const title = session.title || `Session ${session.sessionId.slice(0, 8)}...`
      const dateStr = new Date(session.timestamp).toLocaleDateString()
      cmds.push({
        id: `session-${session.sessionId}`,
        name: title,
        description: t('command.openSessionFrom', { date: dateStr }),
        icon: <History size={14} />,
        action: () => {
          window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: session.sessionId }))
          onClose()
        },
        category: 'session',
      })
    }

    // Add workflow run commands
    const workflows = usePrefsStore.getState().prefs.workflows || []
    for (const wf of workflows) {
      cmds.push({
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
        category: 'workflow',
      })
    }

    return cmds
  }, [onClose, onExport, onNewConversation, onSendSlashCommand, toggleSidebar, toggleTerminal, setSidebarTab, setSidebarOpen, setActiveNavItem, addToQueue, addToast, sessions, t])

  // Filter commands by query
  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    )
  }, [commands, query])

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const items = list.querySelectorAll('[data-palette-item]')
    const selected = items[selectedIndex] as HTMLElement | undefined
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[selectedIndex]) {
            filtered[selectedIndex].action()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [filtered, selectedIndex, onClose]
  )

  // Click outside to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onClose()
      }
    },
    [onClose]
  )

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 80,
      }}
    >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('command.searchPlaceholder')}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          maxWidth: 500,
          maxHeight: 400,
          background: 'var(--popup-bg)',
          border: '1px solid var(--popup-border)',
          borderRadius: 8,
          boxShadow: 'var(--popup-shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          alignSelf: 'flex-start',
        }}
      >
        {/* Search input */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('command.searchPlaceholder')}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Command list */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              {t('command.noResults')}
            </div>
          )}
          {filtered.map((cmd, index) => (
            <div
              key={cmd.id}
              data-palette-item
              onClick={() => cmd.action()}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                background: index === selectedIndex ? 'var(--popup-item-hover)' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <span
                style={{
                  color: cmd.category === 'slash' ? 'var(--warning)' : cmd.category === 'session' ? 'var(--success)' : cmd.category === 'model' ? '#8b5cf6' : cmd.category === 'workflow' ? '#10b981' : 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  width: 20,
                  justifyContent: 'center',
                }}
              >
                {cmd.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cmd.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cmd.description}
                </div>
              </div>
              {cmd.shortcut && (
                <kbd
                  style={{
                    fontSize: 9,
                    color: 'var(--text-muted)',
                    background: 'var(--action-btn-bg)',
                    border: '1px solid var(--border)',
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontFamily: 'monospace',
                    flexShrink: 0,
                  }}
                >
                  {cmd.shortcut}
                </kbd>
              )}
              {(cmd.category === 'slash' || cmd.category === 'session' || cmd.category === 'model' || cmd.category === 'workflow') && (
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--text-muted)',
                    background: 'var(--bg-input)',
                    padding: '1px 6px',
                    borderRadius: 3,
                    flexShrink: 0,
                  }}
                >
                  {cmd.category === 'slash' ? 'slash' : cmd.category === 'model' ? 'model' : cmd.category === 'workflow' ? 'workflow' : 'session'}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: '6px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 12,
            fontSize: 10,
            color: 'var(--text-muted)',
          }}
        >
          <span>{t('command.arrowKeysHint')}</span>
          <span>{t('command.enterHint')}</span>
          <span>{t('command.escHint')}</span>
        </div>
      </div>
    </div>
  )
}
