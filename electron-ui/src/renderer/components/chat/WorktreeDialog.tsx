// WorktreeDialog — create and manage git worktrees for isolated branch work
import React, { useState, useEffect, useCallback } from 'react'
import { GitBranch, Plus, Trash2, ArrowRight, RefreshCw, X, AlertTriangle, CheckCircle2, GitMerge, AlertCircle } from 'lucide-react'

interface WorktreeInfo {
  path: string
  branch: string
  head: string
  isMain: boolean
  status?: 'active' | 'merged' | 'conflict'
}

interface WorktreeDialogProps {
  cwd: string
  onClose: () => void
  onSwitchCwd: (newCwd: string, branch: string) => void
}

export default function WorktreeDialog({ cwd, onClose, onSwitchCwd }: WorktreeDialogProps) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [inputFocused, setInputFocused] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.electronAPI.worktreeList(cwd)
      setWorktrees(list)
    } catch (e) {
      setError('Failed to list worktrees: ' + String(e))
    } finally {
      setLoading(false)
    }
  }, [cwd])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const result = await window.electronAPI.worktreeCreate(cwd, newName.trim())
      setNewName('')
      await load()
      onSwitchCwd(result.path, result.branch)
    } catch (e) {
      setError('Failed to create worktree: ' + String(e))
    } finally {
      setCreating(false)
    }
  }

  const handleRemove = async (wtPath: string) => {
    try {
      await window.electronAPI.worktreeRemove(cwd, wtPath, false)
      setConfirmRemove(null)
      await load()
    } catch (e) {
      const msg = String(e)
      setError(msg + ' — try closing any active sessions in this worktree first.')
    }
  }

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '8px 12px', fontSize: 13,
    background: 'var(--bg-hover)',
    border: inputFocused ? '1px solid rgba(99,102,241,0.55)' : '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-primary)', outline: 'none',
    transition: 'border-color 0.15s ease',
    boxShadow: inputFocused ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
    fontFamily: 'inherit',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--glass-overlay)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      animation: 'fadeIn 0.15s ease',
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--border)',
        borderRadius: 16, padding: '20px 24px', width: 500,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
        animation: 'slideUp 0.15s ease',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14,
          paddingBottom: 14,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <GitBranch size={14} style={{ color: '#818cf8' }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Git Worktrees
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={load}
              title="Refresh"
              style={{
                background: 'transparent',
                border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 6, borderRadius: 8,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <RefreshCw size={13} />
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 6, borderRadius: 8,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6,
        }}>
          Worktrees let you work on different branches simultaneously in isolated directories. Created under{' '}
          <code style={{
            fontSize: 11, color: '#a5b4fc', fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            background: 'rgba(99,102,241,0.10)', padding: '1px 5px', borderRadius: 4,
          }}>.claude/worktrees/</code>.
        </div>

        {/* Create new */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Branch name (e.g. feature/my-feature)"
            style={inputStyle}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              border: 'none', borderRadius: 8,
              color: 'var(--text-bright)',
              cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
              opacity: creating || !newName.trim() ? 0.45 : 1,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              boxShadow: creating || !newName.trim() ? 'none' : '0 2px 8px rgba(99,102,241,0.25)',
            }}
            onMouseEnter={(e) => {
              if (!creating && newName.trim()) {
                e.currentTarget.style.filter = 'brightness(1.08)'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.40)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = ''
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = creating || !newName.trim() ? 'none' : '0 2px 8px rgba(99,102,241,0.25)'
            }}
          >
            <Plus size={13} />
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            padding: '8px 12px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8,
            fontSize: 12, color: 'rgba(248,113,113,0.90)', marginBottom: 12,
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1, color: '#f87171' }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(248,113,113,0.60)', padding: 0, display: 'flex',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.60)')}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Worktree list */}
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
          {loading ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : worktrees.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No worktrees found
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {worktrees.map(wt => {
                const isActive = wt.path === cwd
                const isConfirm = confirmRemove === wt.path
                const wtStatus = wt.status
                const isConflict = wtStatus === 'conflict'
                const isMerged = wtStatus === 'merged'

                return (
                  <div
                    key={wt.path}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      border: '1px solid ' + (
                        isActive ? 'rgba(99,102,241,0.35)'
                        : isConflict ? 'rgba(239,68,68,0.25)'
                        : 'var(--border)'
                      ),
                      background: isActive
                        ? 'rgba(99,102,241,0.08)'
                        : isConflict ? 'rgba(239,68,68,0.05)'
                        : 'var(--glass-shimmer)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Status icon */}
                    {isActive ? (
                      <CheckCircle2 size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
                    ) : isConflict ? (
                      <AlertCircle size={14} style={{ color: '#f87171', flexShrink: 0 }} />
                    ) : isMerged ? (
                      <GitMerge size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                    ) : (
                      <GitBranch size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {/* Branch name — indigo monospace */}
                        <span style={{
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                          color: isActive
                            ? 'rgba(165,180,252,0.82)'
                            : isMerged ? 'var(--text-muted)'
                            : isConflict ? 'rgba(248,113,113,0.90)'
                            : 'rgba(165,180,252,0.82)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {wt.branch || '(detached)'}
                        </span>
                        {/* Status badges */}
                        {wt.isMain && (
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            color: 'var(--text-muted)',
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--border)',
                            padding: '1px 5px', borderRadius: 6,
                            letterSpacing: '0.05em', textTransform: 'uppercase',
                          }}>main</span>
                        )}
                        {isActive && (
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            background: 'rgba(74,222,128,0.15)',
                            color: '#4ade80',
                            border: '1px solid rgba(74,222,128,0.30)',
                            padding: '1px 6px', borderRadius: 6,
                            letterSpacing: '0.05em', textTransform: 'uppercase',
                          }}>active</span>
                        )}
                        {isMerged && (
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            background: 'var(--bg-hover)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border)',
                            padding: '1px 6px', borderRadius: 6,
                            letterSpacing: '0.05em', textTransform: 'uppercase',
                          }}>merged</span>
                        )}
                        {isConflict && (
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            background: 'rgba(239,68,68,0.12)',
                            color: '#f87171',
                            border: '1px solid rgba(239,68,68,0.28)',
                            padding: '1px 6px', borderRadius: 6,
                            letterSpacing: '0.05em', textTransform: 'uppercase',
                          }}>conflict</span>
                        )}
                      </div>
                      {/* Path */}
                      <div style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        marginTop: 3,
                      }}>
                        {wt.path}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {!wt.isMain && !isActive && (
                        <button
                          onClick={() => onSwitchCwd(wt.path, wt.branch)}
                          title="Switch to this worktree"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', fontSize: 11, fontWeight: 600,
                            background: 'rgba(99,102,241,0.10)',
                            border: '1px solid rgba(99,102,241,0.25)',
                            borderRadius: 6, color: '#a5b4fc', cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(99,102,241,0.20)'
                            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
                            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'
                          }}
                        >
                          <ArrowRight size={11} /> Switch
                        </button>
                      )}
                      {!wt.isMain && (
                        isConfirm ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => handleRemove(wt.path)}
                              style={{
                                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                background: 'rgba(239,68,68,0.18)',
                                border: '1px solid rgba(239,68,68,0.35)',
                                borderRadius: 6, color: '#f87171', cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(239,68,68,0.28)'
                                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.50)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(239,68,68,0.18)'
                                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmRemove(null)}
                              style={{
                                background: 'var(--bg-hover)',
                                border: '1px solid var(--border)',
                                borderRadius: 6, padding: '4px 8px', fontSize: 11,
                                color: 'var(--text-muted)', cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'var(--border)'
                                e.currentTarget.style.color = 'var(--text-secondary)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'var(--bg-hover)'
                                e.currentTarget.style.color = 'var(--text-muted)'
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemove(wt.path)}
                            title="Remove worktree"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'rgba(248,113,113,0.50)', display: 'flex', padding: 5,
                              borderRadius: 6, transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'rgba(239,68,68,0.10)'
                              e.currentTarget.style.color = '#f87171'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'none'
                              e.currentTarget.style.color = 'rgba(248,113,113,0.50)'
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
