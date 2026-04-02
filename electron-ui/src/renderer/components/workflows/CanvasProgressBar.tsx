import React from 'react'
import { useT } from '../../i18n'

interface CanvasProgressBarProps {
  completedCount: number
  totalSteps: number
  isRunning: boolean
}

export default function CanvasProgressBar({ completedCount, totalSteps, isRunning }: CanvasProgressBarProps) {
  const t = useT()

  if (!isRunning && completedCount === 0) return null

  const percent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0
  const currentStep = Math.min(completedCount + 1, totalSteps)
  const allDone = completedCount === totalSteps

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      padding: '6px 12px 4px',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 9,
        color: allDone ? '#22c55e' : 'var(--text-muted)',
        marginBottom: 2,
        fontWeight: 500,
        textAlign: 'center',
      }}>
        {allDone
          ? t('workflow.canvasComplete')
          : t('workflow.canvasProgress', { current: String(currentStep), total: String(totalSteps) })
        }
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
          transition: 'width 0.3s ease-out, background 0.3s ease',
        }} />
      </div>
    </div>
  )
}
