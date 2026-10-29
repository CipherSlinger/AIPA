// The chat header's conversation-actions menu: one place to turn a finished
// session into a workflow or a skill, hand it to another department, or file it
// under a department by hand. Kept out of ChatHeader so that component stays
// focused on session chrome.

import React, { useCallback, useRef, useState } from 'react'
import { Building2, FolderInput, GitBranch, MoreHorizontal, Puzzle } from 'lucide-react'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useChatStore } from '../../store'
import SaveConversationWorkflowDialog from './SaveConversationWorkflowDialog'
import SaveConversationSkillDialog from './SaveConversationSkillDialog'
import HandoffDialog from './HandoffDialog'
import FileUnderDeptDialog from './FileUnderDeptDialog'

interface Props {
  messageCount: number
  sessionTitle: string | null
  headerBtnStyle: React.CSSProperties
  hoverIn: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean) => void
  hoverOut: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean, defaultColor?: string) => void
}

type DialogKind = 'workflow' | 'skill' | 'handoff' | 'file' | null

interface MenuItem {
  kind: Exclude<DialogKind, null>
  icon: React.ReactNode
  label: string
  hint: string
  disabled?: boolean
  disabledTitle?: string
}

export default function SessionReuseMenu({
  messageCount,
  sessionTitle,
  headerBtnStyle,
  hoverIn,
  hoverOut,
}: Props) {
  const t = useT()
  // Boolean selector: the header re-renders once when streaming starts/ends,
  // not on every chunk. A partial reply must never become the handoff note.
  const isStreaming = useChatStore(s => s.isStreaming)
  // The same id the handoff dialog reads. `currentSessionId` can be overwritten
  // by a streaming bridge, so it is not a stable source id for filing.
  const viewSessionId = useChatStore(s => s.viewSessionId)
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
  const handoffDisabled = disabled || isStreaming
  const handoffDisabledTitle = disabled
    ? t('chat.handoff.emptyConversation')
    : isStreaming
      ? t('chat.handoff.streaming')
      : undefined
  // Filing is a label, not an engine action, so a streaming reply does not
  // block it. It does need a saved session id to attach the label to.
  const fileDisabled = disabled || !viewSessionId
  const fileDisabledTitle = fileDisabled ? t('chat.file.menuNoSession') : undefined

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
            {
              kind: 'handoff' as const,
              icon: <Building2 size={14} />,
              label: t('chat.handoff.menuLabel'),
              hint: t('chat.handoff.menuHint'),
              disabled: handoffDisabled,
              disabledTitle: handoffDisabledTitle,
            },
            {
              kind: 'file' as const,
              icon: <FolderInput size={14} />,
              label: t('chat.file.menuLabel'),
              hint: t('chat.file.menuHint'),
              disabled: fileDisabled,
              disabledTitle: fileDisabledTitle,
            },
          ] as MenuItem[]).map(item => (
            <button
              key={item.kind}
              role="menuitem"
              onClick={() => { if (!item.disabled) choose(item.kind) }}
              disabled={item.disabled}
              title={item.disabledTitle}
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
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                opacity: item.disabled ? 0.45 : 1,
                textAlign: 'left',
                color: 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                if (item.disabled) return
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={e => {
                if (item.disabled) return
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
          sessionId={viewSessionId}
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
      {dialog === 'handoff' && (
        <HandoffDialog
          sessionTitle={sessionTitle}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'file' && viewSessionId && (
        <FileUnderDeptDialog
          sessionId={viewSessionId}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
