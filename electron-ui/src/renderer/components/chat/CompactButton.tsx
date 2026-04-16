// CompactButton — Dedicated compact context button with custom instruction popover
// PRD: prd-compact-v1  |  Iteration 519
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Archive, Loader2 } from 'lucide-react'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'

interface CompactButtonProps {
  /** Same shape as ChatHeader's headerBtnStyle */
  style?: React.CSSProperties
  onSend: (prompt: string) => void
  isStreaming: boolean
  messageCount: number
  /** Header hover helpers (optional — for ChatHeader integration) */
  hoverIn?: (e: React.MouseEvent<HTMLButtonElement>) => void
  hoverOut?: (e: React.MouseEvent<HTMLButtonElement>) => void
}

export default function CompactButton({
  style,
  onSend,
  isStreaming,
  messageCount,
  hoverIn,
  hoverOut,
}: CompactButtonProps) {
  const t = useT()
  const isCompacting = useChatStore(s => s.isCompacting)
  const [showPopover, setShowPopover] = useState(false)
  const [customInstruction, setCustomInstruction] = useState('')
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const lastClickRef = useRef(0)

  const disabled = isStreaming || messageCount < 2 || isCompacting

  // Focus input when popover opens
  useEffect(() => {
    if (showPopover && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showPopover])

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false)
        setCustomInstruction('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPopover])

  const handleCompact = useCallback((instruction?: string) => {
    // Debounce: 2 seconds between clicks
    if (Date.now() - lastClickRef.current < 2000) return
    lastClickRef.current = Date.now()

    // Record context usage before compact for before/after comparison
    const contextUsage = useChatStore.getState().lastContextUsage
    if (contextUsage) {
      useChatStore.getState().setContextBeforeCompact({
        used: contextUsage.used,
        total: contextUsage.total,
      })
    }

    useChatStore.getState().setCompacting(true)

    const cmd = instruction?.trim()
      ? `/compact ${instruction.trim()}`
      : '/compact'
    onSend(cmd)
    setShowPopover(false)
    setCustomInstruction('')
  }, [onSend])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    if (e.shiftKey) {
      // Shift+click opens custom instruction popover
      setShowPopover(true)
    } else {
      handleCompact()
    }
  }, [disabled, handleCompact])

  const handlePopoverSubmit = useCallback(() => {
    handleCompact(customInstruction)
  }, [customInstruction, handleCompact])

  const handlePopoverKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handlePopoverSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setShowPopover(false)
      setCustomInstruction('')
    }
  }, [handlePopoverSubmit])

  const ariaLabel = isCompacting
    ? t('compact.inProgress')
    : t('compact.buttonHint')

  const btnStyle: React.CSSProperties = {
    background: isPressed ? 'rgba(99,102,241,0.20)' : isHovered ? 'var(--border)' : 'var(--bg-hover)',
    border: isPressed ? '1px solid rgba(99,102,241,0.40)' : isHovered ? '1px solid var(--bg-active)' : '1px solid var(--border)',
    borderRadius: 8,
    padding: '4px 6px',
    color: isPressed ? '#a5b4fc' : isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
    transition: 'all 0.15s ease',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
    opacity: disabled && !isCompacting ? 0.40 : 1,
    transform: isHovered && !disabled ? 'translateY(-1px)' : 'none',
    ...style,
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={handleClick}
        disabled={disabled}
        aria-label={ariaLabel}
        title={`${t('compact.button')} (Ctrl+Shift+K)\n${t('compact.customHint')}`}
        style={btnStyle}
        onMouseEnter={(e) => {
          if (!disabled) {
            setIsHovered(true)
            hoverIn?.(e)
          }
        }}
        onMouseLeave={(e) => {
          setIsHovered(false)
          setIsPressed(false)
          if (!disabled) hoverOut?.(e)
        }}
        onMouseDown={() => { if (!disabled) setIsPressed(true) }}
        onMouseUp={() => setIsPressed(false)}
      >
        {isCompacting ? (
          <Loader2
            size={15}
            style={{ animation: 'spin 1s linear infinite' }}
          />
        ) : (
          <Archive size={15} />
        )}
      </button>

      {/* Custom instruction popover */}
      {showPopover && (
        <div
          ref={popoverRef}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 10,
            width: 280,
            zIndex: 100,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
            animation: 'slideUp 0.15s ease',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            {t('compact.button')}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value.slice(0, 200))}
            onKeyDown={handlePopoverKeyDown}
            placeholder={t('compact.customPlaceholder')}
            maxLength={200}
            style={{
              width: '100%',
              fontSize: 12,
              padding: '6px 8px',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 6,
          }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
              {customInstruction.length}/200 &middot; Enter {t('common.confirm')} &middot; Esc {t('common.cancel')}
            </span>
            <button
              onClick={handlePopoverSubmit}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 10px',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: 'none',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.95)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.95)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)' }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
            >
              {t('compact.button')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
