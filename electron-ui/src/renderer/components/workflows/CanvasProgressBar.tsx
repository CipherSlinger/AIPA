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
    <>
      <style>{`
        @keyframes progressShimmer {
          0%   { opacity: 0.8; }
          50%  { opacity: 1; }
          100% { opacity: 0.8; }
        }
        @keyframes canvas-bar-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes canvas-progress-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.75); }
        }
      `}</style>
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      padding: '6px 12px',
      pointerEvents: 'none',
      opacity: isError ? 0.4 : 1,
      background: 'rgba(15,15,25,0.88)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.40), 0 1px 4px rgba(0,0,0,0.30)',
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
            background: 'rgba(99,102,241,0.9)',
            boxShadow: '0 0 6px rgba(99,102,241,0.5)',
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
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
            {etaText}
          </span>
        )}
      </div>
      <div style={{
        height: 4,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: isError ? '100%' : `${percent}%`,
          background: isError
            ? 'rgba(239,68,68,0.80)'
            : allDone
              ? 'linear-gradient(90deg, #4ade80, rgba(34,197,94,0.80))'
              : 'linear-gradient(90deg, rgba(99,102,241,0.70), rgba(139,92,246,0.60))',
          borderRadius: 4,
          boxShadow: isError
            ? 'none'
            : allDone
              ? '0 0 8px rgba(74,222,128,0.4)'
              : '0 0 8px rgba(99,102,241,0.4)',
          transition: isError ? 'none' : 'width 0.15s ease, background 0.15s ease',
          position: 'relative',
        }}>
          {isRunning && !allDone && !isError && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.38) 50%, transparent 100%)',
              animation: 'canvas-bar-shimmer 1.5s ease-in-out infinite, progressShimmer 1.5s ease-in-out infinite',
            }} />
          )}
        </div>
      </div>
    </div>
    </>
  )
}
