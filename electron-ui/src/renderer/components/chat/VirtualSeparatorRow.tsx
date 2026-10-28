// VirtualSeparatorRow — renders date/time/response/compact separator rows in the virtualized message list
// Extracted from MessageList.tsx in Iteration 456
import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Virtualizer } from '@tanstack/react-virtual'
import { useT } from '../../i18n'
import type { EngineStep } from './engineStepText'

interface VirtualRowInfo {
  index: number
  start: number
}

type VirtualSeparatorRowProps = {
  virtualRow: VirtualRowInfo
  measureElement: Virtualizer<HTMLDivElement, Element>['measureElement']
} & (
  | {
      type: 'dateSep' | 'timeGap' | 'responseTime' | 'compactSep' | 'turnEnded'
      label: string
    }
  | {
      type: 'engineSteps'
      /** Rows for one turn's unhandled items. */
      steps: EngineStep[]
      /** Stable group key used by the expansion set. */
      rowKey: string
      expanded: boolean
      onToggle: (rowKey: string) => void
    }
)

/** One quiet line naming what the engine did. The `title` explains protocol
 *  terms (hook, MCP, sub-agent) without putting an explanation on screen. */
function EngineStepLine({ step }: { step: EngineStep }) {
  const t = useT()
  let text = t(step.labelKey, step.labelParams)
  if (step.rawKind) text = `${text} — ${step.rawKind}`
  return (
    <span
      title={step.hintKey ? t(step.hintKey) : undefined}
      style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        fontStyle: 'italic',
        lineHeight: 1.5,
        wordBreak: 'break-word',
      }}
    >
      {text}
    </span>
  )
}

function EngineStepsRow({ steps, rowKey, expanded, onToggle, virtualRow, measureElement }: {
  steps: EngineStep[]
  rowKey: string
  expanded: boolean
  onToggle: (rowKey: string) => void
  virtualRow: VirtualRowInfo
  measureElement: Virtualizer<HTMLDivElement, Element>['measureElement']
}) {
  const t = useT()
  // A group is never built empty, but this row is also the virtualizer's
  // public boundary: a malformed item must not crash the whole transcript.
  if (steps.length === 0) return null
  const canExpand = steps.length > 1
  const summary = canExpand
    ? t('chat.engineStep.summary', { count: steps.length })
    : null
  const toggleLabel = expanded ? t('chat.engineStep.collapse') : t('chat.engineStep.expand')

  return (
    <div
      data-index={virtualRow.index}
      ref={measureElement}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      <div className="chat-column" style={{ padding: '3px 20px' }}>
        {canExpand ? (
          <>
            <button
              type="button"
              onClick={() => onToggle(rowKey)}
              aria-expanded={expanded}
              aria-label={toggleLabel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 11,
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              {expanded
                ? <ChevronDown size={11} aria-hidden="true" />
                : <ChevronRight size={11} aria-hidden="true" />}
              <span>{summary}</span>
            </button>
            {expanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0 2px 15px' }}>
                {steps.map(step => (
                  <div key={step.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: 10 }}>•</span>
                    <EngineStepLine step={step} />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <EngineStepLine step={steps[0]} />
        )}
      </div>
    </div>
  )
}

export default function VirtualSeparatorRow(props: VirtualSeparatorRowProps) {
  const { virtualRow, measureElement } = props
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    transform: `translateY(${virtualRow.start}px)`,
  }

  // Unhandled Codex item kinds are a quiet log line, not a card: one line when
  // the turn only produced one, a collapsible "N engine steps" summary when it
  // produced several in a row.
  if (props.type === 'engineSteps') {
    return (
      <EngineStepsRow
        steps={props.steps}
        rowKey={props.rowKey}
        expanded={props.expanded}
        onToggle={props.onToggle}
        virtualRow={virtualRow}
        measureElement={measureElement}
      />
    )
  }

  const { type, label } = props

  if (type === 'dateSep') {
    return (
      <div
        key={`sep-${label}`}
        data-index={virtualRow.index}
        ref={measureElement}
        style={baseStyle}
      >
        <div className="chat-column" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 20px',
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--bg-hover)' }} />
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            background: 'var(--bg-chat)',
            padding: '0 10px',
            whiteSpace: 'nowrap',
          }}>
            {label}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--bg-hover)' }} />
        </div>
      </div>
    )
  }

  if (type === 'timeGap') {
    return (
      <div
        key={`tgap-${virtualRow.index}`}
        data-index={virtualRow.index}
        ref={measureElement}
        style={baseStyle}
      >
        <div className="chat-column" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 20px',
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            fontFamily: 'monospace',
          }}>
            {label}
          </span>
        </div>
      </div>
    )
  }

  if (type === 'responseTime') {
    return (
      <div
        key={`rt-${virtualRow.index}`}
        data-index={virtualRow.index}
        ref={measureElement}
        style={baseStyle}
      >
        <div className="chat-column" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px 20px',
        }}>
          <span style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}>
            {label}
          </span>
        </div>
      </div>
    )
  }

  if (type === 'turnEnded') {
    // Deliberately the quietest row in the list: a stopped or unreported turn
    // is information, not an error and not a completion.
    return (
      <div
        key={`tend-${virtualRow.index}`}
        data-index={virtualRow.index}
        ref={measureElement}
        style={baseStyle}
      >
        <div className="chat-column" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 20px',
        }}>
          <span style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}>
            {label}
          </span>
        </div>
      </div>
    )
  }

  // compactSep
  return (
    <div
      key={`csep-${virtualRow.index}`}
      data-index={virtualRow.index}
      ref={measureElement}
      style={baseStyle}
    >
      <div className="chat-column" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 20px',
      }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(99,102,241,0.20)' }} />
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'rgba(165,180,252,0.60)',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(99,102,241,0.20)' }} />
      </div>
    </div>
  )
}
