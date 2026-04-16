// ContextUsageMeter — shows context window usage bar in ChatInput (Iteration 455, 488)
// Iteration 488: Added context suggestions popover inspired by Claude Code's contextSuggestions.ts
import React, { useState } from 'react'
import { Archive, Lightbulb, Loader2, X } from 'lucide-react'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'

interface ContextUsageMeterProps {
  used: number
  total: number
  isStreaming: boolean
  onCompact: () => void
  /** Optional per-tool token breakdown for suggestions */
  toolBreakdown?: Record<string, number>
}

interface ContextSuggestion {
  title: string
  detail: string
  savingsTokens: number
  severity: 'warning' | 'info'
}

/** Generate context optimization suggestions based on usage and tool breakdown */
function generateSuggestions(used: number, total: number, toolBreakdown?: Record<string, number>): ContextSuggestion[] {
  const suggestions: ContextSuggestion[] = []
  const pct = (used / total) * 100
  if (!toolBreakdown) return suggestions

  const bash = toolBreakdown['Bash'] || 0
  const fileRead = toolBreakdown['Read'] || 0
  const webFetch = toolBreakdown['WebFetch'] || 0
  const memory = toolBreakdown['memory'] || 0

  // Thresholds from sourcemap's contextSuggestions.ts
  if (bash / total > 0.15) {
    suggestions.push({
      title: 'Long command outputs',
      detail: `Shell outputs using ~${Math.round(bash / 1000)}k tokens. Consider asking for summaries.`,
      savingsTokens: Math.round(bash * 0.6),
      severity: 'warning',
    })
  }
  if (fileRead / total > 0.05) {
    suggestions.push({
      title: 'Large file reads',
      detail: `File reads consuming ~${Math.round(fileRead / 1000)}k tokens. Use line ranges when possible.`,
      savingsTokens: Math.round(fileRead * 0.5),
      severity: 'info',
    })
  }
  if (webFetch / total > 0.08) {
    suggestions.push({
      title: 'Web fetch responses',
      detail: `Web content using ~${Math.round(webFetch / 1000)}k tokens. Ask for extracted summaries.`,
      savingsTokens: Math.round(webFetch * 0.7),
      severity: 'info',
    })
  }
  if (memory / total > 0.1) {
    suggestions.push({
      title: 'Memory injection overhead',
      detail: `Memory items using ~${Math.round(memory / 1000)}k tokens. Prune pinned memories.`,
      savingsTokens: Math.round(memory * 0.4),
      severity: 'info',
    })
  }
  if (pct >= 85 && suggestions.length === 0) {
    suggestions.push({
      title: 'Context window nearly full',
      detail: 'Start a new session or compact the conversation to free space.',
      savingsTokens: 0,
      severity: 'warning',
    })
  }
  return suggestions
}

export default function ContextUsageMeter({ used, total, isStreaming, onCompact, toolBreakdown }: ContextUsageMeterProps) {
  const t = useT()
  const isCompacting = useChatStore(s => s.isCompacting)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const pct = Math.round((used / total) * 100)
  if (pct < 40) return null

  // Thresholds: <70% indigo, 70-90% amber, >90% red
  const barGradient = pct >= 90
    ? 'linear-gradient(90deg, rgba(239,68,68,0.85), rgba(248,113,113,0.85))'
    : pct >= 70
      ? 'linear-gradient(90deg, rgba(251,191,36,0.85), rgba(251,191,36,0.7))'
      : 'linear-gradient(90deg, rgba(99,102,241,0.8), rgba(139,92,246,0.8))'

  // Text color for the percentage label
  const barColor = pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : 'var(--text-muted)'

  const suggestions = generateSuggestions(used, total, toolBreakdown)
  const hasSuggestions = suggestions.length > 0 && pct >= 70

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        background: 'var(--bg-primary)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderRadius: 8,
        padding: '10px 12px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
        }}>
          <div style={{
            flex: 1, height: 4, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(pct, 100)}%`, height: '100%', background: barGradient,
              borderRadius: 4, transition: 'all 0.15s ease',
            }} />
          </div>
          <span style={{
            fontSize: 11,
            color: barColor,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
          }}>
            {pct}%
          </span>
          {hasSuggestions && (
            <button
              onClick={() => setShowSuggestions(s => !s)}
              title="Context optimization suggestions"
              style={{
                display: 'flex', alignItems: 'center',
                padding: '1px 4px', fontSize: 9,
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                borderRadius: 6, color: '#818cf8', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.15)'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <Lightbulb size={9} />
            </button>
          )}
          {pct >= 60 && !isStreaming && (
            <button
              onClick={onCompact}
              disabled={isCompacting}
              title={isCompacting ? t('compact.inProgress') : t('compact.buttonHint')}
              aria-label={isCompacting ? t('compact.inProgress') : t('compact.buttonHint')}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', fontSize: 9, fontWeight: 500,
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: 8, color: '#818cf8', cursor: isCompacting ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                opacity: isCompacting ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isCompacting) {
                  e.currentTarget.style.background = 'rgba(99,102,241,0.15)'
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'
              }}
            >
              {isCompacting
                ? <Loader2 size={9} style={{ color: '#818cf8', animation: 'spin 1s linear infinite' }} />
                : <Archive size={9} />
              }
              {isCompacting ? t('compact.inProgress') : t('compact.button')}
            </button>
          )}
        </div>
      </div>

      {/* Suggestions popover */}
      {showSuggestions && hasSuggestions && (
        <div style={{
          position: 'absolute', bottom: '100%', right: 0, marginBottom: 6,
          background: 'var(--popup-bg)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 10, width: 280, zIndex: 100,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          animation: 'slideUp 0.15s ease',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 6,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              color: 'var(--text-muted)', textTransform: 'uppercase',
            }}>
              Context Suggestions
            </span>
            <button
              onClick={() => setShowSuggestions(false)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', padding: 2,
                borderRadius: 8, transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <X size={12} />
            </button>
          </div>
          {suggestions.map((s, i) => (
            <div key={i} style={{
              padding: '8px 10px', borderRadius: 8, marginBottom: 4,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${s.severity === 'warning' ? 'rgba(251,191,36,0.6)' : 'rgba(99,102,241,0.5)'}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                {s.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, opacity: 0.75 }}>
                {s.detail}
              </div>
              {s.savingsTokens > 0 && (
                <div style={{
                  marginTop: 4, display: 'inline-block',
                  background: 'rgba(74,222,128,0.12)', color: '#4ade80',
                  borderRadius: 6, padding: '1px 5px', fontSize: 10,
                  fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
                }}>
                  ~{Math.round(s.savingsTokens / 1000)}k tokens could be saved
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
