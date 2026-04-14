// GhostTextOverlay — autocomplete ghost text display in ChatInput (extracted Iteration 455)
import React from 'react'

interface GhostTextOverlayProps {
  input: string
  ghostText: string
}

export default function GhostTextOverlay({ input, ghostText }: GhostTextOverlayProps) {
  if (!ghostText) return null
  if (input.trimStart().length < 3 && input.trim()) return null

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        pointerEvents: 'none', userSelect: 'none',
        fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', color: 'transparent', overflow: 'hidden', maxHeight: 160,
        opacity: input.trim() ? 1 : 0.45,
        fontStyle: input.trim() ? 'normal' : 'italic',
        transition: 'opacity 0.15s ease',
      }}
    >
      {input.trim() ? (
        <>
          <span style={{ visibility: 'hidden' }}>{input}</span>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>{ghostText}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, marginLeft: 5, fontFamily: 'monospace',
            letterSpacing: '0.07em',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 6, color: 'var(--text-faint)', padding: '1px 5px',
            textTransform: 'uppercase',
          }}>Tab</span>
        </>
      ) : (
        <>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>{ghostText}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, marginLeft: 6, fontFamily: 'monospace',
            letterSpacing: '0.07em',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 6, color: 'var(--text-faint)', padding: '1px 5px',
            textTransform: 'uppercase',
          }}>Tab</span>
        </>
      )}
    </div>
  )
}
