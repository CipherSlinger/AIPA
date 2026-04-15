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
            background: 'rgba(99,102,241,0.85)', color: 'rgba(255,255,255,0.95)',
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
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            borderRadius: 12,
            zIndex: 200, marginTop: 4,
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid var(--bg-hover)',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              {t('changes.title')}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {totalFilesChanged > 0 && (
                <button
                  onClick={handleCopy}
                  title={t('common.copy')}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: 4, borderRadius: 8, color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
                </button>
              )}
              <button
                onClick={() => setShowPanel(false)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: 4, borderRadius: 8, color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {totalFilesChanged === 0 ? (
            /* Empty state */
            <div style={{
              padding: '32px 16px', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'var(--bg-hover)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <GitCompareArrows size={20} style={{ color: 'rgba(255,255,255,0.2)' }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                {t('changes.noChanges')}
              </span>
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div style={{
                padding: '8px 12px 8px', fontSize: 12, color: 'var(--text-secondary)',
                display: 'flex', gap: 8, flexWrap: 'wrap',
                fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
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
              <div role="list" style={{ borderTop: '1px solid var(--bg-hover)' }}>
                {files.map(f => {
                  const isCreated = f.status === 'created'
                  const borderColor = isCreated ? 'rgba(74,222,128,0.5)' : 'rgba(99,102,241,0.5)'
                  const badgeBg = isCreated ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)'
                  const badgeColor = isCreated ? '#86efac' : '#a5b4fc'
                  const badgeBorder = isCreated ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(99,102,241,0.25)'
                  return (
                    <div
                      key={f.filePath}
                      role="listitem"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--bg-hover)',
                        borderLeft: `3px solid ${borderColor}`,
                        borderRadius: 8,
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <span style={{
                        fontSize: 9, fontWeight: 700, borderRadius: 6,
                        padding: '1px 5px', flexShrink: 0,
                        background: badgeBg,
                        color: badgeColor,
                        border: badgeBorder,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        {isCreated ? t('changes.statusCreated') : t('changes.statusModified')}
                      </span>
                      <span title={f.filePath} style={{
                        fontSize: 11, fontFamily: 'monospace', color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                      }}>
                        {f.basename}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', flexShrink: 0, display: 'flex', gap: 6, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                        {f.linesAdded > 0 && <span style={{ color: '#4ade80' }}>+{f.linesAdded}</span>}
                        {f.linesRemoved > 0 && <span style={{ color: '#f87171' }}>-{f.linesRemoved}</span>}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Per-turn breakdown */}
              {turns.length > 0 && (
                <div style={{ borderTop: '1px solid var(--bg-hover)', paddingTop: 4 }}>
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
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t('changes.turn', { num: String(idx + 1), prompt: turn.userPromptPreview })}
                          </span>
                        </button>
                        {isExpanded && turn.files.map(f => {
                          const isCreated = f.status === 'created'
                          const badgeBg = isCreated ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)'
                          const badgeColor = isCreated ? '#86efac' : '#a5b4fc'
                          const badgeBorder = isCreated ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(99,102,241,0.25)'
                          return (
                            <div key={f.filePath} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '3px 12px 3px 32px', fontSize: 11,
                              borderBottom: '1px solid var(--bg-hover)',
                              borderLeft: `3px solid ${isCreated ? 'rgba(34,197,94,0.3)' : 'rgba(99,102,241,0.3)'}`,
                            }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, borderRadius: 6,
                                padding: '1px 5px', flexShrink: 0,
                                background: badgeBg,
                                color: badgeColor,
                                border: badgeBorder,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                              }}>
                                {isCreated ? t('changes.statusCreated') : t('changes.statusModified')}
                              </span>
                              <span title={f.filePath} style={{
                                fontFamily: 'monospace', fontSize: 11,
                                color: 'var(--text-primary)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                              }}>
                                {f.basename}
                              </span>
                              <span style={{ fontFamily: 'monospace', flexShrink: 0, display: 'flex', gap: 4, fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                                {f.linesAdded > 0 && <span style={{ color: '#4ade80' }}>+{f.linesAdded}</span>}
                                {f.linesRemoved > 0 && <span style={{ color: '#f87171' }}>-{f.linesRemoved}</span>}
                              </span>
                            </div>
                          )
                        })}
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
