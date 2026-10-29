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
import { useChatStore, usePrefsStore, useSessionStore, useUiStore } from '../../store'
import { useI18n } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import {
  buildActionCommands,
  buildSlashCommands,
  buildModelCommands,
  buildPersonaCommands,
  buildSessionCommands,
  buildWorkflowCommands,
  buildAutomationCommands,
  buildApprovalCommands,
  buildTrashCommands,
  type PaletteCommand,
} from '../shared/commandPaletteCommands'
import { normalizeTrashedWorkflows } from '../../lib/workflowTrash'
import { countTrashedItems } from '../../lib/trashPresence'
import type { AutomationJobData } from '../../../preload'

interface Props {
  onClose: () => void
  onExport: () => void
  onNewConversation: () => void
  onSendSlashCommand: (cmd: string) => void
}

// Category display config. `automation` is absent because its header is
// localized through `automation.title`, the same string the Settings tab uses;
// `approval` is localized too, because "waiting for you" must read as an ask.
const CATEGORY_LABELS: Record<Exclude<PaletteCommand['category'], 'automation' | 'approval'>, string> = {
  action: 'Actions',
  session: 'Recent Sessions',
  model: 'Models',
  persona: 'Personas',
  slash: 'Slash Commands',
  workflow: 'Workflows',
}

