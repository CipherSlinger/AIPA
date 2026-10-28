// CodexAccountPanel — real Codex account state in Settings › Stats.
//
// Backed by two read-only app-server probes (`codex:rateLimits` and
// `codex:accountUsage`). Both are optional: Claude users get `success: false`
// from both, and this component renders nothing at all so the Stats page keeps
// working for them. Any individual field may be null (Codex returns sparse
// snapshots) — nulls are dropped or shown as an em dash, never printed.

import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useI18n } from '../../i18n'
import type {
  CodexAccountUsageData,
  CodexRateLimitSnapshotData,
  CodexRateLimitWindowData,
  CodexRateLimitsData,
} from '../../../preload/index'

interface AccountState {
  limits: CodexRateLimitsData | null
  usage: CodexAccountUsageData | null
}

const EMPTY_STATE: AccountState = { limits: null, usage: null }

const cardStyle: React.CSSProperties = {
  background: 'var(--glass-bg-low)',
  border: '1px solid var(--glass-border)',
  borderRadius: 10,
  padding: 16,
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
  marginBottom: 12,
}

const numberStyle: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
}

/** Compact token counts: 1.2M / 850K, with locale-aware digits. */
function formatCompact(value: number, locale: string): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1_000_000)}M`
  }
  if (abs >= 1_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1_000)}K`
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

function formatPercent(usedPercent: number, locale: string): string {
  if (!Number.isFinite(usedPercent)) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(Math.max(0, usedPercent) / 100)
}

/** Locale-aware short duration, e.g. "23 min" / "23分钟". */
function formatUnit(value: number, unit: 'day' | 'second' | 'minute' | 'hour', locale: string): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'narrow',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * "in 2 hr. 13m" / "2小时后 13分钟" — the leading part comes from
 * Intl.RelativeTimeFormat (locale-correct "in"/"后" phrasing); the remainder
 * is a bare narrow unit so we never emit a doubled preposition.
 */
function formatResetIn(resetsAtSec: number, nowMs: number, locale: string): string {
  const diffMs = resetsAtSec * 1000 - nowMs
  const absMin = Math.round(Math.abs(diffMs) / 60_000)
  const sign = diffMs < 0 ? -1 : 1
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })

  if (absMin < 1) return rtf.format(0, 'second')
  if (absMin < 60) return rtf.format(sign * absMin, 'minute')
  if (absMin < 1440) {
    const hours = Math.floor(absMin / 60)
    const mins = absMin % 60
    const hourPart = rtf.format(sign * hours, 'hour')
    return mins === 0 ? hourPart : `${hourPart} ${formatUnit(mins, 'minute', locale)}`
  }
  const days = Math.floor(absMin / 1440)
  const hours = Math.floor((absMin % 1440) / 60)
  const dayPart = rtf.format(sign * days, 'day')
  return hours === 0 ? dayPart : `${dayPart} ${formatUnit(hours, 'hour', locale)}`
}

/** "5-hour window" / "weekly" / "Weekly window", falling back to primary/secondary. */
function windowLabel(
  mins: number | null,
  position: 'primary' | 'secondary',
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (mins === null || mins <= 0) {
    return t(`codex.account.window.${position}`)
  }
  if (mins % 1440 === 0) {
    const days = mins / 1440
    return days === 7 ? t('codex.account.window.weekly') : t('codex.account.window.days', { count: days })
  }
  if (mins % 60 === 0) {
    return t('codex.account.window.hours', { count: mins / 60 })
  }
  return t('codex.account.window.minutes', { count: mins })
}

/**
 * `rateLimitsByLimitId` carries the up-to-date snapshot keyed by `limitId`;
 * the top-level `rateLimits` can lag. Prefer the keyed entry when it exists.
 */
function pickSnapshot(data: CodexRateLimitsData | null): CodexRateLimitSnapshotData | null {
  if (!data) return null
  const byId = data.rateLimitsByLimitId
  const id = data.rateLimits?.limitId ?? null
  if (byId && id && byId[id]) return byId[id]
  return data.rateLimits ?? null
}

function hasLimitsContent(snapshot: CodexRateLimitSnapshotData | null): boolean {
  if (!snapshot) return false
  return Boolean(
    snapshot.planType
      || snapshot.primary
      || snapshot.secondary
      || snapshot.credits
      || snapshot.rateLimitReachedType,
  )
}

function hasUsageContent(usage: CodexAccountUsageData | null): boolean {
  if (!usage) return false
  const s = usage.summary
  const anySummary = s.lifetimeTokens !== null
    || s.peakDailyTokens !== null
    || s.currentStreakDays !== null
    || s.longestStreakDays !== null
    || s.longestRunningTurnSec !== null
  return anySummary || Boolean(usage.dailyUsageBuckets && usage.dailyUsageBuckets.length > 0)
}

