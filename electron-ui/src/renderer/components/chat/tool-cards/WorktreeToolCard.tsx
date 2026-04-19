import React from 'react'
import { GitBranch, Check } from 'lucide-react'

export interface WorktreeToolCardProps {
  /** 'enter' for EnterWorktree, 'exit' for ExitWorktree */
  action: 'enter' | 'exit'
  input: Record<string, unknown>
  isLoading?: boolean
}

const BORDER_COLOR_LOADING = 'rgba(59,130,246,0.70)'
const BORDER_COLOR_DONE = 'rgba(59,130,246,0.50)'

export function WorktreeToolCard({ action, input, isLoading }: WorktreeToolCardProps) {
  const borderColor = isLoading ? BORDER_COLOR_LOADING : BORDER_COLOR_DONE

  // EnterWorktree: { name, path? } / ExitWorktree: { action: 'keep'|'remove', ... }
  const worktreeName = typeof input.name === 'string' ? input.name : null
  const worktreePath = typeof input.path === 'string' ? input.path : null
  const exitAction = typeof input.action === 'string' ? input.action : null

  const statusLabel = isLoading
    ? action === 'enter' ? 'Creating worktree...' : 'Exiting worktree...'
    : action === 'enter' ? 'Worktree active' : 'Worktree exited'

  return (
    <div style={{
      background: 'var(--bg-primary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: `2px solid ${borderColor}`,
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      transition: 'border-color 0.2s ease',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'var(--section-bg)',
      }}>
        <GitBranch size={13} style={{ color: 'rgba(59,130,246,0.85)', flexShrink: 0 }} />

        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(59,130,246,0.90)',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {action === 'enter' ? 'EnterWorktree' : 'ExitWorktree'}
          {worktreeName && ` — ${worktreeName}`}
        </span>

        {/* Status badge */}
        {isLoading ? (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 500,
            color: 'rgba(59,130,246,0.80)',
            fontStyle: 'italic',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}>
            {statusLabel}
          </span>
        ) : (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 8,
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.28)',
            color: 'rgba(96,165,250,1)',
            fontSize: 10,
            fontWeight: 500,
            flexShrink: 0,
          }}>
            <Check size={9} style={{ flexShrink: 0 }} />
            {statusLabel}
          </span>
        )}
      </div>

      {/* Detail row: path and/or exit action */}
      {(worktreePath || exitAction) && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{
            padding: '6px 10px',
            background: 'var(--section-bg)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}>
            {worktreePath && (
              <span style={{
                fontSize: 11,
                fontFamily: 'monospace',
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {worktreePath}
              </span>
            )}
            {exitAction && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '1px 7px',
                borderRadius: 6,
                background: exitAction === 'remove'
                  ? 'rgba(239,68,68,0.10)'
                  : 'rgba(34,197,94,0.10)',
                border: `1px solid ${exitAction === 'remove' ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
                color: exitAction === 'remove'
                  ? 'rgba(248,113,113,0.90)'
                  : 'rgba(74,222,128,0.90)',
                flexShrink: 0,
              }}>
                {exitAction}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
