import React, { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'

interface SessionStats {
  totalSessions: number
  totalMessages: { user: number; assistant: number; tool: number }
  totalTokens: { input: number; output: number } | null
  toolUsage: { name: string; count: number }[]
  dailyActivity: { date: string; sessions: number; messages: number }[]
  averageSessionMessages: number
  dateRange: { from: string; to: string }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function toolColor(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('bash') || lower.includes('exec') || lower.includes('run')) return '#6366f1'
  if (lower.includes('read') || lower.includes('write') || lower.includes('file') || lower.includes('edit')) return '#4ade80'
  if (lower.includes('search') || lower.includes('grep') || lower.includes('glob')) return '#fbbf24'
  if (lower.includes('web') || lower.includes('fetch') || lower.includes('url')) return '#a78bfa'
  return '#6366f1'
}

function toolGlow(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('bash') || lower.includes('exec') || lower.includes('run')) return 'rgba(99,102,241,0.25)'
  if (lower.includes('read') || lower.includes('write') || lower.includes('file') || lower.includes('edit')) return 'rgba(74,222,128,0.25)'
  if (lower.includes('search') || lower.includes('grep') || lower.includes('glob')) return 'rgba(251,191,36,0.25)'
  if (lower.includes('web') || lower.includes('fetch') || lower.includes('url')) return 'rgba(167,139,250,0.25)'
  return 'rgba(99,102,241,0.25)'
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

type Range = '7' | '30'

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.38)',
  marginBottom: 12,
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 10,
  padding: '16px',
}

