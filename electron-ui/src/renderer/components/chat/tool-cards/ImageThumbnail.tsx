/**
 * ImageThumbnail.tsx
 * Extracted from ToolUseBlock.tsx (Iteration 585)
 *
 * Renders a clickable image for a local file path (or an explicit src for a
 * legacy data-URL attachment). Falls back to a named placeholder on load
 * error — a missing file is shown as missing, never as a broken image or a
 * silent gap.
 */

import React, { useState } from 'react'
import { Image } from 'lucide-react'
import { imageFileUrl } from '../attachmentDisplay'

interface ImageThumbnailProps {
  /** On-disk image. Ignored when `src` is supplied. */
  filePath?: string
  /** Explicit src (legacy data URL, or a caller-built preview). */
  src?: string
  onClick?: () => void
  t: (key: string, params?: Record<string, string | number>) => string
  /** Square preview size in px. Omit for the tool-card's 300×200 behavior. */
  size?: number
  /** Show the filename under/inside the placeholder; default true. */
  showName?: boolean
}

export function ImageThumbnail({ filePath, src, onClick, t, size, showName = true }: ImageThumbnailProps) {
  const [error, setError] = useState(false)
  const resolved = src || (filePath ? imageFileUrl(filePath) : '')
  const fileName = filePath ? (filePath.split(/[/\\]/).pop() || filePath) : ''

  if (!resolved || error) {
    const missing = !!resolved && error
    return (
      <div style={{
        width: size ?? 80, height: size ?? 60, borderRadius: size ? 6 : 4,
        background: 'var(--tool-card-bg)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: 'var(--text-muted)', gap: 2, flexShrink: 0,
        overflow: 'hidden',
      }}
      title={missing ? t('chat.imageAttachment.missing') : fileName}
      >
        <Image size={14} style={{ opacity: 0.5 }} />
        {showName && (
          <span style={{ maxWidth: (size ?? 80) - 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {missing ? t('chat.imageAttachment.missing') : fileName}
          </span>
        )}
      </div>
    )
  }

  return (
    <img
      src={resolved}
      alt={fileName || 'image'}
      title={fileName}
      onClick={onClick}
      onError={() => setError(true)}
      style={size
        ? {
            width: size, height: size, objectFit: 'cover', borderRadius: 6,
            cursor: onClick ? 'pointer' : 'default',
            border: '1px solid var(--glass-border-md)', flexShrink: 0,
          }
        : {
            maxWidth: 300, maxHeight: 200, objectFit: 'contain',
            borderRadius: 4, cursor: 'zoom-in',
            border: '1px solid var(--border)',
          }}
    />
  )
}
