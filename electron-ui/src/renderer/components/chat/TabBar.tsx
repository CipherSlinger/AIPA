// TabBar — conversation tabs (Iteration 516)
// Displayed above ChatHeader when 2+ tabs are open.
// Supports: click to switch, middle-click to close, close button (X),
// horizontal scroll overflow for many tabs.
import React, { useRef, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { useChatStore } from '../../store'
import type { TabInfo } from '../../store'
import { useT } from '../../i18n'

function truncateTitle(title: string, maxLen = 20): string {
  if (title.length <= maxLen) return title
  return title.slice(0, maxLen) + '\u2026'
}

export default function TabBar() {
  const t = useT()
  const tabs = useChatStore(s => s.tabs)
  const activeTabId = useChatStore(s => s.activeTabId)
  const switchTab = useChatStore(s => s.switchTab)
  const closeTab = useChatStore(s => s.closeTab)
  const clearMessages = useChatStore(s => s.clearMessages)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to keep the active tab visible
  useEffect(() => {
    if (!scrollRef.current || !activeTabId) return
    const activeEl = scrollRef.current.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [activeTabId])

  // Don't render if fewer than 2 tabs
  if (tabs.length < 2) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        flexShrink: 0,
        background: 'var(--glass-bg-mid)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--glass-border)',
        height: 36,
        minHeight: 36,
      }}
    >
      {/* Scrollable tab list */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          overflowX: 'auto',
          overflowY: 'hidden',
          flex: 1,
          scrollbarWidth: 'thin',
        }}
        className="tab-bar-scroll"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              onClick={() => switchTab(tab.id)}
              onAuxClick={(e) => {
                // Middle-click to close
                if (e.button === 1) {
                  e.preventDefault()
                  closeTab(tab.id)
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '0 10px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
                borderRight: '1px solid rgba(255,255,255,0.06)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                maxWidth: 180,
                minWidth: 80,
                transition: 'all 0.15s ease',
                userSelect: 'none',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }
              }}
              title={tab.title}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 120,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {truncateTitle(tab.title)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                title={t('tabs.close')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 2,
                  borderRadius: 4,
                  color: 'var(--text-faint)',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                  width: 18,
                  height: 18,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#f87171'
                  e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-faint)'
                  e.currentTarget.style.background = 'none'
                }}
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
      </div>

      {/* New tab button — ghost, right-pinned */}
      {clearMessages && (
        <button
          onClick={clearMessages}
          title={t('tabs.new') || 'New tab'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            flexShrink: 0,
            background: 'none',
            border: 'none',
            borderLeft: '1px solid var(--glass-border)',
            cursor: 'pointer',
            color: 'var(--text-faint)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-faint)'
            e.currentTarget.style.background = 'none'
          }}
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  )
}
