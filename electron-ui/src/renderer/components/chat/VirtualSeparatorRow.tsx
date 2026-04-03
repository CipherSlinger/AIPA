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
          gap: 12,
          padding: '6px 20px',
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 500, letterSpacing: 0.3 }}>
            {label}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
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
            fontSize: 9,
            color: 'var(--text-muted)',
            opacity: 0.7,
            fontFamily: 'monospace',
            letterSpacing: 0.5,
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
            fontSize: 9,
            color: 'var(--text-muted)',
            opacity: 0.5,
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
        <div style={{ flex: 1, height: 1, background: 'var(--accent)', opacity: 0.4 }} />
        <span style={{ fontSize: 10, color: 'var(--accent)', whiteSpace: 'nowrap', fontWeight: 500, letterSpacing: 0.3, opacity: 0.8 }}>
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--accent)', opacity: 0.4 }} />
      </div>
    </div>
  )
}