/** 14-day token sparkline — inline SVG, currentColor, no animation. */
function UsageSparkline({ buckets, label }: { buckets: Array<{ startDate: string; tokens: number }>; label: string }) {
  const points = buckets.slice(-14)
  if (points.length < 2) return null

  const width = 100
  const height = 24
  const pad = 2
  const max = Math.max(1, ...points.map(b => Math.max(0, b.tokens)))
  const step = width / (points.length - 1)
  const coords = points.map((bucket, i) => {
    const x = i * step
    const y = height - pad - (Math.max(0, bucket.tokens) / max) * (height - pad * 2)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const areaPath = `M0,${height} L${coords.join(' L')} L${width},${height} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height: 28, marginTop: 12, color: 'var(--text-muted)' }}
      role="img"
      aria-label={label}
      focusable="false"
    >
      <path d={areaPath} fill="currentColor" opacity={0.1} />
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.55}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

interface UsageTile {
  label: string
  value: string | null
}

function UsageSummary({ usage, locale }: { usage: CodexAccountUsageData; locale: string }) {
  const { t } = useI18n()
  const s = usage.summary

  const tiles: UsageTile[] = [
    { label: t('codex.account.usage.lifetime'), value: s.lifetimeTokens !== null ? formatCompact(s.lifetimeTokens, locale) : null },
    { label: t('codex.account.usage.peakDaily'), value: s.peakDailyTokens !== null ? formatCompact(s.peakDailyTokens, locale) : null },
    { label: t('codex.account.usage.currentStreak'), value: s.currentStreakDays !== null ? formatUnit(s.currentStreakDays, 'day', locale) : null },
    { label: t('codex.account.usage.longestStreak'), value: s.longestStreakDays !== null ? formatUnit(s.longestStreakDays, 'day', locale) : null },
    {
      label: t('codex.account.usage.longestTurn'),
      value: s.longestRunningTurnSec !== null
        ? formatUnit(s.longestRunningTurnSec < 60 ? s.longestRunningTurnSec : Math.round(s.longestRunningTurnSec / 60), s.longestRunningTurnSec < 60 ? 'second' : 'minute', locale)
        : null,
    },
  ]

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--glass-border)' }}>
      <div style={sectionLabelStyle}>{t('codex.account.usage.title')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        {tiles.map(tile => (
          <div key={tile.label} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>
              {tile.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2, ...numberStyle }}>
              {tile.value ?? '—'}
            </div>
          </div>
        ))}
      </div>
      {usage.dailyUsageBuckets && usage.dailyUsageBuckets.length > 1 && (
        <UsageSparkline
          buckets={usage.dailyUsageBuckets}
          label={t('codex.account.sparklineAria')}
        />
      )}
    </div>
  )
}

function LimitWindowRow({
  limitWindow,
  position,
  snapshotReached,
  now,
  locale,
}: {
  limitWindow: CodexRateLimitWindowData
  position: 'primary' | 'secondary'
  snapshotReached: boolean
  now: number
  locale: string
}) {
  const { t } = useI18n()
  const used = Math.min(100, Math.max(0, limitWindow.usedPercent))
  const reached = snapshotReached || limitWindow.usedPercent >= 100
  const label = windowLabel(limitWindow.windowDurationMins, position, t)
  const percent = formatPercent(limitWindow.usedPercent, locale)
  const resetText = limitWindow.resetsAt !== null
    ? formatResetIn(limitWindow.resetsAt, now, locale)
    : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: reached ? 'var(--danger-text)' : 'var(--text-primary)', ...numberStyle }}>
          {t('codex.account.usedPercent', { percent })}
          {reached && ` · ${t('codex.account.limitReached')}`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t('codex.account.usageAria', { window: label, percent })}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={t('codex.account.usedPercent', { percent })}
        style={{
          height: 6,
          marginTop: 6,
          borderRadius: 3,
          background: 'var(--bg-hover)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          width: `${used}%`,
          height: '100%',
          borderRadius: 3,
          background: reached ? 'var(--danger-text)' : 'var(--accent-text)',
          transition: 'width 0.15s ease',
        }} />
      </div>
      {resetText && (
        <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4 }}>
          {t('codex.account.resetsIn', { time: resetText })}
        </div>
      )}
    </div>
  )
}

function CreditValue({ snapshot, t }: {
  snapshot: CodexRateLimitSnapshotData
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const credits = snapshot.credits
  if (!credits) return null
  if (credits.unlimited) return <>{t('codex.account.creditsUnlimited')}</>
  if (credits.balance !== null) return <>{t('codex.account.creditsBalance', { balance: credits.balance })}</>
  if (credits.hasCredits) return <>{t('codex.account.creditsAvailable')}</>
  return <>{t('codex.account.creditsNone')}</>
}

export default function CodexAccountPanel() {
  const { t, resolvedLocale } = useI18n()
  const [state, setState] = useState<AccountState>(EMPTY_STATE)
  const [resolvedOnce, setResolvedOnce] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Refresh reset countdowns without re-fetching; cleared on unmount.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const load = useCallback(async (force: boolean) => {
    if (!window.electronAPI?.codexRateLimits || !window.electronAPI?.codexAccountUsage) {
      setResolvedOnce(true)
      return
    }
    setRefreshing(true)
    try {
      const [limitsResult, usageResult] = await Promise.allSettled([
        window.electronAPI.codexRateLimits({ force }),
        window.electronAPI.codexAccountUsage({ force }),
      ] as const)

      const limits = limitsResult.status === 'fulfilled' && limitsResult.value.success
        ? limitsResult.value.rateLimits ?? null
        : null
      const usage = usageResult.status === 'fulfilled' && usageResult.value.success
        ? usageResult.value.usage ?? null
        : null

      // Keep whichever half we already had: a failed probe should not blank
      // data that is still the best information the user has.
      setState(prev => ({
        limits: limits ?? prev.limits,
        usage: usage ?? prev.usage,
      }))
      setRefreshFailed(limits === null && usage === null)
    } catch {
      setRefreshFailed(true)
    } finally {
      setRefreshing(false)
      setResolvedOnce(true)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  const mainSnapshot = pickSnapshot(state.limits)
  const limitsContent = hasLimitsContent(mainSnapshot)
  const usageContent = hasUsageContent(state.usage)

  // Still probing for the first time: render nothing to avoid a flash.
  if (!resolvedOnce) return null
  // Both probes failed and there is nothing cached — the Stats page should not
  // grow a permanent error box for Claude users.
  if (!limitsContent && !usageContent) return null

  const reached = Boolean(mainSnapshot?.rateLimitReachedType)
  const windows: Array<{ position: 'primary' | 'secondary'; window: CodexRateLimitWindowData }> = []
  if (mainSnapshot?.primary) windows.push({ position: 'primary', window: mainSnapshot.primary })
  if (mainSnapshot?.secondary) windows.push({ position: 'secondary', window: mainSnapshot.secondary })
  const resetCredits = state.limits?.rateLimitResetCredits

  return (
    <div>
      <div style={sectionLabelStyle}>{t('codex.account.title')}</div>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            {limitsContent && mainSnapshot && (
              <>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'var(--text-faint)',
                  marginBottom: 3,
                }}>
                  {t('codex.account.plan')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    textTransform: 'capitalize',
                  }}>
                    {mainSnapshot.planType ?? t('codex.account.planUnknown')}
                  </span>
                  {mainSnapshot.limitName && (
                    <span style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 4,
                      padding: '1px 6px',
                    }}>
                      {mainSnapshot.limitName}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => { void load(true) }}
            disabled={refreshing}
            aria-label={t('codex.account.refresh')}
            aria-busy={refreshing}
            title={t('codex.account.refresh')}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)'
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.18)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--glass-border)'
              e.currentTarget.style.boxShadow = 'none'
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              flexShrink: 0,
              background: 'transparent',
              border: '1px solid var(--glass-border)',
              borderRadius: 6,
              padding: '4px 8px',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.7 : 1,
              outline: 'none',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            {refreshing ? (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  border: '1.5px solid var(--text-faint)',
                  borderTopColor: 'transparent',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
        </div>

        {reached && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--danger-text)' }}>
            {t('codex.account.limitReached')}
          </div>
        )}

        {windows.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {windows.map(({ position, window: limitWindow }) => (
              <LimitWindowRow
                key={position}
                limitWindow={limitWindow}
                position={position}
                snapshotReached={reached}
                now={now}
                locale={resolvedLocale}
              />
            ))}
          </div>
        )}

        {mainSnapshot?.credits && (
          <div style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            fontSize: 12,
          }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('codex.account.credits')}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, ...numberStyle }}>
              <CreditValue snapshot={mainSnapshot} t={t} />
            </span>
          </div>
        )}

        {resetCredits && resetCredits.availableCount > 0 && (
          <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--text-faint)' }}>
            {t('codex.account.resetCredits', { count: resetCredits.availableCount })}
          </div>
        )}

        {state.usage && usageContent && (
          <UsageSummary usage={state.usage} locale={resolvedLocale} />
        )}

        {refreshFailed && (
          <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--text-faint)' }}>
            {t('codex.account.staleNote')}
          </div>
        )}
      </div>
    </div>
  )
}
