import React from 'react'
import { MessageSquarePlus, History, FolderOpen, NotebookPen, Puzzle, Brain, Workflow, Settings, User, PanelLeftClose, PanelLeftOpen, Radio, Bell } from 'lucide-react'
import { useUiStore, useChatStore, usePrefsStore, useSessionStore } from '../../store'
import { useT } from '../../i18n'
import { AVATAR_PRESETS } from './avatarPresets'

const AvatarPicker = React.lazy(() => import('./AvatarPicker'))

interface NavItemProps {
  icon: React.ReactNode
  label: string
  isActive?: boolean
  onClick: () => void
  badge?: number
  shortcut?: string
  expanded?: boolean
  pulseDot?: boolean  // Show a pulsing activity dot (e.g., streaming indicator)
}

function NavItem({ icon, label, isActive, onClick, badge, shortcut, expanded, pulseDot }: NavItemProps) {
  const [hovered, setHovered] = React.useState(false)
  const [showTooltip, setShowTooltip] = React.useState(false)
  const tooltipTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    setHovered(true)
    // Only show tooltip in collapsed mode
    if (!expanded) {
      tooltipTimerRef.current = setTimeout(() => setShowTooltip(true), 300)
    }
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
        width: expanded ? '100%' : 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: expanded ? 'flex-start' : 'center',
        borderRadius: 7,
        border: 'none',
        background: isActive
          ? 'rgba(255,255,255,0.08)'
          : hovered
          ? 'rgba(255,255,255,0.06)'
          : 'transparent',
        cursor: 'pointer',
        position: 'relative',
        marginBottom: 1,
        transition: 'background 0.15s ease, width 0.2s ease',
        color: isActive
          ? 'var(--nav-icon-active)'
          : hovered
          ? 'var(--nav-icon-hover)'
          : 'var(--nav-icon-default)',
        flexShrink: 0,
        gap: expanded ? 10 : 0,
        paddingLeft: expanded ? 10 : 0,
        paddingRight: expanded ? 8 : 0,
        boxSizing: 'border-box',
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
            height: 16,
            borderRadius: '0 2px 2px 0',
            background: 'var(--nav-indicator)',
            opacity: 1,
            transition: 'opacity 0.15s ease',
          }}
        />
      )}

      {/* Icon */}
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</span>

      {/* Label (expanded mode only) */}
      {expanded && (
        <span style={{
          fontSize: 12,
          fontWeight: isActive ? 600 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          textAlign: 'left',
          lineHeight: 1.2,
        }}>
          {label}
        </span>
      )}

      {/* Badge */}
      {badge !== undefined && badge > 0 && (
        <div
          style={{
            position: expanded ? 'relative' : 'absolute',
            top: expanded ? undefined : 4,
            right: expanded ? undefined : 2,
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
            flexShrink: 0,
          }}
        >
          {badge > 99 ? '99+' : badge}
        </div>
      )}

      {/* Streaming activity dot */}
      {pulseDot && (
        <div
          style={{
            position: 'absolute',
            top: expanded ? 6 : 4,
            right: expanded ? 6 : 2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#4ade80',
            border: '1.5px solid var(--bg-nav)',
            animation: 'pulse 1.2s ease-in-out infinite',
            zIndex: 2,
          }}
        />
      )}

      {/* Custom tooltip (collapsed mode only) */}
      {showTooltip && !expanded && (
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
    sidebarTab,
  } = useUiStore()

  const navExpanded = usePrefsStore(s => !!s.prefs.navExpanded)
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const avatarPreset = usePrefsStore(s => s.prefs.avatarPreset)
  const selectedAvatar = avatarPreset ? AVATAR_PRESETS.find(a => a.id === avatarPreset) : undefined
  const activePersona = usePrefsStore(s => {
    const personas = s.prefs.personas || []
    // Prefer session persona, fall back to default persona
    const pid = sessionPersonaId || s.prefs.activePersonaId
    return pid ? personas.find(p => p.id === pid) : undefined
  })
  const t = useT()

  const [showAvatarPicker, setShowAvatarPicker] = React.useState(false)

  const toggleNavExpanded = () => {
    const next = !navExpanded
    usePrefsStore.getState().setPrefs({ navExpanded: next })
    window.electronAPI.prefsSet('navExpanded', next)
  }

  // The active panel item (history/files/settings) matches activeNavItem
  const isHistoryActive = activeNavItem === 'history' && sidebarTab === 'history'
  const isFilesActive = activeNavItem === 'files' && sidebarTab === 'files'
  const isNotesActive = activeNavItem === 'notes' && sidebarTab === 'notes'
  const isSkillsActive = activeNavItem === 'skills' && sidebarTab === 'skills'
  const isMemoryActive = activeNavItem === 'memory' && sidebarTab === 'memory'
  const isWorkflowsActive = activeNavItem === 'workflows' && sidebarTab === 'workflows'
  const isChannelActive = activeNavItem === 'channel' && sidebarTab === 'channel'
  const isNotificationsActive = activeNavItem === 'notifications' && sidebarTab === 'notifications'
  const unreadNotificationCount = useUiStore(s => s.unreadNotificationCount)
  const isStreaming = useChatStore(s => s.isStreaming)
  const sessionCount = useSessionStore(s => s.sessions.length)
  const isSettingsActive = useUiStore(s => s.settingsModalOpen)

  const handleNewChat = () => {
    // Same logic as Ctrl+N in App.tsx: clear messages to start fresh
    const store = useChatStore.getState()
    if (store.isStreaming) return
    store.clearMessages()
  }

  const iconSize = navExpanded ? 20 : 18

  return (
    <nav
      role="navigation"
      aria-label={t('a11y.mainNavigation')}
      style={{
        width: navExpanded ? 152 : 48,
        flexShrink: 0,
        background: 'var(--bg-nav)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: navExpanded ? 'stretch' : 'center',
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: navExpanded ? 6 : 0,
        paddingRight: navExpanded ? 6 : 0,
        userSelect: 'none',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'width 0.2s ease',
      }}
    >
      {/* New Chat */}
      <NavItem
        icon={<MessageSquarePlus size={iconSize} />}
        label={t('nav.newChat')}
        shortcut="Ctrl+N"
        onClick={handleNewChat}
        expanded={navExpanded}
      />

      {/* History */}
      <NavItem
        icon={<History size={iconSize} />}
        label={t('nav.history')}
        shortcut="Ctrl+1"
        isActive={isHistoryActive}
        onClick={() => setActiveNavItem('history')}
        badge={sessionCount > 0 ? sessionCount : undefined}
        pulseDot={isStreaming && !isHistoryActive}
        expanded={navExpanded}
      />

      {/* Files */}
      <NavItem
        icon={<FolderOpen size={iconSize} />}
        label={t('nav.files')}
        shortcut="Ctrl+2"
        isActive={isFilesActive}
        onClick={() => setActiveNavItem('files')}
        expanded={navExpanded}
      />

      {/* Notes */}
      <NavItem
        icon={<NotebookPen size={iconSize} />}
        label={t('nav.notes')}
        shortcut="Ctrl+3"
        isActive={isNotesActive}
        onClick={() => setActiveNavItem('notes')}
        expanded={navExpanded}
      />

      {/* Skills */}
      <NavItem
        icon={<Puzzle size={iconSize} />}
        label={t('nav.skills')}
        shortcut="Ctrl+4"
        isActive={isSkillsActive}
        onClick={() => setActiveNavItem('skills')}
        expanded={navExpanded}
      />

      {/* Memory */}
      <NavItem
        icon={<Brain size={iconSize} />}
        label={t('nav.memory')}
        shortcut="Ctrl+5"
        isActive={isMemoryActive}
        onClick={() => setActiveNavItem('memory')}
        expanded={navExpanded}
      />

      {/* Workflows */}
      <NavItem
        icon={<Workflow size={iconSize} />}
        label={t('nav.workflows')}
        shortcut="Ctrl+6"
        isActive={isWorkflowsActive}
        onClick={() => setActiveNavItem('workflows')}
        expanded={navExpanded}
      />

      {/* Channel */}
      <NavItem
        icon={<Radio size={iconSize} />}
        label={t('nav.channel')}
        shortcut="Ctrl+7"
        isActive={isChannelActive}
        onClick={() => setActiveNavItem('channel')}
        expanded={navExpanded}
      />

      {/* Notifications */}
      <NavItem
        icon={<Bell size={iconSize} />}
        label={t('nav.notifications')}
        shortcut="Ctrl+8"
        isActive={isNotificationsActive}
        badge={unreadNotificationCount}
        onClick={() => setActiveNavItem('notifications')}
        expanded={navExpanded}
      />

      {/* Spacer — pushes avatar + settings + toggle to bottom */}
      <div style={{ flex: 1 }} />

      {/* Avatar -- shows persona emoji, preset avatar, or generic user icon */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          onClick={() => setShowAvatarPicker(!showAvatarPicker)}
          style={{
            width: navExpanded ? '100%' : 30,
            height: 30,
            borderRadius: navExpanded ? 7 : '50%',
            background: activePersona
              ? `${activePersona.color}20`
              : selectedAvatar
              ? selectedAvatar.bg
              : 'var(--avatar-ai)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: navExpanded ? 'flex-start' : 'center',
            cursor: 'pointer',
            flexShrink: 0,
            border: activePersona
              ? `2px solid ${activePersona.color}`
              : selectedAvatar
              ? `2px solid ${selectedAvatar.border}`
              : '2px solid transparent',
            transition: 'background 200ms, border-color 200ms, width 0.2s ease',
            gap: navExpanded ? 8 : 0,
            paddingLeft: navExpanded ? 8 : 0,
            boxSizing: 'border-box',
          }}
          aria-label={activePersona ? activePersona.name : selectedAvatar ? t(selectedAvatar.nameKey) : t('nav.userProfile')}
          title={activePersona ? activePersona.name : selectedAvatar ? t(selectedAvatar.nameKey) : t('nav.userProfile')}
        >
          {activePersona
            ? <span style={{ fontSize: 14, lineHeight: 1 }}>{activePersona.emoji}</span>
            : selectedAvatar
            ? <span style={{ fontSize: 14, lineHeight: 1 }}>{selectedAvatar.emoji}</span>
            : <User size={14} color="#ffffff" />
          }
          {navExpanded && (
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {activePersona ? activePersona.name : selectedAvatar ? t(selectedAvatar.nameKey) : t('nav.userProfile')}
            </span>
          )}
        </div>

        {/* Avatar Picker dropdown */}
        {showAvatarPicker && (
          <React.Suspense fallback={null}>
            <AvatarPicker onClose={() => setShowAvatarPicker(false)} navExpanded={navExpanded} />
          </React.Suspense>
        )}
      </div>

      {/* Settings */}
      <NavItem
        icon={<Settings size={iconSize} />}
        label={t('nav.settings')}
        shortcut="Ctrl+,"
        isActive={isSettingsActive}
        onClick={() => useUiStore.getState().openSettingsModal()}
        expanded={navExpanded}
      />

      {/* Expand / Collapse toggle */}
      <button
        onClick={toggleNavExpanded}
        aria-label={navExpanded ? t('nav.collapseNav') : t('nav.expandNav')}
        style={{
          width: navExpanded ? '100%' : 32,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: navExpanded ? 'flex-start' : 'center',
          borderRadius: 7,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          marginTop: 4,
          color: 'var(--nav-icon-default)',
          gap: navExpanded ? 8 : 0,
          paddingLeft: navExpanded ? 10 : 0,
          paddingRight: navExpanded ? 8 : 0,
          boxSizing: 'border-box',
          transition: 'background 0.15s ease, width 0.2s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        {navExpanded
          ? <PanelLeftClose size={16} />
          : <PanelLeftOpen size={16} />
        }
        {navExpanded && (
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
            {t('nav.collapseNav')}
          </span>
        )}
      </button>
    </nav>
  )
}
