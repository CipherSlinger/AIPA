// ChatInput paste action chips — type-aware paste detection (Iteration 463)
// Displays content-type-specific action chips based on paste detection.

import React from 'react'
import { X, Link2, FileText, MessageSquareQuote, Code2, Image } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore } from '../../store'
import { PasteContentType, getActionsForType, PasteAction } from './chatInputConstants'

interface PasteState {
  pastedUrl: string | null
  setPastedUrl: (v: string | null) => void
  pastedLongText: boolean
  setPastedLongText: (v: boolean) => void
  pendingQuote: string | null
  setPendingQuote: (v: string | null) => void
  handleUrlAction: (label: string) => void
  handleLongTextAction: (label: string) => void
  urlChipTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  longTextTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  onWrapAsBlock?: () => void
  // New typed paste state (Iteration 463)
  pastedContentType?: PasteContentType | null
  pastedText?: string | null
  handleTypedAction?: (prompt: string) => void
}

interface ChatInputPasteChipsProps {
  paste: PasteState
  inputLength: number
}

const chipStyle: React.CSSProperties = {
  padding: '4px 10px 4px 8px', fontSize: 11, fontWeight: 500,
  background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.22)',
  borderRadius: 8, color: 'rgba(165,180,252,0.85)', cursor: 'pointer',
  transition: 'all 0.15s ease', whiteSpace: 'nowrap',
  display: 'flex', alignItems: 'center', gap: 6,
}

function chipHoverOn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'rgba(99,102,241,0.16)'
  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'
}
function chipHoverOff(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.22)'
}

const dismissBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none',
  color: 'rgba(165,180,252,0.4)',
  cursor: 'pointer', padding: '2px 3px',
  display: 'flex', alignItems: 'center',
  borderRadius: 6, transition: 'all 0.15s ease',
}

// Content type label and icon
const TYPE_CONFIG: Record<string, { icon: React.ElementType; labelKey: string }> = {
  code: { icon: Code2, labelKey: 'paste.codeDetected' },
  url: { icon: Link2, labelKey: 'paste.urlDetected' },
  'long-text': { icon: FileText, labelKey: 'paste.longTextDetected' },
  image: { icon: Image, labelKey: 'paste.imageDetected' },
}

