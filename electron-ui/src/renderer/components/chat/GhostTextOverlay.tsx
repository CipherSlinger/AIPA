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
        position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none',
        fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', color: 'transparent', overflow: 'hidden', maxHeight: 160,
        opacity: input.trim() ? 1 : 0.45,
        fontStyle: input.trim() ? 'normal' : 'italic',
        transition: 'opacity 0.3s ease-in',
      }}
    >
      {input.trim() ? (
        <>
          <span style={{ visibility: 'hidden' }}>{input}</span>
          <span style={{ color: 'var(--text-muted)', opacity: 0.45 }}>{ghostText}</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.35, marginLeft: 4 }}>Tab</span>
        </>
      ) : (
        <>
          <span style={{ color: 'var(--text-secondary)' }}>{ghostText}</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.5, marginLeft: 6 }}>Tab</span>
        </>
      )}
    </div>
  )
}
