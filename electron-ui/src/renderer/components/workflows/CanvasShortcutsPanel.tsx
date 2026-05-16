// CanvasShortcutsPanel — Canvas keyboard shortcuts reference panel (P4.2)
// Glass-morphism centered modal, shows all canvas shortcuts grouped by category
// Trigger: ? key or toolbar HelpCircle button

import React, { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

interface CanvasShortcutsPanelProps {
  onClose: () => void
}

interface ShortcutRow {
  keys: string[]
  desc: string
}

interface ShortcutGroup {
  label: string
  rows: ShortcutRow[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Navigation',
    rows: [
      { keys: ['Tab'], desc: 'Focus next node' },
      { keys: ['Shift+Tab'], desc: 'Focus previous node' },
      { keys: ['↑ ↓'], desc: 'Move focused node vertically' },
      { keys: ['← →'], desc: 'Move focused node horizontally' },
      { keys: ['Space'], desc: 'Hold to pan canvas' },
      { keys: ['Scroll'], desc: 'Zoom in/out' },
    ],
  },
  {
    label: 'Selection',
    rows: [
      { keys: ['Click'], desc: 'Select node' },
      { keys: ['Shift+Click'], desc: 'Multi-select' },
      { keys: ['Drag'], desc: 'Box select (on canvas)' },
      { keys: ['Escape'], desc: 'Clear selection' },
    ],
  },
  {
    label: 'Editing',
    rows: [
      { keys: ['Double-click'], desc: 'Edit node prompt' },
      { keys: ['Delete'], desc: 'Delete selected node(s)' },
      { keys: ['Backspace'], desc: 'Delete selected node(s)' },
      { keys: ['Ctrl+C'], desc: 'Copy selected node(s)' },
      { keys: ['Ctrl+V'], desc: 'Paste node(s)' },
      { keys: ['Ctrl+Z'], desc: 'Undo' },
      { keys: ['Ctrl+Y'], desc: 'Redo' },
      { keys: ['G'], desc: 'Group / ungroup selected nodes' },
      { keys: ['Double-click (canvas)'], desc: 'Create new step' },
    ],
  },
  {
    label: 'View',
    rows: [
      { keys: ['Ctrl++'], desc: 'Zoom in' },
      { keys: ['Ctrl+-'], desc: 'Zoom out' },
      { keys: ['Ctrl+0'], desc: 'Fit to view' },
      { keys: ['L'], desc: 'Toggle layout direction' },
      { keys: ['M'], desc: 'Toggle minimap' },
      { keys: ['T'], desc: 'Toggle execution timeline' },
      { keys: ['F'], desc: 'Find / search steps' },
      { keys: ['?'], desc: 'Show this panel' },
    ],
  },
  {
    label: 'Execution',
    rows: [
      { keys: ['R'], desc: 'Run workflow' },
      { keys: ['Ctrl+Shift+A'], desc: 'Abort' },
    ],
  },
]

function KeyChip({ label }: { label: string }) {
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1px 6px',
        fontSize: 11,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontWeight: 600,
        lineHeight: 1.5,
        color: 'var(--text-primary)',
        background: 'var(--bg-active)',
        border: '1px solid var(--border-strong, var(--border))',
        borderRadius: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </kbd>
  )
}

export default function CanvasShortcutsPanel({ onClose }: CanvasShortcutsPanelProps) {
  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  // Click backdrop to close
  const handleBackdropMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  return (
    <div
      onMouseDown={handleBackdropMouseDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
      }}
    >
      <div
        className="popup-enter"
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 420,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--glass-bg-deep)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: 'var(--glass-shadow, 0 8px 32px rgba(0,0,0,0.5))',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px 12px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.03em',
            }}
          >
            Keyboard Shortcuts
          </span>
          <button
            onClick={onClose}
            aria-label="Close shortcuts panel"
            title="Close (Esc)"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              borderRadius: 6,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable groups */}
        <div style={{ padding: '8px 16px 16px', overflowY: 'auto' }}>
          {SHORTCUT_GROUPS.map((group, gi) => (
            <div key={group.label} style={{ marginTop: gi === 0 ? 8 : 16 }}>
              {/* Group label */}
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'var(--accent-muted, var(--text-muted))',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                  paddingLeft: 2,
                }}
              >
                {group.label}
              </div>

              {/* Shortcut rows */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  background: 'var(--bg-hover)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                }}
              >
                {group.rows.map((row, ri) => (
                  <div
                    key={ri}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderBottom: ri < group.rows.length - 1 ? '1px solid var(--border)' : 'none',
                      background: 'transparent',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--bg-active, rgba(99,102,241,0.06))'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* Description */}
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        flex: 1,
                        minWidth: 0,
                        marginRight: 12,
                      }}
                    >
                      {row.desc}
                    </span>

                    {/* Key chips */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        flexShrink: 0,
                      }}
                    >
                      {row.keys.map((k, ki) => (
                        <KeyChip key={ki} label={k} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Press</span>
          <KeyChip label="?" />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>or click the toolbar button to open</span>
        </div>
      </div>
    </div>
  )
}
