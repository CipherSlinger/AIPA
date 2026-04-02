/**
 * ChangesPanel -- displays session-level file change summary.
 *
 * Shows aggregate stats (files changed, lines added/removed),
 * per-file breakdown, and per-turn breakdown.
 *
 * Inspired by Claude Code official source: src/components/diff/DiffDialog.tsx
 */
import React, { useState, useRef, useCallback } from 'react'
import { GitCompareArrows, ClipboardCopy, Check, ChevronDown, ChevronRight, X } from 'lucide-react'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useUiStore } from '../../store'
import type { SessionChanges } from '../../hooks/useSessionChanges'

interface ChangesPanelProps {
  sessionChanges: SessionChanges
  headerBtnStyle: React.CSSProperties
  hoverIn: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean) => void
  hoverOut: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean, defaultColor?: string) => void
}

export default function ChangesPanel({
  sessionChanges,
  headerBtnStyle,
  hoverIn,
  hoverOut,
}: ChangesPanelProps) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const [showPanel, setShowPanel] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set([0]))
  const panelRef = useRef<HTMLDivElement>(null)

  useClickOutside(panelRef, showPanel, useCallback(() => setShowPanel(false), []))

  const { totalFilesChanged, totalLinesAdded, totalLinesRemoved, files, turns } = sessionChanges

  const toggleTurn = useCallback((idx: number) => {
    setExpandedTurns(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const handleCopy = useCallback(() => {
    const lines: string[] = [
      t('changes.title'),
      '=======================',
      `${totalFilesChanged} files changed, +${totalLinesAdded} lines, -${totalLinesRemoved} lines`,
      '',
    ]
    for (const f of files) {
      const status = f.status === 'created' ? 'Created: ' : 'Modified:'
      const added = f.linesAdded > 0 ? `+${f.linesAdded}` : ''
      const removed = f.linesRemoved > 0 ? `-${f.linesRemoved}` : ''
      const changes = [added, removed].filter(Boolean).join(', ')
      lines.push(`${status} ${f.filePath} (${changes})`)
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      addToast('success', t('changes.copied'))
      setTimeout(() => setCopied(false), 2000)
    })
  }, [files, totalFilesChanged, totalLinesAdded, totalLinesRemoved, addToast, t])

  // Listen for keyboard shortcut
  React.useEffect(() => {
    const handler = () => setShowPanel(p => !p)
    window.addEventListener('aipa:toggleChanges', handler)
    return () => window.removeEventListener('aipa:toggleChanges', handler)
  }, [])

  // Escape to close
  React.useEffect(() => {
    if (!showPanel) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowPanel(false); e.stopPropagation() }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [showPanel])

  return (
    <div style={{ position: 'relative' }}>
      <button
        style={headerBtnStyle}
        title={t('changes.tooltip')}
        onClick={() => setShowPanel(p => !p)}
        onMouseEnter={(e) => hoverIn(e, showPanel)}
        onMouseLeave={(e) => hoverOut(e, showPanel)}
      >
        <GitCompareArrows size={16} />
        {totalFilesChanged > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: 'var(--accent)', color: '#fff',
            fontSize: 9, fontWeight: 700, borderRadius: '50%',
            minWidth: 16, height: 16, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            {totalFilesChanged}
          </span>
        )}
      </button>

      {showPanel && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('changes.title')}
          style={{
            position: 'absolute', top: '100%', right: 0,
            width: 380, maxHeight: 420, overflowY: 'auto',
            background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
            boxShadow: 'var(--popup-shadow)', borderRadius: 8,
            zIndex: 200, marginTop: 4,
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px 6px',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('changes.title')}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {totalFilesChanged > 0 && (
                <button
                  onClick={handleCopy}
                  title="Copy"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: 4, borderRadius: 4, color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
                </button>
              )}
              <button
                onClick={() => setShowPanel(false)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: 4, borderRadius: 4, color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {totalFilesChanged === 0 ? (
            /* Empty state */
            <div style={{
              padding: '24px 12px', textAlign: 'center',
              fontSize: 12, color: 'var(--text-muted)',
            }}>
              {t('changes.noChanges')}
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div style={{
                padding: '0 12px 8px', fontSize: 12, color: 'var(--text-secondary)',
                display: 'flex', gap: 8, flexWrap: 'wrap',
              }}>
                <span>{totalFilesChanged === 1 ? t('changes.fileChanged') : t('changes.filesChanged', { count: String(totalFilesChanged) })}</span>
                {totalLinesAdded > 0 && (
                  <span style={{ color: '#4ade80' }}>+{totalLinesAdded} {t('changes.linesAdded', { count: String(totalLinesAdded) }).replace(/^\+?\d+\s*/, '')}</span>
                )}
                {totalLinesRemoved > 0 && (
                  <span style={{ color: '#f87171' }}>-{totalLinesRemoved} {t('changes.linesRemoved', { count: String(totalLinesRemoved) }).replace(/^-?\d+\s*/, '')}</span>
                )}
              </div>

              {/* File list */}
              <div role="list" style={{ borderTop: '1px solid var(--popup-border)' }}>
                {files.map(f => (
                  <div key={f.filePath} role="listitem" style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 12px', height: 28,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, borderRadius: 3,
                      padding: '1px 6px', flexShrink: 0,
                      background: f.status === 'created' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(250, 204, 21, 0.15)',
                      color: f.status === 'created' ? '#4ade80' : '#facc15',
                    }}>
                      {f.status === 'created' ? t('changes.statusCreated') : t('changes.statusModified')}
                    </span>
                    <span title={f.filePath} style={{
                      fontSize: 12, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {f.basename}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', flexShrink: 0, display: 'flex', gap: 6 }}>
                      {f.linesAdded > 0 && <span style={{ color: '#4ade80' }}>+{f.linesAdded}</span>}
                      {f.linesRemoved > 0 && <span style={{ color: '#f87171' }}>-{f.linesRemoved}</span>}
                    </span>
                  </div>
                ))}
              </div>

              {/* Per-turn breakdown */}
              {turns.length > 0 && (
                <div style={{ borderTop: '1px solid var(--popup-border)', paddingTop: 4 }}>
                  {turns.map((turn, idx) => {
                    const isExpanded = expandedTurns.has(idx)
                    return (
                      <div key={idx}>
                        <button
                          onClick={() => toggleTurn(idx)}
                          aria-expanded={isExpanded}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 12px', background: 'none', border: 'none',
                            cursor: 'pointer', textAlign: 'left',
                            color: 'var(--text-muted)', fontSize: 11,
                          }}
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t('changes.turn', { num: String(idx + 1), prompt: turn.userPromptPreview })}
                          </span>
                        </button>
                        {isExpanded && turn.files.map(f => (
                          <div key={f.filePath} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '3px 12px 3px 32px', fontSize: 11,
                          }}>
                            <span style={{
                              fontSize: 9, fontWeight: 600, borderRadius: 3,
                              padding: '0 4px', flexShrink: 0,
                              background: f.status === 'created' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(250, 204, 21, 0.15)',
                              color: f.status === 'created' ? '#4ade80' : '#facc15',
                            }}>
                              {f.status === 'created' ? t('changes.statusCreated') : t('changes.statusModified')}
                            </span>
                            <span title={f.filePath} style={{
                              color: 'var(--text-secondary)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                            }}>
                              {f.basename}
                            </span>
                            <span style={{ fontFamily: 'monospace', flexShrink: 0, display: 'flex', gap: 4 }}>
                              {f.linesAdded > 0 && <span style={{ color: '#4ade80' }}>+{f.linesAdded}</span>}
                              {f.linesRemoved > 0 && <span style={{ color: '#f87171' }}>-{f.linesRemoved}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
