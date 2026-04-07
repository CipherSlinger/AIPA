// TabBar — conversation tabs (Iteration 515)
// Displayed above ChatHeader when 2+ tabs are open.
// Supports: click to switch, middle-click to close, close button (X),
// horizontal scroll overflow for many tabs.
import React, { useRef, useEffect } from 'react'
import { X } from 'lucide-react'
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
      ref={scrollRef}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        overflowX: 'auto',
        overflowY: 'hidden',
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-sidebar, var(--bg-chat))',
        height: 34,
        minHeight: 34,
        scrollbarWidth: 'none',  // Firefox
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
              background: isActive ? 'var(--bg-chat)' : 'transparent',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              borderRight: '1px solid var(--border)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              maxWidth: 180,
              minWidth: 80,
              transition: 'background 0.15s ease, color 0.15s ease, border-bottom-color 0.15s ease',
              userSelect: 'none',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'var(--session-hover-bg, rgba(255,255,255,0.05))'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent'
              }
            }}
            title={tab.title}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
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
                padding: 2,
                borderRadius: 3,
                color: 'var(--text-muted)',
                opacity: 0.5,
                flexShrink: 0,
                transition: 'opacity 0.15s ease, background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.5'
                e.currentTarget.style.background = 'none'
              }}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