export default function ChatInputPasteChips({ paste, inputLength }: ChatInputPasteChipsProps) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const contentType = paste.pastedContentType
  const pastedText = paste.pastedText

  // If we have a typed content type, use the new unified chip system
  if (contentType && pastedText && paste.handleTypedAction) {
    const typeConfig = TYPE_CONFIG[contentType]
    if (!typeConfig) return null

    const TypeIcon = typeConfig.icon
    const actions = getActionsForType(contentType)

    const handleAction = (action: PasteAction) => {
      let prompt: string
      if (action.id === 'translate') {
        const isZh = prefs.language === 'zh-CN'
        const tpl = isZh ? (action.templateZh ?? action.template ?? '') : (action.templateEn ?? action.template ?? '')
        prompt = tpl.replace('{text}', pastedText.trim())
      } else {
        prompt = (action.template || '').replace('{text}', pastedText.trim())
      }
      paste.handleTypedAction!(prompt)
    }

    const dismissAll = () => {
      paste.handleTypedAction!('') // Clear
      // Actually just clear the state without changing input
      if (paste.pastedContentType) {
        // Use the paste object's clear methods
        paste.setPastedUrl(null)
        paste.setPastedLongText(false)
      }
    }

    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', marginBottom: 4, flexWrap: 'wrap' }}>
          <TypeIcon size={12} style={{ color: 'rgba(165,180,252,0.6)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(165,180,252,0.60)', whiteSpace: 'nowrap', letterSpacing: '0.07em' }}>
            {t(typeConfig.labelKey)}
          </span>
          {actions.map(action => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              style={chipStyle}
              onMouseEnter={chipHoverOn}
              onMouseLeave={chipHoverOff}
            >
              {t(action.labelKey)}
            </button>
          ))}
          {contentType === 'long-text' && paste.onWrapAsBlock && (
            <button
              onClick={() => { paste.onWrapAsBlock?.(); paste.setPastedLongText(false) }}
              style={chipStyle}
              onMouseEnter={chipHoverOn}
              onMouseLeave={chipHoverOff}
              title={t('chat.wrapAsBlock')}
            >
              <Code2 size={10} />
              {t('chat.wrapAsBlock')}
            </button>
          )}
          <button
            onClick={dismissAll}
            style={dismissBtnStyle}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(165,180,252,0.4)'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
            }}
          >
            <X size={12} />
          </button>
        </div>
        {/* Pending quote preview banner */}
        {paste.pendingQuote && (
          <QuoteBanner quote={paste.pendingQuote} onClose={() => paste.setPendingQuote(null)} t={t} />
        )}
      </>
    )
  }

  // Fallback to legacy chip rendering when unified type is not available
  return (
    <>
      {/* URL paste quick action chips */}
      {paste.pastedUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', marginBottom: 4, flexWrap: 'wrap' }}>
          <Link2 size={12} style={{ color: 'rgba(165,180,252,0.6)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'rgba(165,180,252,0.75)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{paste.pastedUrl}</span>
          {[
            { key: 'summarize', label: t('chat.urlAction.summarize') },
            { key: 'explain', label: t('chat.urlAction.explain') },
            { key: 'translate', label: t('chat.urlAction.translate') },
          ].map(action => (
            <button
              key={action.key}
              onClick={() => paste.handleUrlAction(action.label)}
              style={chipStyle}
              onMouseEnter={chipHoverOn}
              onMouseLeave={chipHoverOff}
            >
              {action.label}
            </button>
          ))}
          <button
            onClick={() => { paste.setPastedUrl(null); if (paste.urlChipTimerRef.current) clearTimeout(paste.urlChipTimerRef.current) }}
            style={dismissBtnStyle}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(165,180,252,0.4)'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}
      {/* Long text paste quick action chips */}
      {paste.pastedLongText && !paste.pastedUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', marginBottom: 4, flexWrap: 'wrap' }}>
          <FileText size={12} style={{ color: 'rgba(165,180,252,0.6)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'rgba(165,180,252,0.75)', whiteSpace: 'nowrap' }}>
            {t('chat.longPaste', { count: String(inputLength) })}
          </span>
          {[
            { key: 'summarize', label: t('chat.urlAction.summarize') },
            { key: 'explain', label: t('chat.urlAction.explain') },
            { key: 'translate', label: t('chat.urlAction.translate') },
            { key: 'rewrite', label: t('clipboard.rewrite') },
          ].map(action => (
            <button
              key={action.key}
              onClick={() => paste.handleLongTextAction(action.label)}
              style={chipStyle}
              onMouseEnter={chipHoverOn}
              onMouseLeave={chipHoverOff}
            >
              {action.label}
            </button>
          ))}
          {paste.onWrapAsBlock && (
            <button
              onClick={() => { paste.onWrapAsBlock?.(); paste.setPastedLongText(false) }}
              style={chipStyle}
              onMouseEnter={chipHoverOn}
              onMouseLeave={chipHoverOff}
              title={t('chat.wrapAsBlock')}
            >
              <Code2 size={10} />
              {t('chat.wrapAsBlock')}
            </button>
          )}
          <button
            onClick={() => { paste.setPastedLongText(false); if (paste.longTextTimerRef.current) clearTimeout(paste.longTextTimerRef.current) }}
            style={dismissBtnStyle}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(165,180,252,0.4)'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}
      {/* Pending quote preview banner */}
      {paste.pendingQuote && (
        <QuoteBanner quote={paste.pendingQuote} onClose={() => paste.setPendingQuote(null)} t={t} />
      )}
    </>
  )
}

function QuoteBanner({ quote, onClose, t }: { quote: string; onClose: () => void; t: (key: string) => string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', marginBottom: 6, background: 'rgba(255,255,255,0.04)', borderLeft: '3px solid rgba(99,102,241,0.6)', borderRadius: '0 6px 6px 0', fontSize: 12, color: 'rgba(165,180,252,0.75)', lineHeight: 1.5 }}>
      <MessageSquareQuote size={14} style={{ color: 'rgba(165,180,252,0.6)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>
        {quote.length > 150 ? quote.slice(0, 150) + '...' : quote}
      </div>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: 'rgba(165,180,252,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px 3px', borderRadius: 6, flexShrink: 0, transition: 'all 0.15s ease' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'
          ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)'
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(165,180,252,0.4)'
          ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
        }}
        title={t('common.close')}
      >
        <X size={14} />
      </button>
    </div>
  )
}
