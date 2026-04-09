// WorktreeDialog — create and manage git worktrees for isolated branch work
import React, { useState, useEffect, useCallback } from 'react'
import { GitBranch, Plus, Trash2, ArrowRight, RefreshCw, X, AlertTriangle } from 'lucide-react'

interface WorktreeInfo {
  path: string
  branch: string
  head: string
  isMain: boolean
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
      // Auto-switch to new worktree
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
      // Try force remove
      const msg = String(e)
      setError(msg + ' — try closing any active sessions in this worktree first.')
    }
  }

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '6px 10px', fontSize: 12,
    background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-sessionpanel)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px 24px', width: 480,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitBranch size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Git Worktrees</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={load} title="Refresh" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.4 }}>
          Worktrees let you work on different branches simultaneously in isolated directories. Created under <code style={{ fontSize: 10 }}>.claude/worktrees/</code>.
        </div>

        {/* Create new */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            placeholder="Branch name (e.g. feature/my-feature)"
            style={inputStyle}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 14px', fontSize: 11, fontWeight: 500,
              background: 'var(--accent)', border: 'none', borderRadius: 6,
              color: '#fff', cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
              opacity: creating || !newName.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={12} />
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>

        {error && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            padding: '8px 10px', background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
            fontSize: 11, color: 'var(--error)', marginBottom: 12,
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', marginLeft: 'auto', padding: 0, display: 'flex' }}>
              <X size={12} />
            </button>
          </div>
        )}

        {/* Worktree list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>
          ) : worktrees.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No worktrees found
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {worktrees.map(wt => {
                const isActive = wt.path === cwd
                const isConfirm = confirmRemove === wt.path
                return (
                  <div
                    key={wt.path}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      border: '1px solid ' + (isActive ? 'var(--accent)' : 'var(--border)'),
                      background: isActive ? 'rgba(0,122,204,0.06)' : 'var(--bg-input)',
                    }}
                  >
                    <GitBranch size={13} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {wt.branch || '(detached)'}
                        {wt.isMain && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>main</span>}
                        {isActive && <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--accent)', color: '#fff', padding: '1px 5px', borderRadius: 8 }}>active</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {wt.path}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {!wt.isMain && !isActive && (
                        <button
                          onClick={() => onSwitchCwd(wt.path, wt.branch)}
                          title="Switch to this worktree"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', fontSize: 10, fontWeight: 500,
                            background: 'none', border: '1px solid var(--border)',
                            borderRadius: 5, color: 'var(--text-muted)', cursor: 'pointer',
                          }}
                        >
                          <ArrowRight size={11} /> Switch
                        </button>
                      )}
                      {!wt.isMain && (
                        isConfirm ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => handleRemove(wt.path)} style={{ padding: '3px 8px', fontSize: 10, background: 'var(--error)', border: 'none', borderRadius: 5, color: '#fff', cursor: 'pointer' }}>
                              Confirm
                            </button>
                            <button onClick={() => setConfirmRemove(null)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 8px', fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemove(wt.path)}
                            title="Remove worktree"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', display: 'flex', padding: 4, borderRadius: 4 }}
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
