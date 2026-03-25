import React from 'react'
import { Trash2, Archive, HelpCircle } from 'lucide-react'

export interface SlashCommand {
  name: string
  description: string
  icon: React.ElementType
  clientOnly?: boolean  // true = 前端处理，不发给 CLI
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/compact', description: '压缩对话历史，减少 token 占用', icon: Archive },
  { name: '/clear', description: '清空当前对话（不发给 Claude）', icon: Trash2, clientOnly: true },
  { name: '/help', description: '显示可用命令', icon: HelpCircle, clientOnly: true },
]

interface Props {
  query: string   // 用户输入的 / 之后的内容
  onSelect: (cmd: SlashCommand) => void
  onDismiss: () => void
  selectedIndex: number
  onHover: (i: number) => void
}

export default function SlashCommandPopup({ query, onSelect, selectedIndex, onHover }: Props) {
  const filtered = SLASH_COMMANDS.filter(c =>
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
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
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
              background: i === selectedIndex ? 'var(--bg-active)' : 'transparent',
            }}
          >
            <Icon size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', minWidth: 80 }}>{cmd.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cmd.description}</span>
          </div>
        )
      })}
    </div>
  )
}
