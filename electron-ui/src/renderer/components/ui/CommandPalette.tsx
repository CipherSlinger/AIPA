// CommandPalette — Ctrl+K command palette with session search and quick actions
// Mounted in App.tsx; state managed via useUiStore.commandPaletteOpen

;(function ensureCPKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById('cp-kf')) return
  const s = document.createElement('style')
  s.id = 'cp-kf'
  s.textContent = `
    @keyframes cp-fadeIn  { from { opacity: 0 } to { opacity: 1 } }
    @keyframes cp-slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-10px) } to { opacity: 1; transform: translateX(-50%) translateY(0) } }
  `
  document.head.appendChild(s)
})()

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useChatStore, useSessionStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import {
  buildActionCommands,
  buildSlashCommands,
  buildModelCommands,
  buildPersonaCommands,
  buildSessionCommands,
  buildWorkflowCommands,
  type PaletteCommand,
} from '../shared/commandPaletteCommands'

interface Props {
  onClose: () => void
  onExport: () => void
  onNewConversation: () => void
  onSendSlashCommand: (cmd: string) => void
}

// Category display config
const CATEGORY_LABELS: Record<PaletteCommand['category'], string> = {
  action: 'Actions',
  session: 'Recent Sessions',
  model: 'Models',
  persona: 'Personas',
  slash: 'Slash Commands',
  workflow: 'Workflows',
}

const CATEGORY_ORDER: PaletteCommand['category'][] = [
  'session', 'action', 'slash', 'workflow', 'model', 'persona',
]

export default function CommandPalette({
  onClose,
  onExport,
  onNewConversation,
  onSendSlashCommand,
}: Props) {
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

  // Build all commands
  const commands = useMemo<PaletteCommand[]>(() => {
    const args = {
      t, onClose, onExport, onNewConversation, onSendSlashCommand,
      toggleSidebar, setSidebarTab, setSidebarOpen, setActiveNavItem,
      addToQueue, addToast, sessions,
    }
    return [
      ...buildSessionCommands(args),
      ...buildActionCommands(args),
      ...buildSlashCommands(args),
      ...buildWorkflowCommands(args),
      ...buildModelCommands(args),
      ...buildPersonaCommands(args),
    ]
  }, [
    onClose, onExport, onNewConversation, onSendSlashCommand,
    toggleSidebar, setSidebarTab, setSidebarOpen, setActiveNavItem,
    addToQueue, addToast, sessions, t,
  ])

  // Filter by query
  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    )
  }, [commands, query])

  // Group filtered results by category (preserving order)
  const grouped = useMemo(() => {
    if (query.trim()) return null // flat list when searching
    const map = new Map<PaletteCommand['category'], PaletteCommand[]>()
    for (const cmd of commands) {
      if (!map.has(cmd.category)) map.set(cmd.category, [])
      map.get(cmd.category)!.push(cmd)
    }
    // Only include non-empty categories in CATEGORY_ORDER
    return CATEGORY_ORDER
      .filter(cat => map.has(cat) && map.get(cat)!.length > 0)
      .map(cat => ({ category: cat, items: map.get(cat)! }))
  }, [commands, query])

  // Reset selection on filter change
  useEffect(() => { setSelectedIndex(0) }, [query])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const items = list.querySelectorAll('[data-cp-item]')
    const sel = items[selectedIndex] as HTMLElement | undefined
    if (sel) sel.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const executeSelected = useCallback(() => {
    const cmd = filtered[selectedIndex]
    if (cmd) cmd.action()
  }, [filtered, selectedIndex])

  // Click outside to close
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose()
  }, [onClose])

  // Keyboard navigation (on the wrapper div, not window, to respect focus trap)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        executeSelected()
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filtered.length, executeSelected, onClose])

  // Render a single command row
  const renderItem = (cmd: PaletteCommand, index: number) => {
    const isSelected = index === selectedIndex
    return (
      <div
        key={cmd.id}
        data-cp-item
        onClick={() => cmd.action()}
        onMouseEnter={() => setSelectedIndex(index)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          cursor: 'pointer',
          background: isSelected ? 'rgba(99,102,241,0.14)' : 'transparent',
          borderLeft: isSelected ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
          transition: 'all 0.15s ease',
        }}
      >
        {/* Icon */}
        <span
          style={{
            color: isSelected ? '#818cf8' : 'var(--text-secondary)',
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

        {/* Label + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: isSelected ? '#a5b4fc' : 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            {cmd.name}
          </div>
          {cmd.description && (
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
          )}
        </div>

        {/* Shortcut badge */}
        {cmd.shortcut && (
          <kbd
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginLeft: 'auto',
              background: 'var(--border)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              padding: '2px 6px',
              fontFamily: 'monospace',
              flexShrink: 0,
            }}
          >
            {cmd.shortcut}
          </kbd>
        )}

        {/* Category badge (search mode) */}
        {query.trim() && !cmd.shortcut && cmd.category !== 'action' && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginLeft: 'auto',
              flexShrink: 0,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '1px 5px',
            }}
          >
            {cmd.category}
          </span>
        )}
      </div>
    )
  }

  // Build flat index for keyboard navigation across grouped view
  const flatItems = grouped
    ? grouped.flatMap(g => g.items)
    : filtered

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'var(--glass-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'cp-fadeIn 0.15s ease',
      }}
    >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 600,
          maxWidth: '90vw',
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 8px 24px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'cp-slideDown 0.18s ease',
        }}
      >
        {/* Search bar */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('command.searchPlaceholder')}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 15,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            maxHeight: 380,
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border) transparent',
          }}
        >
          {flatItems.length === 0 && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '24px 16px',
              }}
            >
              {t('command.noResults')}
            </div>
          )}

          {/* Grouped view (no query) */}
          {!query.trim() && grouped && grouped.map(({ category, items }) => (
            <div key={category}>
              <div
                style={{
                  padding: '8px 16px 4px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                {CATEGORY_LABELS[category]}
              </div>
              {items.map(cmd => {
                const globalIndex = flatItems.indexOf(cmd)
                return renderItem(cmd, globalIndex)
              })}
            </div>
          ))}

          {/* Flat search results */}
          {query.trim() && filtered.map((cmd, index) => renderItem(cmd, index))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 12,
            fontSize: 10,
            color: 'var(--text-muted)',
            alignItems: 'center',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={kbdStyle}>↑↓</kbd>
            {t('command.arrowKeysHint')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={kbdStyle}>↵</kbd>
            {t('command.enterHint')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={kbdStyle}>Esc</kbd>
            {t('command.escHint')}
          </span>
        </div>
      </div>
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  background: 'var(--border)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  padding: '1px 5px',
  fontSize: 9,
  fontFamily: 'monospace',
  fontWeight: 700,
  letterSpacing: '0.07em',
}
