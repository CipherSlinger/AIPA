import React, { useState, useCallback, useRef, useEffect } from 'react'
import { StickyNote, X } from 'lucide-react'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'

/**
 * AnnotationEditor — inline annotation display + editor for messages (Iteration 451)
 * Extracted from Message.tsx. Manages its own show/hide and draft state.
 */
interface AnnotationEditorProps {
  messageId: string
  currentAnnotation: string | undefined
  isUser: boolean
  /** Whether the editor should be open (controlled by parent via toggle) */
  editorOpen: boolean
  onEditorOpenChange: (open: boolean) => void
}

export default function AnnotationEditor({
  messageId,
  currentAnnotation,
  isUser,
  editorOpen,
  onEditorOpenChange,
}: AnnotationEditorProps) {
  const t = useT()
  const setAnnotation = useChatStore(s => s.setAnnotation)
  const [annotationDraft, setAnnotationDraft] = useState('')
  const annotationRef = useRef<HTMLTextAreaElement>(null)

  // Sync draft when editor opens
  useEffect(() => {
    if (editorOpen) {
      setAnnotationDraft(currentAnnotation || '')
      setTimeout(() => annotationRef.current?.focus(), 50)
    }
  }, [editorOpen, currentAnnotation])

  const handleSave = useCallback(() => {
    setAnnotation(messageId, annotationDraft.trim())
    onEditorOpenChange(false)
  }, [annotationDraft, messageId, setAnnotation, onEditorOpenChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      setAnnotation(messageId, annotationDraft.trim())
      onEditorOpenChange(false)
    } else if (e.key === 'Escape') {
      onEditorOpenChange(false)
    }
  }, [annotationDraft, messageId, setAnnotation, onEditorOpenChange])

  const handleRemove = useCallback(() => {
    setAnnotation(messageId, '')
    onEditorOpenChange(false)
  }, [messageId, setAnnotation, onEditorOpenChange])

  // Don't render if no annotation and editor is closed
  if (!currentAnnotation && !editorOpen) return null

  return (
    <div style={{
      marginTop: 4,
      ...(isUser ? { alignSelf: 'flex-end' } : {}),
    }}>
      {editorOpen ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'var(--popup-bg)',
          border: '1px solid var(--popup-border)',
          borderRadius: 6,
          padding: 6,
        }}>
          <textarea
            ref={annotationRef}
            value={annotationDraft}
            onChange={(e) => setAnnotationDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('message.annotationPlaceholder')}
            maxLength={500}
            style={{
              width: '100%',
              minWidth: 200,
              minHeight: 40,
              maxHeight: 100,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: 12,
              fontFamily: 'inherit',
              resize: 'vertical',
              padding: 4,
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 'auto' }}>
              {annotationDraft.length}/500
            </span>
            {currentAnnotation && (
              <button
                onClick={handleRemove}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--error, #e55)', fontSize: 11, padding: '2px 6px',
                  borderRadius: 3,
                }}
                title={t('message.removeAnnotation')}
              >
                {t('message.removeAnnotation')}
              </button>
            )}
            <button
              onClick={() => onEditorOpenChange(false)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 11, padding: '2px 6px',
                borderRadius: 3,
              }}
            >
              {t('message.editCancel')}
            </button>
            <button
              onClick={handleSave}
              style={{
                background: 'var(--accent)', border: 'none', cursor: 'pointer',
                color: '#fff', fontSize: 11, padding: '2px 8px',
                borderRadius: 3,
              }}
            >
              {t('message.editSave').replace(' & Send', '')}
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => onEditorOpenChange(true)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 4,
            padding: '3px 8px',
            background: 'rgba(255, 193, 7, 0.08)',
            border: '1px solid rgba(255, 193, 7, 0.2)',
            borderRadius: 6,
            cursor: 'pointer',
            maxWidth: '100%',
            transition: 'background 0.12s ease',
          }}
          title={t('message.editAnnotation')}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255, 193, 7, 0.15)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255, 193, 7, 0.08)' }}
        >
          <StickyNote size={11} style={{ color: 'var(--warning, #ffc107)', marginTop: 2, flexShrink: 0 }} />
          <span style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.4,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}>
            {currentAnnotation}
          </span>
        </div>
      )}
    </div>
  )
}
