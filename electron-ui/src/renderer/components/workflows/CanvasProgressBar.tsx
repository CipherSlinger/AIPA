import React from 'react'
import { useT } from '../../i18n'

interface CanvasProgressBarProps {
  completedCount: number
  totalSteps: number
  isRunning: boolean
  startedAt?: number | null
  hasError?: boolean
}

export default function CanvasProgressBar({ completedCount, totalSteps, isRunning, startedAt, hasError = false }: CanvasProgressBarProps) {
  const t = useT()
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isRunning])

  if (!isRunning && completedCount === 0 && !hasError) return null

  const percent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0
  const currentStep = Math.min(completedCount + 1, totalSteps)
  const allDone = completedCount === totalSteps && !isRunning
  const isError = hasError && !isRunning

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
      padding: '6px 12px',
      pointerEvents: 'none',
      opacity: isError ? 0.4 : 1,
      background: 'var(--glass-bg-mid)',
      backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0) 46%)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      border: `1px solid ${isError ? 'rgba(239,68,68,0.28)' : isRunning ? 'rgba(99,102,241,0.22)' : allDone ? 'rgba(34,197,94,0.22)' : 'var(--glass-border)'}`,
      borderRadius: 10,
      boxShadow: '0 1px 2px rgba(0,0,0,0.25), 0 8px 24px -8px rgba(0,0,0,0.45)',
      transition: 'border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 3,
      }}>
        {isRunning && !allDone && !isError && (
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#a5b4fc',
            boxShadow: '0 0 0 3px rgba(99,102,241,0.16), 0 0 8px rgba(99,102,241,0.6)',
            flexShrink: 0,
            animation: 'canvas-progress-pulse 1.2s ease-in-out infinite',
          }} />
        )}
        {isError
          ? <span style={{ fontSize: 11, color: '#f87171', fontWeight: 700, lineHeight: 1 }}>执行中断</span>
          : <span style={{
              fontSize: 12,
              color: allDone ? '#4ade80' : '#a5b4fc',
              fontWeight: 600,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
            }}>
              {allDone
                ? t('workflow.canvasComplete')
                : t('workflow.canvasProgress', { current: String(currentStep), total: String(totalSteps) })}
            </span>
        }
        {!isError && etaText && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
            {etaText}
          </span>
        )}
      </div>
      <div style={{
        height: 5,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 5,
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          height: '100%',
          width: isError ? '100%' : `${percent}%`,
          background: isError
            ? 'linear-gradient(90deg, rgba(239,68,68,0.65), rgba(239,68,68,0.85))'
            : allDone
              ? 'linear-gradient(90deg, rgba(74,222,128,0.85), rgba(34,197,94,0.90))'
              : 'linear-gradient(90deg, rgba(99,102,241,0.70), rgba(139,92,246,0.70))',
          borderRadius: 5,
          boxShadow: isError
            ? 'none'
            : allDone
              ? '0 0 10px rgba(74,222,128,0.45)'
              : '0 0 10px rgba(99,102,241,0.45)',
          transition: isError ? 'none' : 'width 0.35s cubic-bezier(.4,0,.2,1)',
          position: 'relative',
        }}>
          {isRunning && !allDone && !isError && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'canvas-progress-shimmer 1.5s ease-in-out infinite',
            }} />
          )}
        </div>
      </div>
    </div>
  )
}
