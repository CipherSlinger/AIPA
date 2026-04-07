// ContextUsageMeter — shows context window usage bar in ChatInput (Iteration 455, 488)
// Iteration 488: Added context suggestions popover inspired by Claude Code's contextSuggestions.ts
import React, { useState } from 'react'
import { Archive, Lightbulb, X } from 'lucide-react'
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
  const [showSuggestions, setShowSuggestions] = useState(false)
  const pct = Math.round((used / total) * 100)
  if (pct < 40) return null
  const barColor = pct >= 85 ? 'var(--error)' : pct >= 70 ? '#f97316' : pct >= 55 ? 'var(--warning)' : 'var(--accent)'

  const suggestions = generateSuggestions(used, total, toolBreakdown)
  const hasSuggestions = suggestions.length > 0 && pct >= 70

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px', marginBottom: 4,
      }}>
        <div style={{
          flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor,
            borderRadius: 2, transition: 'width 300ms ease, background 300ms ease',
          }} />
        </div>
        <span style={{ fontSize: 9, color: barColor, fontWeight: 500, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </span>
        {hasSuggestions && (
          <button
            onClick={() => setShowSuggestions(s => !s)}
            title="Context optimization suggestions"
            style={{
              display: 'flex', alignItems: 'center',
              padding: '1px 4px', fontSize: 9,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 8, color: '#f59e0b', cursor: 'pointer',
              transition: 'background 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.15)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.08)' }}
          >
            <Lightbulb size={9} />
          </button>
        )}
        {pct >= 60 && !isStreaming && (
          <button
            onClick={onCompact}
            title={t('chat.compactHint')}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '1px 6px', fontSize: 9, fontWeight: 500,
              background: 'rgba(0, 122, 204, 0.08)', border: '1px solid rgba(0, 122, 204, 0.2)',
              borderRadius: 8, color: 'var(--accent)', cursor: 'pointer',
              transition: 'background 150ms, border-color 150ms', whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.15)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.08)'; e.currentTarget.style.borderColor = 'rgba(0, 122, 204, 0.2)' }}
          >
            <Archive size={9} />
            {t('chat.compactBtn')}
          </button>
        )}
      </div>

      {/* Suggestions popover */}
      {showSuggestions && hasSuggestions && (
        <div style={{
          position: 'absolute', bottom: '100%', right: 0, marginBottom: 6,
          background: 'var(--popup-bg)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 10, width: 280, zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
              Context Suggestions
            </span>
            <button onClick={() => setShowSuggestions(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
              <X size={12} />
            </button>
          </div>
          {suggestions.map((s, i) => (
            <div key={i} style={{
              padding: '6px 8px', borderRadius: 6, marginBottom: 4,
              background: s.severity === 'warning' ? 'rgba(239,68,68,0.06)' : 'rgba(59,130,246,0.06)',
              borderLeft: `2px solid ${s.severity === 'warning' ? 'var(--error)' : 'var(--accent)'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                {s.title}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {s.detail}
              </div>
              {s.savingsTokens > 0 && (
                <div style={{ fontSize: 9, color: 'var(--success)', marginTop: 3 }}>
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
