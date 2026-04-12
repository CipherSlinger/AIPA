import React, { useState } from 'react'
import { History, TrendingUp, Star, X, ChevronRight } from 'lucide-react'
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
  const [hoveredRecent, setHoveredRecent] = useState<number | null>(null)
  const [hoveredTop, setHoveredTop] = useState<string | null>(null)

  return (
    <>
      {/* Recent prompts */}
      {recentPrompts.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.38)', marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <History size={11} color="rgba(255,255,255,0.38)" />
            <span style={{ flex: 1 }}>{t('welcome.recentPrompts')}</span>
            <button
              onClick={onClearHistory}
              title={t('welcome.clearHistory')}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.38)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', padding: '1px 3px', borderRadius: 6,
                fontSize: 10, gap: 2, transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#f87171' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.38)' }}
            >
              <X size={10} />
              {t('welcome.clearHistory')}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recentPrompts.map((prompt, i) => {
              const isHovered = hoveredRecent === i
              return (
                <button
                  key={i}
                  onClick={() => onSuggestion(prompt)}
                  onMouseEnter={() => setHoveredRecent(i)}
                  onMouseLeave={() => setHoveredRecent(null)}
                  title={prompt}
                  style={{
                    background: isHovered ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none',
                    borderRadius: 8,
                    padding: '7px 10px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{
                    flex: 1,
                    fontSize: 12, color: 'rgba(255,255,255,0.60)', lineHeight: 1.4,
                    textAlign: 'left',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {prompt.length > 80 ? prompt.slice(0, 80) + '...' : prompt}
                  </span>
                  <ChevronRight
                    size={12}
                    color="rgba(255,255,255,0.4)"
                    style={{ flexShrink: 0, opacity: isHovered ? 1 : 0, transition: 'all 0.15s ease' }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Top prompts (most frequently used) */}
      {topPrompts.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.38)', marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <TrendingUp size={11} color="rgba(255,255,255,0.38)" />
            <span>{t('welcome.topPrompts')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {topPrompts.map((item) => {
              const isHovered = hoveredTop === item.id
              return (
                <div key={item.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    onClick={() => onSuggestion(item.text)}
                    onMouseEnter={() => setHoveredTop(item.id)}
                    onMouseLeave={() => setHoveredTop(null)}
                    title={item.text}
                    style={{
                      flex: 1,
                      background: isHovered ? 'rgba(255,255,255,0.06)' : 'transparent',
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 10px',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{
                      flex: 1,
                      fontSize: 12, color: 'rgba(255,255,255,0.60)', lineHeight: 1.4,
                      textAlign: 'left',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.text.length > 70 ? item.text.slice(0, 70) + '...' : item.text}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.45)', flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                      {item.count}x
                    </span>
                    <ChevronRight
                      size={12}
                      color="rgba(255,255,255,0.4)"
                      style={{ flexShrink: 0, opacity: isHovered ? 1 : 0, transition: 'all 0.15s ease' }}
                    />
                  </button>
                  <button
                    onClick={() => onToggleFavorite(item.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                      color: item.favorite ? '#fbbf24' : 'rgba(255,255,255,0.38)',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                    title={item.favorite ? t('welcome.unfavorite') : t('welcome.favorite')}
                  >
                    <Star size={12} style={item.favorite ? { fill: '#fbbf24' } : {}} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
