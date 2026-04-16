/**
 * ImageThumbnail.tsx
 * Extracted from ToolUseBlock.tsx (Iteration 585)
 *
 * Renders a clickable image thumbnail for a local file path.
 * Falls back to a placeholder with file name on load error.
 */

import React, { useState } from 'react'
import { Image } from 'lucide-react'

interface ImageThumbnailProps {
  filePath: string
  onClick: () => void
  t: (key: string) => string
}

export function ImageThumbnail({ filePath, onClick, t: _t }: ImageThumbnailProps) {
  const [error, setError] = useState(false)
  const fileName = filePath.split(/[/\\]/).pop() || filePath

  if (error) {
    return (
      <div style={{
        width: 80, height: 60, borderRadius: 4,
        background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: 'var(--text-muted)', gap: 2,
      }}>
        <Image size={14} style={{ opacity: 0.5 }} />
        <span style={{ maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
      </div>
    )
  }

  return (
    <img
      src={`file://${filePath}`}
      alt={fileName}
      title={fileName}
      onClick={onClick}
      onError={() => setError(true)}
      style={{
        maxWidth: 300, maxHeight: 200, objectFit: 'contain',
        borderRadius: 4, cursor: 'zoom-in',
        border: '1px solid var(--border)',
      }}
    />
  )
}
