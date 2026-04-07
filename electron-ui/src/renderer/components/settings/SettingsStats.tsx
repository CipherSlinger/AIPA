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
  if (lower.includes('bash') || lower.includes('exec') || lower.includes('run')) return '#3b82f6'
  if (lower.includes('read') || lower.includes('write') || lower.includes('file') || lower.includes('edit')) return '#10b981'
  if (lower.includes('search') || lower.includes('grep') || lower.includes('glob')) return '#f59e0b'
  if (lower.includes('web') || lower.includes('fetch') || lower.includes('url')) return '#8b5cf6'
  return '#6366f1'
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

type Range = '7' | '30'

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
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        {t('stats.loading')}
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
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
    },
    {
      label: t('stats.totalMessages'),
      value: formatNumber(totalMsgs),
      sub: `${formatNumber(stats.totalMessages.user)} ${t('stats.userMsgs')} / ${formatNumber(stats.totalMessages.assistant)} ${t('stats.assistantMsgs')}`,
    },
    {
      label: t('stats.totalTokens'),
      value: totalTokensNum !== null ? formatNumber(totalTokensNum) : '—',
      sub: totalTokensNum !== null
        ? `${formatNumber(stats.totalTokens!.input)} in / ${formatNumber(stats.totalTokens!.output)} out`
        : t('stats.noTokenData'),
    },
    {
      label: t('stats.avgSessionLength'),
      value: String(stats.averageSessionMessages),
      sub: t('stats.msgsPerSession'),
    },
  ]

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Overview cards */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        {t('stats.overview')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        {overviewCards.map(card => (
          <div
            key={card.label}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{card.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Tool usage bar chart */}
      {stats.toolUsage.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            {t('stats.topTools')}
          </div>
          <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.toolUsage.map(tool => {
              const pct = (tool.count / maxToolCount) * 100
              const color = toolColor(tool.name)
              return (
                <div key={tool.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 110, fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
                    {tool.name}
                  </div>
                  <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: color,
                        borderRadius: 4,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                  <div style={{ width: 48, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
                    {formatNumber(tool.count)} {t('stats.uses')}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Activity trend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {t('stats.activityTrend')}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['7', '30'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                background: range === r ? 'var(--accent)' : 'none',
                border: '1px solid ' + (range === r ? 'var(--accent)' : 'var(--border)'),
                borderRadius: 4,
                padding: '2px 10px',
                color: range === r ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: range === r ? 600 : 400,
              }}
            >
              {r === '7' ? t('stats.days7') : t('stats.days30')}
            </button>
          ))}
        </div>
      </div>

      {activitySlice.length === 0 || activitySlice.every(d => d.sessions === 0) ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '16px 0' }}>
          {t('stats.noActivity')}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: rangeNum === 30 ? 3 : 6, minWidth: 0, height: 100, paddingBottom: 20 }}>
            {activitySlice.map((day, i) => {
              const barH = maxSessions > 0 ? Math.max(2, (day.sessions / maxSessions) * 80) : 2
              const showLabel = rangeNum === 7 || i % 5 === 0
              return (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.sessions} ${t('stats.sessions')}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}
                >
                  <div
                    style={{
                      width: '100%',
                      maxWidth: rangeNum === 30 ? 12 : 24,
                      height: `${barH}px`,
                      background: day.sessions > 0 ? 'var(--accent)' : 'var(--border)',
                      borderRadius: '3px 3px 0 0',
                      opacity: day.sessions > 0 ? 1 : 0.4,
                      transition: 'height 0.3s ease',
                    }}
                  />
                  {showLabel && (
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap' }}>
                      {shortDate(day.date)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Date range note */}
      {stats.totalSessions > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, textAlign: 'right' }}>
          {t('stats.dataRange')}: {stats.dateRange.from} – {stats.dateRange.to}
        </div>
      )}
    </div>
  )
}
