import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Download, PanelLeft, Terminal, Settings, History,
  FolderOpen, Zap, Trash2, HelpCircle, Search, Cpu,
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
  category: 'action' | 'slash' | 'session' | 'model'
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
    setSidebarOpen,
  } = useUiStore()

  const { sessions } = useSessionStore()

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

    return cmds
  }, [onClose, onExport, onNewConversation, onSendSlashCommand, toggleSidebar, toggleTerminal, setSidebarTab, setSidebarOpen, sessions, t])

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
                  color: cmd.category === 'slash' ? 'var(--warning)' : cmd.category === 'session' ? 'var(--success)' : cmd.category === 'model' ? '#8b5cf6' : 'var(--accent)',
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
              {(cmd.category === 'slash' || cmd.category === 'session' || cmd.category === 'model') && (
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
                  {cmd.category === 'slash' ? 'slash' : cmd.category === 'model' ? 'model' : 'session'}
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
