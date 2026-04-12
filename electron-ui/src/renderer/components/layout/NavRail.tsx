import React, { useMemo } from 'react'
import { Building2, NotebookPen, Puzzle, Brain, Workflow, Settings, User, PanelLeftClose, PanelLeftOpen, CheckSquare, GitBranch, Users } from 'lucide-react'
import { useUiStore, useChatStore, usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import { AVATAR_PRESETS } from './avatarPresets'

const AvatarPicker = React.lazy(() => import('./AvatarPicker'))

interface NavItemProps {
  icon: React.ReactNode
  label: string
  isActive?: boolean
  onClick: () => void
  badge?: number
  badgeColor?: string
  shortcut?: string
  expanded?: boolean
  pulseDot?: boolean  // Show a pulsing activity dot (e.g., streaming indicator)
}

function NavItem({ icon, label, isActive, onClick, badge, badgeColor, shortcut, expanded, pulseDot }: NavItemProps) {
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
        borderRadius: 8,
        border: 'none',
        background: isActive
          ? 'rgba(99,102,241,0.10)'
          : hovered
          ? 'rgba(255,255,255,0.06)'
          : 'transparent',
        position: 'relative',
        marginBottom: 1,
        transition: 'background 0.15s ease, color 0.15s ease',
        color: isActive
          ? '#818cf8'
          : hovered
          ? 'rgba(255,255,255,0.75)'
          : 'rgba(255,255,255,0.45)',
        flexShrink: 0,
        gap: expanded ? 6 : 0,
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
            width: 2,
            height: 16,
            borderRadius: '0 2px 2px 0',
            background: 'rgba(99,102,241,0.6)',
            opacity: 1,
            transition: 'opacity 0.15s ease',
          }}
        />
      )}

      {/* Icon — always 18px stroke-width 1.5 */}
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</span>

      {/* Label (expanded mode only) */}
      {expanded && (
        <span style={{
          fontSize: 10,
          fontWeight: isActive ? 700 : 400,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
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
            background: badgeColor || '#6366f1',
            color: 'rgba(255,255,255,0.95)',
            fontSize: 9,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            lineHeight: 1,
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
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
            border: '1.5px solid rgba(10,10,18,1)',
            animation: 'pulse 2s ease infinite',
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
            background: 'rgba(15,15,25,0.96)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 7,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.82)',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            zIndex: 100,
            animation: 'slideUp 0.15s ease',
          }}
        >
          {label}
          {shortcut && (
            <span style={{
              marginLeft: 6,
              padding: '1px 4px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.10)',
              fontSize: 10,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.45)',
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

  const mainView = useUiStore(s => s.mainView)

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
  const [avatarHovered, setAvatarHovered] = React.useState(false)
  const avatarAnchorRef = React.useRef<HTMLDivElement>(null)

  const toggleNavExpanded = () => {
    const next = !navExpanded
    usePrefsStore.getState().setPrefs({ navExpanded: next })
    window.electronAPI.prefsSet('navExpanded', next)
  }

  // The active panel item (history/files/settings) matches activeNavItem
  const isHistoryActive = activeNavItem === 'history' && sidebarTab === 'history'
  const isDepartmentActive = mainView === 'department'
  const isNotesActive = mainView === 'notes' || (activeNavItem === 'notes' && sidebarTab === 'notes')
  const isSkillsActive = activeNavItem === 'skills' && sidebarTab === 'skills'
  const isMemoryActive = activeNavItem === 'memory' && sidebarTab === 'memory'
  const isWorkflowsActive = activeNavItem === 'workflows' && sidebarTab === 'workflows'
  const isChannelActive = activeNavItem === 'channel' && sidebarTab === 'channel'
  const isTasksActive = activeNavItem === 'tasks' && sidebarTab === 'tasks'
  const isChangesActive = activeNavItem === 'changes' && sidebarTab === 'changes'
  const changedFiles = useChatStore(s => s.changedFiles)
  const changedFilesCount = useMemo(() => new Set(changedFiles.map(f => f.filePath)).size, [changedFiles])
  const isStreaming = useChatStore(s => s.isStreaming)
  const isSettingsActive = useUiStore(s => s.settingsModalOpen)
  const unreadSessionCount = useUiStore(s => s.unreadSessionCount)

  // All nav icons normalized to 18px
  const iconSize = 18

  return (
    <nav
      role="navigation"
      aria-label={t('a11y.mainNavigation')}
      style={{
        width: navExpanded ? 152 : 48,
        flexShrink: 0,
        background: 'rgba(10,10,18,0.97)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
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
        transition: 'width 0.15s ease',
      }}
    >
      {/* Departments */}
      <NavItem
        icon={<Building2 size={iconSize} strokeWidth={1.5} />}
        label={t('nav.departments')}
        shortcut="Ctrl+1"
        isActive={isDepartmentActive}
        onClick={() => useUiStore.getState().setMainView('department')}
        pulseDot={isStreaming && !isDepartmentActive}
        badge={unreadSessionCount > 0 ? unreadSessionCount : undefined}
        badgeColor="#f87171"
        expanded={navExpanded}
      />

      {/* Employees (Workflows) */}
      <NavItem
        icon={<Users size={iconSize} strokeWidth={1.5} />}
        label={t('nav.employees')}
        shortcut="Ctrl+6"
        isActive={isWorkflowsActive}
        onClick={() => setActiveNavItem('workflows')}
        expanded={navExpanded}
      />

      {/* Notes */}
      <NavItem
        icon={<NotebookPen size={iconSize} strokeWidth={1.5} />}
        label={t('nav.notes')}
        shortcut="Ctrl+3"
        isActive={isNotesActive}
        onClick={() => setActiveNavItem('notes')}
        expanded={navExpanded}
      />

      {/* Skills */}
      <NavItem
        icon={<Puzzle size={iconSize} strokeWidth={1.5} />}
        label={t('nav.skills')}
        shortcut="Ctrl+4"
        isActive={isSkillsActive}
        onClick={() => setActiveNavItem('skills')}
        expanded={navExpanded}
      />

      {/* Memory */}
      <NavItem
        icon={<Brain size={iconSize} strokeWidth={1.5} />}
        label={t('nav.memory')}
        shortcut="Ctrl+5"
        isActive={isMemoryActive}
        onClick={() => setActiveNavItem('memory')}
        expanded={navExpanded}
      />

      {/* Channel */}
      <NavItem
        icon={<Workflow size={iconSize} strokeWidth={1.5} />}
        label={t('nav.channel')}
        shortcut="Ctrl+7"
        isActive={isChannelActive}
        onClick={() => setActiveNavItem('channel')}
        expanded={navExpanded}
      />

      {/* Tasks (Iteration 465) */}
      <NavItem
        icon={<CheckSquare size={iconSize} strokeWidth={1.5} />}
        label={t('nav.tasks')}
        shortcut="Ctrl+8"
        isActive={isTasksActive}
        onClick={() => setActiveNavItem('tasks')}
        expanded={navExpanded}
      />

      {/* Changes (Iteration 521) */}
      <NavItem
        icon={<GitBranch size={iconSize} strokeWidth={1.5} />}
        label={t('nav.changes')}
        shortcut="Ctrl+9"
        isActive={isChangesActive}
        onClick={() => setActiveNavItem('changes')}
        badge={changedFilesCount > 0 ? changedFilesCount : undefined}
        badgeColor="#6366f1"
        expanded={navExpanded}
      />

      {/* Spacer — pushes avatar + settings + toggle to bottom */}
      <div style={{ flex: 1 }} />

      {/* Bottom section separator */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 6,
        marginTop: 4,
        marginLeft: navExpanded ? -6 : -4,
        marginRight: navExpanded ? -6 : -4,
      }} />

      {/* Avatar -- shows persona emoji, preset avatar, or generic user icon */}
      <div style={{ position: 'relative', flexShrink: 0, marginBottom: 2 }}>
        <div
          ref={avatarAnchorRef}
          onClick={() => setShowAvatarPicker(!showAvatarPicker)}
          onMouseEnter={() => setAvatarHovered(true)}
          onMouseLeave={() => setAvatarHovered(false)}
          style={{
            width: navExpanded ? '100%' : 30,
            height: 30,
            borderRadius: navExpanded ? 7 : '50%',
            background: activePersona
              ? `${activePersona.color}20`
              : selectedAvatar
              ? selectedAvatar.bg
              : 'rgba(99,102,241,0.20)',
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
            boxShadow: avatarHovered
              ? '0 0 0 2px rgba(99,102,241,0.30)'
              : 'none',
            transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, width 0.15s ease',
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
            : <User size={14} strokeWidth={1.5} color="rgba(255,255,255,0.82)" />
          }
          {navExpanded && (
            <span style={{
              fontSize: 10,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.45)',
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
            <AvatarPicker onClose={() => setShowAvatarPicker(false)} navExpanded={navExpanded} anchorRef={avatarAnchorRef} />
          </React.Suspense>
        )}
      </div>

      {/* Settings */}
      <NavItem
        icon={<Settings size={iconSize} strokeWidth={1.5} />}
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
          color: 'rgba(255,255,255,0.38)',
          gap: navExpanded ? 6 : 0,
          paddingLeft: navExpanded ? 10 : 0,
          paddingRight: navExpanded ? 8 : 0,
          boxSizing: 'border-box',
          transition: 'background 0.15s ease, color 0.15s ease, width 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(255,255,255,0.38)'
        }}
      >
        {navExpanded
          ? <PanelLeftClose size={16} strokeWidth={1.5} />
          : <PanelLeftOpen size={16} strokeWidth={1.5} />
        }
        {navExpanded && (
          <span style={{
            fontSize: 10,
            fontWeight: 400,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'inherit',
          }}>
            {t('nav.collapseNav')}
          </span>
        )}
      </button>
    </nav>
  )
}
