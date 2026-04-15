// VirtualSeparatorRow — renders date/time/response/compact separator rows in the virtualized message list
// Extracted from MessageList.tsx in Iteration 456
import React from 'react'
import { Virtualizer } from '@tanstack/react-virtual'

interface VirtualSeparatorRowProps {
  type: 'dateSep' | 'timeGap' | 'responseTime' | 'compactSep'
  label: string
  virtualRow: {
    index: number
    start: number
  }
  measureElement: Virtualizer<HTMLDivElement, Element>['measureElement']
}

export default function VirtualSeparatorRow({ type, label, virtualRow, measureElement }: VirtualSeparatorRowProps) {
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    transform: `translateY(${virtualRow.start}px)`,
  }

  if (type === 'dateSep') {
    return (
      <div
        key={`sep-${label}`}
        data-index={virtualRow.index}
        ref={measureElement}
        style={baseStyle}
      >
        <div style={{
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
        <div style={{
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
        <div style={{
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

  // compactSep
  return (
    <div
      key={`csep-${virtualRow.index}`}
      data-index={virtualRow.index}
      ref={measureElement}
      style={baseStyle}
    >
      <div style={{
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
