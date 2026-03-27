import React from 'react'
import { Trash2, Archive, HelpCircle, Minus } from 'lucide-react'
import { useT } from '../../i18n'

export interface SlashCommand {
  name: string
  description: string
  descriptionKey?: string  // i18n key for translatable description
  icon: React.ElementType
  clientOnly?: boolean  // true = handled client-side, not sent to CLI
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/compact', description: 'Compact conversation history to reduce tokens', descriptionKey: 'command.compactDesc', icon: Archive },
  { name: '/clear', description: 'Clear current conversation (client-only)', descriptionKey: 'command.clearConversationDesc', icon: Trash2, clientOnly: true },
  { name: '/help', description: 'Show available commands', descriptionKey: 'command.showHelpDesc', icon: HelpCircle, clientOnly: true },
]

interface Props {
  query: string   // text after the / that the user typed
  onSelect: (cmd: SlashCommand) => void
  onDismiss: () => void
  selectedIndex: number
  onHover: (i: number) => void
  extraCommands?: { name: string; description: string }[]
}

export default function SlashCommandPopup({ query, onSelect, onDismiss, selectedIndex, onHover, extraCommands }: Props) {
  const t = useT()
  const allCommands: SlashCommand[] = [
    ...SLASH_COMMANDS,
    ...(extraCommands || [])
      .filter(ec => !SLASH_COMMANDS.some(bc => bc.name === ec.name))
      .map(ec => ({ name: ec.name, description: ec.description, icon: Minus })),
  ]
  const filtered = allCommands.filter(c =>
    !query || c.name.toLowerCase().includes(query.toLowerCase())
  )

  if (filtered.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        background: 'var(--popup-bg)',
        border: '1px solid var(--popup-border)',
        borderRadius: 6,
        boxShadow: 'var(--popup-shadow)',
        zIndex: 1001,
        marginBottom: 4,
        overflow: 'hidden',
      }}
    >
      {filtered.map((cmd, i) => {
        const Icon = cmd.icon
        return (
          <div
            key={cmd.name}
            onClick={() => onSelect(cmd)}
            onMouseEnter={() => onHover(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              cursor: 'pointer',
              background: i === selectedIndex ? 'var(--popup-item-hover)' : 'transparent',
            }}
          >
            <Icon size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', minWidth: 80 }}>{cmd.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cmd.descriptionKey ? t(cmd.descriptionKey) : cmd.description}</span>
          </div>
        )
      })}
    </div>
  )
}
