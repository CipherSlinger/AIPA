import React from 'react'
import { useT } from '../../i18n'

interface CanvasProgressBarProps {
  completedCount: number
  totalSteps: number
  isRunning: boolean
  startedAt?: number | null
}

export default function CanvasProgressBar({ completedCount, totalSteps, isRunning, startedAt }: CanvasProgressBarProps) {
  const t = useT()
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isRunning])

  if (!isRunning && completedCount === 0) return null

  const percent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0
  const currentStep = Math.min(completedCount + 1, totalSteps)
  const allDone = completedCount === totalSteps && !isRunning

  // ETA estimation
  let etaText: string | null = null
  if (isRunning && startedAt && completedCount > 0) {
    const elapsed = now - startedAt
    const avgPerStep = elapsed / completedCount
    const remaining = (totalSteps - completedCount) * avgPerStep
    const remainingSec = Math.round(remaining / 1000)
    if (remainingSec >= 2) {
      etaText = remainingSec < 60
        ? `~${remainingSec}s left`
        : `~${Math.round(remainingSec / 60)}m left`
    }
  }

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      padding: '5px 12px 4px',
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 3,
      }}>
        {isRunning && !allDone && (
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--accent)', flexShrink: 0,
            animation: 'canvas-progress-pulse 1.2s ease-in-out infinite',
          }} />
        )}
        <span style={{
          fontSize: 9,
          color: allDone ? '#22c55e' : 'var(--text-muted)',
          fontWeight: 500,
          lineHeight: 1,
        }}>
          {allDone
            ? t('workflow.canvasComplete')
            : t('workflow.canvasProgress', { current: String(currentStep), total: String(totalSteps) })}
        </span>
        {etaText && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.7 }}>
            {etaText}
          </span>
        )}
      </div>
      <div style={{
        height: 3,
        background: 'var(--border)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          background: allDone ? '#22c55e' : 'var(--accent)',
          borderRadius: 2,
          transition: 'width 0.4s ease-out, background 0.3s ease',
          position: 'relative',
        }}>
          {isRunning && !allDone && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
              animation: 'canvas-bar-shimmer 1.5s ease-in-out infinite',
            }} />
          )}
        </div>
      </div>
    </div>
  )
}
