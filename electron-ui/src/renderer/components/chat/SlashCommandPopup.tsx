import React from 'react'
import { Trash2, Archive, HelpCircle, Minus, Terminal, Zap, FileText, LayoutList, RotateCcw, Download, Compass, Shield, Webhook, Server, Brain, Cpu, DollarSign, BookOpen } from 'lucide-react'
import { useT } from '../../i18n'

export interface SlashCommand {
  name: string
  description: string
  descriptionKey?: string  // i18n key for translatable description
  icon: React.ElementType
  clientOnly?: boolean  // true = handled client-side, not sent to CLI
  category?: string    // optional grouping label
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/compact', description: 'Compact conversation history to reduce tokens', descriptionKey: 'command.compactDesc', icon: Archive, category: 'Session' },
  { name: '/clear', description: 'Clear current conversation (client-only)', descriptionKey: 'command.clearConversationDesc', icon: Trash2, clientOnly: true, category: 'Session' },
  { name: '/rename', description: 'Rename current session', icon: FileText, clientOnly: true, category: 'Session' },
  { name: '/export', description: 'Export current conversation', icon: Download, clientOnly: true, category: 'Session' },
  { name: '/help', description: 'Show available commands', descriptionKey: 'command.showHelpDesc', icon: HelpCircle, clientOnly: true, category: 'General' },
  { name: '/vim', description: 'Toggle Vim input mode', icon: Terminal, clientOnly: true, category: 'General' },
  { name: '/fast', description: 'Toggle fast model (Haiku)', icon: Zap, clientOnly: true, category: 'General' },
  { name: '/output-style', description: 'Cycle output style: default → explanatory → learning', icon: FileText, clientOnly: true, category: 'General' },
  { name: '/statusline', description: 'Show/hide status bar', icon: LayoutList, clientOnly: true, category: 'General' },
  { name: '/plan', description: 'Toggle plan mode (ultraplan)', icon: Compass, clientOnly: true, category: 'General' },
  { name: '/init', description: 'Initialize project (send /init to CLI)', icon: RotateCcw, category: 'General' },
  { name: '/model', description: 'Open model picker', icon: Cpu, clientOnly: true, category: 'Settings' },
  { name: '/permissions', description: 'Open permissions settings', icon: Shield, clientOnly: true, category: 'Settings' },
  { name: '/hooks', description: 'Open hooks settings', icon: Webhook, clientOnly: true, category: 'Settings' },
  { name: '/mcp', description: 'Open MCP settings', icon: Server, clientOnly: true, category: 'Settings' },
  { name: '/memory', description: 'Open memory panel', icon: Brain, clientOnly: true, category: 'Settings' },
  { name: '/cost', description: 'Show conversation stats', icon: DollarSign, clientOnly: true, category: 'Stats' },
  { name: '/skills', description: 'Open skills panel', icon: BookOpen, clientOnly: true, category: 'Stats' },
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

  // Group by category when not filtering
  const showGroups = !query && filtered.some(c => c.category)
  const groups: { label: string; commands: SlashCommand[] }[] = []
  if (showGroups) {
    const seen = new Set<string>()
    for (const cmd of filtered) {
      const cat = cmd.category || 'Other'
      if (!seen.has(cat)) {
        seen.add(cat)
        groups.push({ label: cat, commands: [] })
      }
      groups[groups.length - 1].commands.push(cmd)
    }
  }

  // Flat index tracker for selectedIndex alignment
  let flatIdx = -1

  return (
    <div
      className="popup-enter"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        background: 'rgba(15,15,25,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        boxShadow: '0 16px 48px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        zIndex: 1001,
        marginBottom: 4,
        overflow: 'hidden',
      }}
    >
      <style>{`.slash-popup-scroll::-webkit-scrollbar { width: 4px; } .slash-popup-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 2px; }`}</style>

      {/* Top micro-label header */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase' as const,
        color: 'rgba(255,255,255,0.38)',
        padding: '6px 12px 4px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        Commands
      </div>

      <div className="slash-popup-scroll" style={{ maxHeight: 260, overflowY: 'auto' }}>
        {showGroups ? (
          groups.map((group) => (
            <div key={group.label}>
              {/* Category group header — micro-label */}
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase' as const,
                color: 'rgba(255,255,255,0.38)',
                padding: '8px 12px 2px',
              }}>
                {group.label}
              </div>
              {group.commands.map((cmd) => {
                flatIdx++
                return renderCommand(cmd, flatIdx, selectedIndex, onSelect, onHover, t)
              })}
            </div>
          ))
        ) : (
          filtered.map((cmd) => {
            flatIdx++
            return renderCommand(cmd, flatIdx, selectedIndex, onSelect, onHover, t)
          })
        )}
      </div>

      {/* Footer keyboard hints */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        flexWrap: 'wrap' as const,
      }}>
        {[
          ['↑↓', 'navigate'],
          ['↵', 'select'],
          ['Esc', 'dismiss'],
        ].map(([key, label]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <kbd style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.6,
            }}>
              {key}
            </kbd>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function renderCommand(
  cmd: SlashCommand,
  flatIdx: number,
  selectedIndex: number,
  onSelect: (cmd: SlashCommand) => void,
  onHover: (i: number) => void,
  t: (key: string) => string,
) {
  const Icon = cmd.icon
  const isSelected = flatIdx === selectedIndex
  const slash = cmd.name.charAt(0) === '/' ? '/' : ''
  const cmdName = slash ? cmd.name.slice(1) : cmd.name

  return (
    <div
      key={cmd.name}
      onClick={() => onSelect(cmd)}
      onMouseEnter={(e) => {
        onHover(flatIdx)
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent'
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 12px',
        cursor: 'pointer',
        background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
        borderLeft: isSelected ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Icon container */}
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: isSelected ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s ease',
      }}>
        <Icon size={13} style={{ color: isSelected ? '#a5b4fc' : '#818cf8' }} />
      </div>

      {/* Name + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#818cf8' }}>{slash}</span>
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: isSelected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.82)',
            transition: 'color 0.15s ease',
          }}>
            {cmdName}
          </span>
        </div>
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.45)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {cmd.descriptionKey ? t(cmd.descriptionKey) : cmd.description}
        </div>
      </div>

      {/* client-only badge — glass kbd style */}
      {cmd.clientOnly && (
        <kbd style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 5,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.38)',
          padding: '1px 5px',
          fontFamily: 'monospace',
          flexShrink: 0,
        }}>
          client
        </kbd>
      )}
    </div>
  )
}