export default function SettingsStats() {
  const { t } = useI18n()
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('7')

  useEffect(() => {
    setLoading(true)
    setError(null)
    window.electronAPI.sessionGetStats()
      .then((data: SessionStats) => {
        setStats(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(String(err))
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 0', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '2px solid rgba(99,102,241,0.3)',
          borderTopColor: 'rgba(99,102,241,0.85)',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>{t('stats.loading')}</span>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div style={{
        padding: '32px 0', textAlign: 'center',
        color: 'rgba(255,255,255,0.38)', fontSize: 13,
      }}>
        {t('stats.error')}
      </div>
    )
  }

  const totalMsgs = stats.totalMessages.user + stats.totalMessages.assistant
  const totalTokensNum = stats.totalTokens
    ? stats.totalTokens.input + stats.totalTokens.output
    : null

  // Slice daily activity for selected range
  const rangeNum = parseInt(range, 10)
  const activitySlice = stats.dailyActivity.slice(-rangeNum)
  const maxSessions = Math.max(1, ...activitySlice.map(d => d.sessions))

  const maxToolCount = stats.toolUsage.length > 0 ? stats.toolUsage[0].count : 1

  const overviewCards = [
    {
      label: t('stats.totalSessions'),
      value: formatNumber(stats.totalSessions),
      sub: t('stats.sessions'),
      accent: '#a5b4fc',
      accentBg: 'rgba(99,102,241,0.08)',
      accentBgHover: 'rgba(99,102,241,0.13)',
    },
    {
      label: t('stats.totalMessages'),
      value: formatNumber(totalMsgs),
      sub: `${formatNumber(stats.totalMessages.user)} user / ${formatNumber(stats.totalMessages.assistant)} asst`,
      accent: '#4ade80',
      accentBg: 'rgba(74,222,128,0.08)',
      accentBgHover: 'rgba(74,222,128,0.13)',
    },
    {
      label: t('stats.totalTokens'),
      value: totalTokensNum !== null ? formatNumber(totalTokensNum) : '—',
      sub: totalTokensNum !== null
        ? `${formatNumber(stats.totalTokens!.input)} in / ${formatNumber(stats.totalTokens!.output)} out`
        : t('stats.noTokenData'),
      accent: '#fbbf24',
      accentBg: 'rgba(251,191,36,0.08)',
      accentBgHover: 'rgba(251,191,36,0.13)',
    },
    {
      label: t('stats.avgSessionLength'),
      value: String(stats.averageSessionMessages),
      sub: t('stats.msgsPerSession'),
      accent: '#a78bfa',
      accentBg: 'rgba(167,139,250,0.08)',
      accentBgHover: 'rgba(167,139,250,0.13)',
    },
  ]

  return (
    <div style={{ paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Overview cards */}
      <div>
        <div style={sectionLabelStyle}>{t('stats.overview')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {overviewCards.map(card => (
            <div
              key={card.label}
              style={{
                ...cardStyle,
                background: card.accentBg,
                borderColor: 'rgba(255,255,255,0.07)',
                position: 'relative',
                overflow: 'hidden',
                transition: 'background 0.15s ease, border-color 0.15s ease',
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = card.accentBgHover
                ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.12)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = card.accentBg
                ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'
              }}
            >
              {/* Accent bar */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, ${card.accent}60, transparent)`,
              }} />
              <div style={{
                fontSize: 11, color: 'rgba(255,255,255,0.45)',
                marginBottom: 6, fontWeight: 500,
              }}>
                {card.label}
              </div>
              <div style={{
                fontSize: 24, fontWeight: 700, color: card.accent,
                lineHeight: 1.1,
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
                letterSpacing: '-0.02em',
              }}>
                {card.value}
              </div>
              <div style={{
                fontSize: 10, color: 'rgba(255,255,255,0.38)',
                marginTop: 4, lineHeight: 1.4,
              }}>
                {card.sub}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tool usage bar chart */}
      {stats.toolUsage.length > 0 && (
        <div>
          <div style={sectionLabelStyle}>{t('stats.topTools')}</div>
          <div style={cardStyle}>
            {stats.toolUsage.map((tool, idx, arr) => {
              const pct = (tool.count / maxToolCount) * 100
              const color = toolColor(tool.name)
              const glow = toolGlow(tool.name)
              return (
                <React.Fragment key={tool.name}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                  }}>
                    {/* Color dot */}
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: color, flexShrink: 0,
                      boxShadow: `0 0 6px ${glow}`,
                    }} />
                    <div style={{
                      width: 100, fontSize: 12, color: 'rgba(255,255,255,0.82)',
                      whiteSpace: 'nowrap', overflow: 'hidden',
                      textOverflow: 'ellipsis', flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {tool.name}
                    </div>
                    {/* Bar track */}
                    <div style={{
                      flex: 1, background: 'rgba(255,255,255,0.05)',
                      borderRadius: 4, height: 8, overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${pct}%`, height: '100%',
                        background: `linear-gradient(90deg, ${color}, ${color}99)`,
                        borderRadius: 4,
                        transition: 'width 0.5s cubic-bezier(0.34,1.56,0.64,1)',
                        boxShadow: `0 0 8px ${glow}`,
                      }} />
                    </div>
                    <div style={{
                      width: 56, fontSize: 11,
                      color: 'rgba(255,255,255,0.45)',
                      textAlign: 'right', flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                      fontFeatureSettings: '"tnum"',
                    }}>
                      {formatNumber(tool.count)} {t('stats.uses')}
                    </div>
                  </div>
                  {idx < arr.length - 1 && (
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.04)' }} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}

      {/* Activity trend */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 12,
        }}>
          <div style={sectionLabelStyle}>{t('stats.activityTrend')}</div>
          <div style={{
            display: 'flex', gap: 4,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 6, padding: 2,
          }}>
            {(['7', '30'] as Range[]).map(r => {
              const isActive = range === r
              return (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  style={{
                    background: isActive
                      ? 'rgba(99,102,241,0.30)'
                      : 'transparent',
                    border: isActive
                      ? '1px solid rgba(99,102,241,0.45)'
                      : '1px solid transparent',
                    borderRadius: 4,
                    padding: '2px 10px',
                    color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 400,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {r === '7' ? t('stats.days7') : t('stats.days30')}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '16px 16px 12px' }}>
          {activitySlice.length === 0 || activitySlice.every(d => d.sessions === 0) ? (
            <div style={{
              textAlign: 'center', color: 'rgba(255,255,255,0.38)',
              fontSize: 12, padding: '24px 0',
            }}>
              {t('stats.noActivity')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: rangeNum === 30 ? 3 : 6,
                minWidth: 0, height: 80, paddingBottom: 22,
              }}>
                {activitySlice.map((day, i) => {
                  const barH = maxSessions > 0 ? Math.max(3, (day.sessions / maxSessions) * 60) : 3
                  const showLabel = rangeNum === 7 || i % 5 === 0
                  const isActive = day.sessions > 0
                  return (
                    <div
                      key={day.date}
                      title={`${day.date}: ${day.sessions} ${t('stats.sessions')}`}
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'flex-end', height: '100%',
                      }}
                    >
                      <div style={{
                        width: '100%',
                        maxWidth: rangeNum === 30 ? 12 : 24,
                        height: `${barH}px`,
                        background: isActive
                          ? 'linear-gradient(180deg, rgba(139,92,246,0.85), rgba(99,102,241,0.85))'
                          : 'rgba(255,255,255,0.06)',
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.35s ease',
                        boxShadow: isActive ? '0 -2px 8px rgba(99,102,241,0.3)' : 'none',
                      }} />
                      {showLabel && (
                        <div style={{
                          fontSize: 9, color: 'rgba(255,255,255,0.38)',
                          marginTop: 4, whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {shortDate(day.date)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Date range note */}
      {stats.totalSessions > 0 && (
        <div style={{
          fontSize: 10, color: 'rgba(255,255,255,0.38)',
          textAlign: 'right', fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
          marginTop: -12,
        }}>
          {t('stats.dataRange')}: {stats.dateRange.from} – {stats.dateRange.to}
        </div>
      )}
    </div>
  )
}
