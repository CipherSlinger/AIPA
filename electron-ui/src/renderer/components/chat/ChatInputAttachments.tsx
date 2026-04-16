// ChatInput attachment display — extracted from ChatInput.tsx (Iteration 314)

import React from 'react'
import { X, FileText } from 'lucide-react'
import type { ImageAttachment, FileAttachment } from '../../hooks/useImagePaste'
import { useT } from '../../i18n'
import { formatFileSize } from '../../utils/formatUtils'

interface ChatInputAttachmentsProps {
  attachments: ImageAttachment[]
  fileAttachments: FileAttachment[]
  onRemoveImage: (id: string) => void
  onRemoveFile: (id: string) => void
}

export default function ChatInputAttachments({ attachments, fileAttachments, onRemoveImage, onRemoveFile }: ChatInputAttachmentsProps) {
  const t = useT()

  return (
    <>
      {/* Image attachments */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0' }}>
          {attachments.map(img => (
            <div
              key={img.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--bg-hover)',
                border: '1px solid var(--glass-border-md)',
                borderRadius: 8,
                padding: '4px 8px 4px 6px',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement
                el.style.background = 'var(--bg-input)'
                el.style.borderColor = 'var(--border-strong)'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement
                el.style.background = 'var(--bg-hover)'
                el.style.borderColor = 'var(--glass-border-md)'
              }}
            >
              <img
                src={img.dataUrl}
                alt={img.name}
                style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: '1px solid var(--glass-border-md)' }}
              />
              <span style={{
                fontSize: 11, fontWeight: 500,
                color: 'var(--text-primary)',
                maxWidth: 120, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {img.name}
              </span>
              <button
                onClick={() => onRemoveImage(img.id)}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--text-faint)',
                  cursor: 'pointer', display: 'flex',
                  alignItems: 'center', padding: '2px 3px',
                  borderRadius: 6, flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'
                  ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'
                  ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
                }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* File attachments */}
      {fileAttachments.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0' }}>
          {fileAttachments.map(file => (
            <div key={file.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px 4px 6px',
              background: 'var(--bg-hover)',
              border: '1px solid var(--glass-border-md)',
              borderRadius: 8,
              transition: 'all 0.15s ease',
            }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement
                el.style.background = 'var(--bg-input)'
                el.style.borderColor = 'var(--border-strong)'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement
                el.style.background = 'var(--bg-hover)'
                el.style.borderColor = 'var(--glass-border-md)'
              }}
            >
              <FileText size={16} style={{ color: '#818cf8', flexShrink: 0 }} />
              <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: 500,
                  color: 'var(--text-primary)',
                  maxWidth: 120,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                  {file.content ? formatFileSize(file.size) : t('chat.fileRefOnly')}
                </div>
              </div>
              <button onClick={() => onRemoveFile(file.id)} style={{
                background: 'none', border: 'none',
                color: 'var(--text-faint)',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', padding: '2px 3px',
                borderRadius: 6, flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'
                  ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'
                  ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
                }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
