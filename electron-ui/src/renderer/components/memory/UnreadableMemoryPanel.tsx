/**
 * UnreadableMemoryPanel — memory paths AIPA tried to read and could not.
 *
 * Separated from the memdir tab so the tab stays about listing and filtering;
 * this panel is the difference between "no memory" and "memory that is there
 * but broken". Diagnostics never reach the prompt, so this is the only place
 * their paths surface.
 */
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useT } from '../../i18n'
import type { MemoryUnreadableEntry } from '../../hooks/promptMemory'

const UNREADABLE_VISIBLE = 10

/**
 * The memory files AIPA tried to read and could not.
 *
 * This is the difference between "you have no memory" and "your memory is
 * there but some of it is broken". The list is a warning, not an error: the
 * rest of memory still loaded and a scheduled run still used it. Diagnostics
 * never reach the prompt, so this panel is the only place the paths surface.
 */
export default function UnreadableMemoryPanel({ entries, homeDir }: {
  entries: MemoryUnreadableEntry[]
  homeDir: string
}) {
  const t = useT()
  // Collapsed by default: the header carries the count, the paths are for
  // someone who wants to fix them.
  const [collapsed, setCollapsed] = useState(true)

  if (entries.length === 0) return null

  const shown = entries.slice(0, UNREADABLE_VISIBLE)
  const hidden = entries.length - shown.length
  const displayPath = (filePath: string): string => {
    if (!homeDir) return filePath
    const home = homeDir.replace(/[/\\]+$/, '')
    return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath
  }

  return (
    <div style={{
      borderBottom: '1px solid rgba(251,191,36,0.28)',
      background: 'rgba(251,191,36,0.06)',
      flexShrink: 0,
    }}>
      <div
        onClick={() => setCollapsed(v => !v)}
        style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={11} style={{ color: 'var(--warning-text)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--warning-text)' }}>
            {t('memory.unreadableTitle')}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600,
            background: 'rgba(251,191,36,0.16)',
            color: 'var(--warning-text)',
            borderRadius: 8, padding: '1px 6px',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {t('memory.unreadableCount', { count: entries.length })}
          </span>
        </div>
        <span style={{
          fontSize: 10, color: 'var(--text-muted)',
          transform: collapsed ? 'rotate(-90deg)' : 'none',
          transition: 'transform 0.15s ease',
        }}>{'▾'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('memory.unreadableHint')}
          </span>
          {shown.map((entry) => (
            <div
              key={`${entry.scope}:${entry.projectHash ?? ''}:${entry.path}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', borderRadius: 6,
                background: 'var(--bg-hover)',
                border: '1px solid rgba(251,191,36,0.22)',
              }}
            >
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                color: 'var(--warning-text)', background: 'rgba(251,191,36,0.14)',
                borderRadius: 6, padding: '1px 5px', flexShrink: 0,
              }}>
                {t(entry.scope === 'global' ? 'memory.memdirGlobal' : 'memory.memdirProject')}
              </span>
              <span
                title={entry.path}
                style={{
                  flex: 1, minWidth: 0, fontSize: 10, fontFamily: 'monospace',
                  color: 'var(--text-secondary)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {displayPath(entry.path)}
              </span>
              <span style={{
                fontSize: 9, color: 'var(--text-muted)', flexShrink: 0,
                background: 'var(--border)', borderRadius: 6, padding: '1px 6px',
              }}>
                {t(`memory.unreadableReason.${entry.reason}`)}
              </span>
            </div>
          ))}
          {hidden > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)', paddingLeft: 2 }}>
              {t('memory.unreadableMore', { count: hidden })}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