// A live wait is the only row in this list where the app is stopped and the
// user is what it is waiting for, so it leads.
const CATEGORY_ORDER: PaletteCommand['category'][] = [
  'approval', 'session', 'automation', 'action', 'slash', 'workflow', 'model', 'persona',
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
  const { t, resolvedLocale } = useI18n()

  // PERF: per-field selectors — a bare useUiStore()/useSessionStore() subscribes
  // to the whole slice and re-renders the palette on every unrelated state change.
  const toggleSidebar = useUiStore(s => s.toggleSidebar)
  const setSidebarTab = useUiStore(s => s.setSidebarTab)
  const setSidebarOpen = useUiStore(s => s.setSidebarOpen)
  const setActiveNavItem = useUiStore(s => s.setActiveNavItem)
  const addToast = useUiStore(s => s.addToast)
  // Subscribed rather than read through getState(): the one-time probe in App
  // can resolve while the palette is already open, and only a subscription
  // rebuilds the command list when the ask entry must appear or disappear.
  const askHistoryAvailable = useUiStore(s => s.askHistoryAvailable)

  const sessions = useSessionStore(s => s.sessions)
  const addToQueue = useChatStore(s => s.addToQueue)

  // Automations live in the main process, not a store: probe them when the
  // palette opens (this component only mounts while it is open) and follow the
  // scheduler for as long as it stays up. `null` means the probe failed, which
  // hides the group instead of leaving an empty header in the list.
  const [automationJobs, setAutomationJobs] = useState<AutomationJobData[] | null>(null)
  useEffect(() => {
    let cancelled = false
    let seq = 0
    const load = async () => {
      const request = ++seq
      try {
        const result = await window.electronAPI.automationList()
        // An event-triggered refetch can land before an older response; only
        // the newest request may write, or the list would move backwards.
        if (!cancelled && request === seq) {
          setAutomationJobs(Array.isArray(result?.jobs) ? result.jobs : null)
        }
      } catch (err) {
        console.error('[AIPA] Command palette could not load automations', err)
        if (!cancelled && request === seq) setAutomationJobs(null)
      }
    }
    void load()
    const off = window.electronAPI.onAutomationChanged(() => { void load() })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  // How many rows "Recently deleted" holds. `null` = the probe could not
  // answer, and the entry stays hidden rather than promising an empty page.
  // This component only mounts while the palette is open, so the probe runs
  // once per opening. Workflow records live in prefs, not in a manifest, and
  // are read synchronously before the three IPC calls go out.
  const [trashCount, setTrashCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    const workflows = normalizeTrashedWorkflows(usePrefsStore.getState().prefs.trashedWorkflows).length
    void countTrashedItems(workflows).then(count => {
      if (!cancelled) setTrashCount(count)
    })
    return () => { cancelled = true }
  }, [])

  // Build all commands
  const commands = useMemo<PaletteCommand[]>(() => {
    const args = {
      t, onClose, onExport, onNewConversation, onSendSlashCommand,
      toggleSidebar, setSidebarTab, setSidebarOpen, setActiveNavItem,
      addToQueue, addToast, sessions, query, askHistoryAvailable, resolvedLocale,
    }
    return [
      ...buildApprovalCommands({ t, onClose, jobs: automationJobs }),
      ...buildSessionCommands(args),
      ...buildAutomationCommands({ t, onClose, addToast, jobs: automationJobs, resolvedLocale }),
      ...buildActionCommands(args),
      ...buildTrashCommands({ t, onClose, trashCount }),
      ...buildSlashCommands(args),
      ...buildWorkflowCommands(args),
      ...buildModelCommands(args),
      ...buildPersonaCommands(args),
    ]
  }, [
    onClose, onExport, onNewConversation, onSendSlashCommand,
    toggleSidebar, setSidebarTab, setSidebarOpen, setActiveNavItem,
    addToQueue, addToast, sessions, query, askHistoryAvailable, t, resolvedLocale,
    automationJobs, trashCount,
  ])

  // Filter and rank by query. A raw `includes` made "ask" surface "Open
  // Archive" first because "ask" lives inside "task"; a name prefix must beat
  // a description substring, and description-only hits are dropped entirely
  // when any name matched.
  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    const scored = commands.map((c, index) => {
      const name = c.name.toLowerCase()
      let score = 0
      if (name.startsWith(q)) score = 4
      else if (name.split(/[\s\-_/·:]+/).some(word => word.startsWith(q))) score = 3
      else if (name.includes(q)) score = 2
      else if (c.description.toLowerCase().includes(q)) score = 1
      return { c, score, index }
    }).filter(entry => entry.score > 0)
    const best = scored.reduce((max, entry) => Math.max(max, entry.score), 0)
    // Only name matches survive once a name match exists; `index` keeps the
    // original builder order stable inside a score band.
    return scored
      .filter(entry => best < 2 || entry.score >= 2)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(entry => entry.c)
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

  // Category label for the grouped header and the search-mode badge. Two
  // categories are localized in place; the rest keep the static labels above.
  const categoryLabel = (category: PaletteCommand['category']): string =>
    category === 'automation'
      ? t('automation.title')
      : category === 'approval'
        ? t('command.waitingApprovals.group')
        : CATEGORY_LABELS[category]

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
            title={cmd.name}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: isSelected ? 'var(--accent-text)' : 'var(--text-primary)',
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
              title={cmd.description}
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
            {categoryLabel(cmd.category)}
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
          boxShadow: 'var(--dialog-shadow)',
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
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onFocus={e => {
              const bar = e.currentTarget.parentElement
              if (bar) {
                bar.style.boxShadow = 'inset 0 0 0 2px var(--accent-border)'
                bar.style.background = 'var(--accent-bg)'
              }
            }}
            onBlur={e => {
              const bar = e.currentTarget.parentElement
              if (bar) {
                bar.style.boxShadow = 'none'
                bar.style.background = 'transparent'
              }
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
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
            // Seven whole 56px rows. The grouped (empty-query) view adds a
            // 28px group header, so it needs 28px more than the filtered
            // view; otherwise the seventh row is sliced at the fold, which is
            // exactly what 380px did before.
            maxHeight: query.trim() ? 392 : 420,
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
                  // The held-request group is the one header that is waiting on
                  // the user, and it borrows the status bar's warning tone so
                  // the two surfaces name the same state the same way.
                  color: category === 'approval' ? 'var(--warning-text)' : 'var(--text-muted)',
                }}
              >
                {categoryLabel(category)}
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
