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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
          {attachments.map(img => (
            <div key={img.id} style={{ position: 'relative', flexShrink: 0 }}>
              <img src={img.dataUrl} alt={img.name} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--input-field-border)' }} />
              <button onClick={() => onRemoveImage(img.id)} style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: 'var(--error)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, lineHeight: '1' }}>{'\u00d7'}</button>
            </div>
          ))}
        </div>
      )}
      {/* File attachments */}
      {fileAttachments.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 8 }}>
          {fileAttachments.map(file => (
            <div key={file.id} style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px', background: 'rgba(0, 122, 204, 0.06)',
              border: '1px solid rgba(0, 122, 204, 0.15)', borderRadius: 6,
              maxWidth: 200,
            }}>
              <FileText size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {file.content ? formatFileSize(file.size) : t('chat.fileRefOnly')}
                </div>
              </div>
              <button onClick={() => onRemoveFile(file.id)} style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', padding: 1, borderRadius: 4, flexShrink: 0,
                transition: 'color 150ms',
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
