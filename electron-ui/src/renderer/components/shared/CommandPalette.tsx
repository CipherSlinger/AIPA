// CommandPalette — thin orchestrator after Iteration 315 decomposition
// Command definitions extracted to commandPaletteCommands.tsx

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useChatStore, useSessionStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import {
  PaletteCommand,
  buildActionCommands,
  buildSlashCommands,
  buildModelCommands,
  buildPersonaCommands,
  buildSessionCommands,
  buildWorkflowCommands,
} from './commandPaletteCommands'

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
    toggleSidebar, setSidebarTab,
    setSidebarOpen, setActiveNavItem, addToast,
  } = useUiStore()

  const { sessions } = useSessionStore()
  const addToQueue = useChatStore(s => s.addToQueue)

  // Build command list from extracted builders
  const commands = useMemo<PaletteCommand[]>(() => {
    const args = {
      t, onClose, onExport, onNewConversation, onSendSlashCommand,
      toggleSidebar, setSidebarTab, setSidebarOpen, setActiveNavItem,
      addToQueue, addToast, sessions,
    }
    return [
      ...buildActionCommands(args),
      ...buildModelCommands(args),
      ...buildPersonaCommands(args),
      ...buildSlashCommands(args),
      ...buildSessionCommands(args),
      ...buildWorkflowCommands(args),
    ]
  }, [onClose, onExport, onNewConversation, onSendSlashCommand, toggleSidebar, setSidebarTab, setSidebarOpen, setActiveNavItem, addToQueue, addToast, sessions, t])

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
