import React from 'react'
import { History, TrendingUp, Star, X } from 'lucide-react'
import { useT } from '../../i18n'

interface PromptHistoryItem {
  id: string
  text: string
  count: number
  favorite?: boolean
}

interface WelcomeRecentPromptsProps {
  recentPrompts: string[]
  topPrompts: PromptHistoryItem[]
  onSuggestion: (text: string) => void
  onClearHistory: () => void
  onToggleFavorite: (id: string) => void
}

/**
 * Recent prompts + top frequent prompts sections for the welcome screen.
 * Extracted from WelcomeScreen.tsx (Iteration 454).
 */
export default function WelcomeRecentPrompts({
  recentPrompts,
  topPrompts,
  onSuggestion,
  onClearHistory,
  onToggleFavorite,
}: WelcomeRecentPromptsProps) {
  const t = useT()

  return (
    <>
      {/* Recent prompts */}
      {recentPrompts.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <History size={11} />
            <span style={{ flex: 1 }}>{t('welcome.recentPrompts')}</span>
            <button
              onClick={onClearHistory}
              title={t('welcome.clearHistory')}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', padding: '1px 3px', borderRadius: 3,
                fontSize: 10, gap: 2, opacity: 0.7, transition: 'color 150ms, opacity 150ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--error)'; (e.currentTarget as HTMLElement).style.opacity = '1' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
            >
              <X size={10} />
              {t('welcome.clearHistory')}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => onSuggestion(prompt)}
                style={{
                  background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8,
                  padding: '8px 12px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
                  textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)'
                }}
                title={prompt}
              >
                {prompt.length > 80 ? prompt.slice(0, 80) + '...' : prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top prompts (most frequently used) */}
      {topPrompts.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <TrendingUp size={11} />
            <span>{t('welcome.topPrompts')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topPrompts.map((item) => (
              <div key={item.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  onClick={() => onSuggestion(item.text)}
                  style={{
                    flex: 1, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8,
                    padding: '8px 12px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
                    textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)'
                  }}
                  title={item.text}
                >
                  {item.text.length > 70 ? item.text.slice(0, 70) + '...' : item.text}
                </button>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 20, textAlign: 'right' }}>
                  {item.count}x
                </span>
                <button
                  onClick={() => onToggleFavorite(item.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                    color: item.favorite ? 'var(--warning)' : 'var(--text-muted)', transition: 'color 0.15s',
                  }}
                  title={item.favorite ? t('welcome.unfavorite') : t('welcome.favorite')}
                >
                  <Star size={12} style={item.favorite ? { fill: 'var(--warning)' } : {}} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
