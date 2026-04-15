import React from 'react'
import { CheckCircle, XCircle, ClipboardList } from 'lucide-react'
import { PlanMessage } from '../../types/app.types'
import { useT } from '../../i18n'

interface Props {
  message: PlanMessage
  onAccept: () => void
  onReject: () => void
}

// Parse plan content into structured step lines vs plain text lines
interface StepLine {
  type: 'step'
  num: number
  text: string
  index: number // position among steps only
}
interface PlainLine {
  type: 'plain'
  text: string
}
type ParsedLine = StepLine | PlainLine

function parsePlanLines(content: string): ParsedLine[] {
  const raw = content.split('\n')
  const result: ParsedLine[] = []
  let stepIndex = 0
  for (const line of raw) {
    const m = line.match(/^(\d+)[.)]\s+(.*)$/)
    if (m) {
      result.push({ type: 'step', num: parseInt(m[1], 10), text: m[2], index: stepIndex++ })
    } else {
      result.push({ type: 'plain', text: line })
    }
  }
  return result
}

export default function PlanCard({ message, onAccept, onReject }: Props) {
  const t = useT()
  const isPending = message.decision === 'pending'
  const parsedLines = parsePlanLines(message.planContent)

  // Determine active step index: first step if pending, last step if accepted
  const stepLines = parsedLines.filter((l): l is StepLine => l.type === 'step')
  const activeStepIndex = isPending ? 0 : stepLines.length - 1

  return (
    <div
      style={{
        margin: '8px 16px',
        borderRadius: 10,
        background: 'rgba(15,15,25,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid rgba(99,102,241,0.60)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <ClipboardList size={13} style={{ color: '#818cf8', flexShrink: 0 }} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--text-muted)',
          }}
        >
          {t('plan.executionPlan')}
        </span>
        {!isPending && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: message.decision === 'accepted' ? '#4ade80' : '#f87171',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {message.decision === 'accepted' ? t('plan.approved') : t('plan.rejected')}
          </span>
        )}
      </div>

      {/* Plan content */}
      <div
        style={{
          padding: '12px 14px',
          maxHeight: 400,
          overflowY: 'auto',
        }}
      >
        {parsedLines.map((line, i) => {
          if (line.type === 'plain') {
            // Render non-step lines as muted text (intro/outro prose)
            return line.text.trim() ? (
              <p
                key={i}
                style={{
                  margin: '0 0 6px 0',
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                }}
              >
                {line.text}
              </p>
            ) : (
              <div key={i} style={{ height: 4 }} />
            )
          }

          // Step line
          const isCompleted = !isPending && message.decision === 'accepted'
            ? line.index < activeStepIndex
            : false
          const isActive = line.index === activeStepIndex && isPending

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '4px 6px',
                borderRadius: 6,
                background: 'transparent',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {/* Bullet / step number */}
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  color: isCompleted ? '#4ade80' : isActive ? '#a5b4fc' : '#818cf8',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: isCompleted
                    ? 'rgba(74,222,128,0.15)'
                    : isActive
                      ? 'rgba(99,102,241,0.30)'
                      : 'rgba(99,102,241,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  paddingTop: 1,
                }}
              >
                {line.num}.
              </span>
              {/* Step text */}
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: isCompleted
                    ? 'var(--text-muted)'
                    : isActive
                      ? 'rgba(255,255,255,0.92)'
                      : 'var(--text-secondary)',
                  textDecoration: isCompleted ? 'line-through' : 'none',
                  opacity: isCompleted ? 0.6 : 1,
                  fontWeight: isActive ? 600 : 400,
                  flex: 1,
                }}
              >
                {line.text}
              </span>
            </div>
          )
        })}
      </div>

      {/* Action buttons */}
      {isPending && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '10px 14px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            onClick={onAccept}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(1.1)'
              e.currentTarget.style.transform = 'scale(1.02)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'brightness(1)'
              e.currentTarget.style.transform = 'scale(1)'
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              border: 'none',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.95)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
              transition: 'all 0.15s ease',
            }}
          >
            <CheckCircle size={13} />
            {t('plan.approve')}
          </button>
          <button
            onClick={onReject}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--border)'
              e.currentTarget.style.borderColor = 'var(--bg-active)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.55)',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.15s ease',
            }}
          >
            <XCircle size={13} />
            {t('plan.reject')}
          </button>
        </div>
      )}
    </div>
  )
}
