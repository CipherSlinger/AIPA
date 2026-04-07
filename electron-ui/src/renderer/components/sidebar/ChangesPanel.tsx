// ChangesPanel — lists files modified by Claude in the current session (Iteration 521)
import React, { useState, useCallback } from 'react'
import { GitBranch, ChevronDown, ChevronRight, FileCode, ExternalLink } from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import { useT } from '../../i18n'
import DiffViewer from './DiffViewer'

interface FileDiffState {
  loading: boolean
  content: string | null
  error: string | null
}

export default function ChangesPanel() {
  const t = useT()
  const changedFiles = useChatStore(s => s.changedFiles)

  // Deduplicate by filePath for badge count, but keep all entries for grouping
  const uniquePaths = Array.from(new Set(changedFiles.map(f => f.filePath)))

  // Per-file expanded + diff state
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({})
  const [fileDiffs, setFileDiffs] = useState<Record<string, FileDiffState>>({})

  // Full git diff modal state
  const [showAllDiff, setShowAllDiff] = useState(false)
  const [allDiffState, setAllDiffState] = useState<FileDiffState>({ loading: false, content: null, error: null })

  const toggleFile = useCallback(async (filePath: string) => {
    const isOpen = expandedFiles[filePath]
    setExpandedFiles(prev => ({ ...prev, [filePath]: !isOpen }))

    // Only fetch diff when opening and not yet loaded
    if (!isOpen && !fileDiffs[filePath]) {
      setFileDiffs(prev => ({ ...prev, [filePath]: { loading: true, content: null, error: null } }))
      try {
        const result = await window.electronAPI.fsGitDiff(filePath)
        if (typeof result === 'string') {
          setFileDiffs(prev => ({ ...prev, [filePath]: { loading: false, content: result, error: null } }))
        } else {
          setFileDiffs(prev => ({ ...prev, [filePath]: { loading: false, content: null, error: result.error } }))
        }
      } catch (err) {
        setFileDiffs(prev => ({ ...prev, [filePath]: { loading: false, content: null, error: String(err) } }))
      }
    }
  }, [expandedFiles, fileDiffs])

  const handleViewAllChanges = useCallback(async () => {
    setShowAllDiff(true)
    if (!allDiffState.content && !allDiffState.loading) {
      setAllDiffState({ loading: true, content: null, error: null })
      try {
        const result = await window.electronAPI.fsGitDiff()
        if (typeof result === 'string') {
          setAllDiffState({ loading: false, content: result, error: null })
        } else {
          setAllDiffState({ loading: false, content: null, error: result.error })
        }
      } catch (err) {
        setAllDiffState({ loading: false, content: null, error: String(err) })
      }
    }
  }, [allDiffState])

  // Group changed files by turnIndex
  const byTurn: Record<number, typeof changedFiles> = {}
  for (const entry of changedFiles) {
    if (!byTurn[entry.turnIndex]) byTurn[entry.turnIndex] = []
    // Only add unique filePath per turn
    if (!byTurn[entry.turnIndex].find(e => e.filePath === entry.filePath)) {
      byTurn[entry.turnIndex].push(entry)
    }
  }
  const turns = Object.keys(byTurn)
    .map(Number)
    .sort((a, b) => a - b)

  const basename = (p: string) => p.split(/[\\/]/).pop() || p

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px 8px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <GitBranch size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('changes.title')}
        </span>
        {uniquePaths.length > 0 && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 10,
            fontWeight: 600,
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 6px',
          }}>
            {uniquePaths.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {changedFiles.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <GitBranch size={28} style={{ color: 'var(--text-muted)', opacity: 0.4, marginBottom: 8 }} />
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              {t('changes.noChanges')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
              {t('changes.noChangesHint')}
            </div>
          </div>
        ) : (
          turns.map(turn => (
            <div key={turn} style={{ marginBottom: 4 }}>
              {/* Turn label */}
              <div style={{
                padding: '4px 14px',
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                opacity: 0.7,
              }}>
                {t('changes.turnLabel', { turn: String(turn) })}
              </div>

              {/* Files in this turn */}
              {byTurn[turn].map(entry => {
                const isOpen = !!expandedFiles[entry.filePath]
                const diffState = fileDiffs[entry.filePath]
                return (
                  <div key={entry.filePath + entry.timestamp}>
                    <button
                      onClick={() => toggleFile(entry.filePath)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 14px',
                        border: 'none',
                        background: isOpen ? 'rgba(255,255,255,0.04)' : 'transparent',
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        borderRadius: 0,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isOpen ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                    >
                      {isOpen
                        ? <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                        : <ChevronRight size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                      }
                      <FileCode size={13} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                      <span style={{
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }} title={entry.filePath}>
                        {basename(entry.filePath)}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, opacity: 0.6 }}>
                        {entry.toolName}
                      </span>
                    </button>

                    {/* Diff content */}
                    {isOpen && (
                      <div style={{ padding: '4px 10px 8px' }}>
                        {/* Full path */}
                        <div style={{
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          padding: '2px 4px 6px',
                          wordBreak: 'break-all',
                          opacity: 0.7,
                        }}>
                          {entry.filePath}
                        </div>
                        {diffState?.loading && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 4px' }}>
                            {t('changes.diffLoading')}
                          </div>
                        )}
                        {diffState?.error && (
                          <div style={{ fontSize: 11, color: '#f87171', padding: '8px 4px' }}>
                            {t('changes.diffError')}: {diffState.error}
                          </div>
                        )}
                        {diffState?.content !== null && diffState?.content !== undefined && !diffState.loading && !diffState.error && (
                          diffState.content.trim()
                            ? <DiffViewer diff={diffState.content} />
                            : <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 4px' }}>
                                {t('changes.noDiff')}
                              </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer: View All Changes */}
      {changedFiles.length > 0 && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <button
            onClick={handleViewAllChanges}
            style={{
              width: '100%',
              padding: '7px 12px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <ExternalLink size={13} />
            {t('changes.viewAllChanges')}
          </button>
        </div>
      )}

      {/* Full diff modal overlay */}
      {showAllDiff && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowAllDiff(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary, var(--bg-chat))',
              border: '1px solid var(--border)',
              borderRadius: 10,
              width: '80vw',
              maxWidth: 900,
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {t('changes.gitDiffTitle')}
              </span>
              <button
                onClick={() => setShowAllDiff(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>
            {/* Modal body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              {allDiffState.loading && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>
                  {t('changes.diffLoading')}
                </div>
              )}
              {allDiffState.error && (
                <div style={{ fontSize: 12, color: '#f87171', padding: 8 }}>
                  {t('changes.diffError')}: {allDiffState.error}
                </div>
              )}
              {allDiffState.content !== null && !allDiffState.loading && !allDiffState.error && (
                allDiffState.content.trim()
                  ? <DiffViewer diff={allDiffState.content} />
                  : <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>
                      {t('changes.noDiff')}
                    </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
