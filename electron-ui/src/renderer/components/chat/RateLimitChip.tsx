// RateLimitChip — the signed-in Codex account's rate-limit windows, as a quiet
// one-line chip above the textarea. It renders only what the server reported:
// no estimates, no predicted failures, no guessed causes.
import React from 'react'
import { Gauge } from 'lucide-react'
import { useT } from '../../i18n'
import { useRateLimits } from '../../hooks/useRateLimits'
import {
  formatResetHint,
  formatWindowHint,
  type RateLimitDurationHint,
  type RateLimitWindowView,
} from './rateLimitView'

interface RateLimitChipProps {
  /** The conversation the composer belongs to; scopes the hook's subscription. */
  sessionId: string | null
}

type Translate = ReturnType<typeof useT>

function durationLabel(t: Translate, hint: RateLimitDurationHint, prefix: 'rateLimit.windowLength' | 'rateLimit.resetsIn'): string {
  return t(`${prefix}.${hint.unit}`, { count: hint.value })
}

function windowLabel(t: Translate, window: RateLimitWindowView): string {
  const hint = formatWindowHint(window.windowDurationMins)
  return hint
    ? durationLabel(t, hint, 'rateLimit.windowLength')
    : t(`rateLimit.window.${window.window}`)
}

export default function RateLimitChip({ sessionId }: RateLimitChipProps) {
  const t = useT()
  const view = useRateLimits(sessionId)
  // Ordinary usage stays out of the composer. The chip is an alert — the moment
  // a window is nearly spent, or the account has hit a limit — not a dashboard;
  // the full numbers live in Settings → Account, and a permanent line above the
  // textarea would be a tax on every conversation to serve a rare one.
  if (!view || !view.warning) return null

  // At limit is red, near limit amber, ordinary usage subdued. The same tokens
  // every other warning surface in the app uses, so themes stay in charge.
  const color = view.atLimit
    ? 'var(--danger-text)'
    : view.warning ? 'var(--warning-text)' : 'var(--text-muted)'

  const status = view.spendControlReached === true
    ? t('rateLimit.spendControlReached')
    : view.atLimit
      ? t('rateLimit.reached')
      : view.warning ? t('rateLimit.nearLimit') : null

  return (
    <div
      role="status"
      aria-live="polite"
      title={t('rateLimit.hint')}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        padding: '0 14px 4px',
        fontSize: 10.5,
        lineHeight: 1.4,
        color,
      }}
    >
      <Gauge size={11} style={{ flexShrink: 0 }} aria-hidden="true" />
      {view.windows.map((window, index) => {
        const reset = formatResetHint(window.resetInMinutes)
        return (
          <React.Fragment key={window.window}>
            {index > 0 && <span aria-hidden="true" style={{ opacity: 0.5 }}>·</span>}
            <span>
              {windowLabel(t, window)}
              {' '}
              {t('rateLimit.used', { percent: Math.round(window.usedPercent) })}
              {reset
                ? ` · ${durationLabel(t, reset, 'rateLimit.resetsIn')}`
                : window.resetsAt === null ? ` · ${t('rateLimit.noReset')}` : ''}
            </span>
          </React.Fragment>
        )
      })}
      {status && (
        <span style={{ fontWeight: 600 }}>{status}</span>
      )}
    </div>
  )
}
