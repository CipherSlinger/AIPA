import React from 'react'
import { MessageSquarePlus, History, FolderOpen, TerminalSquare, Settings, User } from 'lucide-react'
import { useUiStore, useSessionStore, useChatStore } from '../../store'
import { useT } from '../../i18n'

interface NavItemProps {
  icon: React.ReactNode
  label: string
  isActive?: boolean
  onClick: () => void
  badge?: number
  shortcut?: string
}

function NavItem({ icon, label, isActive, onClick, badge, shortcut }: NavItemProps) {
  const [hovered, setHovered] = React.useState(false)
  const [showTooltip, setShowTooltip] = React.useState(false)
  const tooltipTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    setHovered(true)
    tooltipTimerRef.current = setTimeout(() => setShowTooltip(true), 400)
  }

  const handleMouseLeave = () => {
    setHovered(false)
    setShowTooltip(false)
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
  }

  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="nav-icon-btn"
      style={{
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        border: 'none',
        background: isActive
          ? 'rgba(255,255,255,0.08)'
          : hovered
          ? 'rgba(255,255,255,0.06)'
          : 'transparent',
        cursor: 'pointer',
        position: 'relative',
        marginBottom: 4,
        transition: 'background 0.15s ease',
        color: isActive
          ? 'var(--nav-icon-active)'
          : hovered
          ? 'var(--nav-icon-hover)'
          : 'var(--nav-icon-default)',
        flexShrink: 0,
      }}
    >
      {/* Left accent bar (selected indicator) */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 3,
            height: 20,
            borderRadius: '0 2px 2px 0',
            background: 'var(--nav-indicator)',
            opacity: 1,
            transition: 'opacity 0.15s ease',
          }}
        />
      )}

      {/* Icon */}
      {icon}

      {/* Badge */}
      {badge !== undefined && badge > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 2,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            background: 'var(--accent)',
            color: '#ffffff',
            fontSize: 9,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          {badge > 99 ? '99+' : badge}
        </div>
      )}

      {/* Custom tooltip */}
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            left: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            marginLeft: 8,
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--popup-shadow)',
            pointerEvents: 'none',
            zIndex: 100,
            animation: 'popup-in 0.12s ease',
          }}
        >
          {label}
          {shortcut && (
            <span style={{
              marginLeft: 6,
              padding: '1px 4px',
              borderRadius: 3,
              background: 'rgba(255,255,255,0.1)',
              fontSize: 10,
              fontWeight: 400,
              color: 'var(--text-muted)',
              letterSpacing: '0.02em',
            }}>
              {shortcut}
            </span>
          )}
        </div>
      )}
    </button>
  )
}

export default function NavRail() {
  const {
    activeNavItem,
    setActiveNavItem,
    toggleTerminal,
    sidebarTab,
  } = useUiStore()

  const sessionCount = useSessionStore(s => s.sessions.length)
  const t = useT()

  // The active panel item (history/files/settings) matches activeNavItem
  const isHistoryActive = activeNavItem === 'history' && sidebarTab === 'history'
  const isFilesActive = activeNavItem === 'files' && sidebarTab === 'files'
  const isSettingsActive = activeNavItem === 'settings' && sidebarTab === 'settings'

  const handleNewChat = () => {
    // Same logic as Ctrl+N in App.tsx: clear messages to start fresh
    const store = useChatStore.getState()
    if (store.isStreaming) return
    store.clearMessages()
  }

  const handleTerminal = () => {
    setActiveNavItem('terminal')
    toggleTerminal()
  }

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      style={{
        width: 56,
        flexShrink: 0,
        background: 'var(--bg-nav)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 12,
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* New Chat */}
      <NavItem
        icon={<MessageSquarePlus size={20} />}
        label={t('nav.newChat')}
        shortcut="Ctrl+N"
        onClick={handleNewChat}
      />

      {/* History */}
      <NavItem
        icon={<History size={20} />}
        label={t('nav.history')}
        shortcut="Ctrl+B"
        isActive={isHistoryActive}
        onClick={() => setActiveNavItem('history')}
        badge={sessionCount}
      />

      {/* Files */}
      <NavItem
        icon={<FolderOpen size={20} />}
        label={t('nav.files')}
        isActive={isFilesActive}
        onClick={() => setActiveNavItem('files')}
      />

      {/* Terminal */}
      <NavItem
        icon={<TerminalSquare size={20} />}
        label={t('nav.terminal')}
        shortcut="Ctrl+`"
        onClick={handleTerminal}
      />

      {/* Spacer — pushes settings + avatar to bottom */}
      <div style={{ flex: 1 }} />

      {/* Settings */}
      <NavItem
        icon={<Settings size={20} />}
        label={t('nav.settings')}
        shortcut="Ctrl+,"
        isActive={isSettingsActive}
        onClick={() => setActiveNavItem('settings')}
      />

      {/* Avatar placeholder */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--avatar-ai)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'default',
          marginTop: 8,
          flexShrink: 0,
        }}
        aria-label={t('nav.userProfile')}
      >
        <User size={18} color="#ffffff" />
      </div>
    </nav>
  )
}
