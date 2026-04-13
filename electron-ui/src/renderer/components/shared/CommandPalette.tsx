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
        background: 'rgba(0,0,0,0.70)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('command.searchPlaceholder')}
        onKeyDown={handleKeyDown}
        style={{
          background: 'rgba(15,15,25,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          width: '100%',
          maxWidth: 560,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <Search size={17} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('command.searchPlaceholder')}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 17,
              color: 'rgba(255,255,255,0.82)',
              fontFamily: 'inherit',
              letterSpacing: '-0.01em',
            }}
          />
        </div>

        {/* Command list */}
        <div
          ref={listRef}
          style={{
            maxHeight: 380,
            overflowY: 'auto',
            padding: '6px',
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.38)',
                textAlign: 'center',
                padding: '24px 16px',
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
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                background: index === selectedIndex ? 'rgba(99,102,241,0.25)' : 'transparent',
                borderLeft: index === selectedIndex ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <span
                style={{
                  color: index === selectedIndex ? '#818cf8' : 'rgba(255,255,255,0.60)',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  width: 16,
                  height: 16,
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                {cmd.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: index === selectedIndex ? '#a5b4fc' : 'rgba(255,255,255,0.82)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {cmd.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.45)',
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
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.45)',
                    marginLeft: 'auto',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 5,
                    padding: '2px 6px',
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
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.38)',
                    marginLeft: cmd.shortcut ? 0 : 'auto',
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 4,
                    padding: '1px 5px',
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
            display: 'flex',
            gap: 12,
            padding: '8px 16px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.38)',
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
