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
          gap: 0,
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          animation: 'slideUp 0.15s ease',
        }}>
          <textarea
            ref={annotationRef}
            value={annotationDraft}
            onChange={(e) => setAnnotationDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('message.annotationPlaceholder')}
            maxLength={500}
            onFocus={(e) => { (e.currentTarget as HTMLTextAreaElement).style.border = '1px solid rgba(99,102,241,0.5)'; (e.currentTarget as HTMLTextAreaElement).style.boxShadow = '0 0 0 2px rgba(99,102,241,0.45)' }}
            onBlur={(e) => { (e.currentTarget as HTMLTextAreaElement).style.border = '1px solid var(--border)'; (e.currentTarget as HTMLTextAreaElement).style.boxShadow = 'none' }}
            style={{
              minWidth: 200,
              minHeight: 40,
              maxHeight: 100,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
              lineHeight: 1.6,
              resize: 'none',
              padding: '6px 8px',
              margin: '8px 8px 4px',
              width: 'calc(100% - 16px)',
              boxSizing: 'border-box',
              transition: 'border 0.15s ease, box-shadow 0.15s ease',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center', padding: '4px 8px 8px' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 'auto', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
              {annotationDraft.length}/500
            </span>
            {currentAnnotation && (
              <button
                onClick={handleRemove}
                style={{
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer',
                  color: '#fca5a5', fontSize: 12, fontWeight: 500, padding: '3px 8px',
                  borderRadius: 6, transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.2)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)' }}
                title={t('message.removeAnnotation')}
              >
                {t('message.removeAnnotation')}
              </button>
            )}
            <button
              onClick={() => onEditorOpenChange(false)}
              style={{
                background: 'var(--bg-hover)', border: '1px solid var(--border)', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, padding: '3px 8px',
                borderRadius: 6, transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--border)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-active)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
            >
              {t('message.editCancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={annotationDraft.trim().length === 0}
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: 'none', cursor: annotationDraft.trim().length === 0 ? 'not-allowed' : 'pointer',
                color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: 600, padding: '3px 10px',
                borderRadius: 6, transition: 'all 0.15s ease',
                opacity: annotationDraft.trim().length === 0 ? 0.4 : 1,
              }}
              onMouseEnter={(e) => { if (annotationDraft.trim().length > 0) { e.currentTarget.style.filter = 'brightness(0.95)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)' } }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
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
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.20)',
            borderRadius: 6,
            cursor: 'pointer',
            maxWidth: '100%',
            transition: 'background 0.15s ease',
          }}
          title={t('message.editAnnotation')}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.14)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.08)' }}
        >
          <StickyNote size={11} style={{ color: '#818cf8', marginTop: 2, flexShrink: 0 }} />
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
