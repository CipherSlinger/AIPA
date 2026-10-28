// The chat header's conversation-actions menu: one place to turn a finished
// session into a workflow or a skill. Kept out of ChatHeader so that component
// stays focused on session chrome.

import React, { useCallback, useRef, useState } from 'react'
import { GitBranch, MoreHorizontal, Puzzle } from 'lucide-react'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import SaveConversationWorkflowDialog from './SaveConversationWorkflowDialog'
import SaveConversationSkillDialog from './SaveConversationSkillDialog'

interface Props {
  messageCount: number
  sessionTitle: string | null
  headerBtnStyle: React.CSSProperties
  hoverIn: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean) => void
  hoverOut: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean, defaultColor?: string) => void
}

type DialogKind = 'workflow' | 'skill' | null

export default function SessionReuseMenu({
  messageCount,
  sessionTitle,
  headerBtnStyle,
  hoverIn,
  hoverOut,
}: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => setOpen(false), [])
  useClickOutside(menuRef, open, closeMenu)

  const choose = useCallback((kind: Exclude<DialogKind, null>) => {
    setOpen(false)
    setDialog(kind)
  }, [])

  const disabled = messageCount === 0

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(value => !value)}
        disabled={disabled}
        title={t('sessionReuse.menu.label')}
        aria-label={t('sessionReuse.menu.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-session-reuse-menu
        style={{
          ...headerBtnStyle,
          background: open ? 'rgba(99,102,241,0.15)' : headerBtnStyle.background,
          color: open ? '#818cf8' : headerBtnStyle.color,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.3 : 1,
        }}
        onMouseEnter={e => hoverIn(e, open)}
        onMouseLeave={e => hoverOut(e, open)}
      >
        <MoreHorizontal size={15} />
      </button>

      {open && !disabled && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 268,
            zIndex: 260,
            padding: 5,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)',
            animation: 'slideUp 0.15s ease',
          }}
        >
          {([
            {
              kind: 'workflow' as const,
              icon: <GitBranch size={14} />,
              label: t('sessionReuse.menu.saveWorkflow'),
              hint: t('sessionReuse.menu.saveWorkflowHint'),
            },
            {
              kind: 'skill' as const,
              icon: <Puzzle size={14} />,
              label: t('sessionReuse.menu.saveSkill'),
              hint: t('sessionReuse.menu.saveSkillHint'),
            },
          ]).map(item => (
            <button
              key={item.kind}
              role="menuitem"
              onClick={() => choose(item.kind)}
              data-reuse-menu-item={item.kind}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 9,
                padding: '8px 9px',
                background: 'transparent',
                border: 'none',
                borderRadius: 7,
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <span style={{ color: '#818cf8', marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                  {item.label}
                </span>
                <span style={{
                  display: 'block', fontSize: 10, color: 'var(--text-muted)',
                  marginTop: 2, lineHeight: 1.4,
                }}>
                  {item.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {dialog === 'workflow' && (
        <SaveConversationWorkflowDialog
          sessionTitle={sessionTitle}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'skill' && (
        <SaveConversationSkillDialog
          sessionTitle={sessionTitle}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
