import React from 'react'
import { Trash2, Archive, HelpCircle, Terminal, Zap, FileText, LayoutList, RotateCcw, Download, Compass, Shield, Webhook, Server, Brain, Cpu, DollarSign, BookOpen, FolderOpen, GitBranch, GitCommit, GitPullRequest, GitFork, Code, Settings, LogOut, LogIn, Keyboard, Rewind, History, Mic, Info, Layers, Flag } from 'lucide-react'
import { useT } from '../../i18n'

export interface SlashCommand {
  name: string
  description: string
  descriptionKey?: string  // i18n key for translatable description
  icon: React.ElementType
  clientOnly?: boolean  // true = handled client-side, not sent to CLI
  category?: string    // optional grouping label
  isCustom?: boolean   // true = loaded from .claude/commands/
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Session
  { name: '/compact', description: 'Compact conversation history to reduce tokens', descriptionKey: 'command.compactDesc', icon: Archive, category: 'Session' },
  { name: '/clear', description: 'Clear current conversation (client-only)', descriptionKey: 'command.clearConversationDesc', icon: Trash2, clientOnly: true, category: 'Session' },
  { name: '/rename', description: 'Rename current session', icon: FileText, clientOnly: true, category: 'Session' },
  { name: '/export', description: 'Export current conversation', icon: Download, clientOnly: true, category: 'Session' },
  { name: '/resume', description: 'Resume a previous session', icon: History, category: 'Session' },
  { name: '/rewind', description: 'Rewind to message N', icon: Rewind, category: 'Session' },
  { name: '/fork', description: 'Fork session branch', icon: GitFork, category: 'Session' },
  // General
  { name: '/help', description: 'Show available commands', descriptionKey: 'command.showHelpDesc', icon: HelpCircle, clientOnly: true, category: 'General' },
  { name: '/vim', description: 'Toggle Vim input mode', icon: Terminal, clientOnly: true, category: 'General' },
  { name: '/fast', description: 'Toggle fast model (Haiku)', icon: Zap, clientOnly: true, category: 'General' },
  { name: '/output-style', description: 'Cycle output style: default → explanatory → learning', icon: FileText, clientOnly: true, category: 'General' },
  { name: '/statusline', description: 'Show/hide status bar', icon: LayoutList, clientOnly: true, category: 'General' },
  { name: '/plan', description: 'Toggle plan mode (ultraplan)', icon: Compass, clientOnly: true, category: 'General' },
  { name: '/init', description: 'Initialize project (send /init to CLI)', icon: RotateCcw, category: 'General' },
  { name: '/voice', description: 'Voice input', icon: Mic, clientOnly: true, category: 'General' },
  // Settings
  { name: '/model', description: 'Open model picker', icon: Cpu, clientOnly: true, category: 'Settings' },
  { name: '/permissions', description: 'Open permissions settings', icon: Shield, clientOnly: true, category: 'Settings' },
  { name: '/hooks', description: 'Open hooks settings', icon: Webhook, clientOnly: true, category: 'Settings' },
  { name: '/mcp', description: 'Open MCP project config', icon: Server, clientOnly: true, category: 'Settings' },
  { name: '/sandbox', description: 'Open sandbox settings', icon: Settings, clientOnly: true, category: 'Settings' },
  { name: '/ai-engine', description: 'Open AI engine / provider settings', icon: Cpu, clientOnly: true, category: 'Settings' },
  { name: '/providers', description: 'Open AI provider settings (alias for /ai-engine)', icon: Cpu, clientOnly: true, category: 'Settings' },
  { name: '/memory', description: 'Open memory panel', icon: Brain, clientOnly: true, category: 'Settings' },
  { name: '/config', description: 'View/edit configuration', icon: Settings, category: 'Settings' },
  { name: '/effort', description: 'Set effort level', icon: Flag, category: 'Settings' },
  { name: '/keybindings', description: 'View keyboard shortcuts', icon: Keyboard, clientOnly: true, category: 'Settings' },
  { name: '/login', description: 'Log in', icon: LogIn, category: 'Settings' },
  { name: '/logout', description: 'Log out', icon: LogOut, category: 'Settings' },
  // Stats
  { name: '/cost', description: 'Show conversation stats', icon: DollarSign, clientOnly: true, category: 'Stats' },
  { name: '/status', description: 'View current session status', icon: Info, category: 'Stats' },
  { name: '/context', description: 'View current context', icon: Layers, category: 'Stats' },
  { name: '/skills', description: 'Open skills panel', icon: BookOpen, clientOnly: true, category: 'Stats' },
  // Git
  { name: '/commit', description: 'Create a git commit', icon: GitCommit, category: 'Git' },
  { name: '/pr', description: 'Create a Pull Request', icon: GitPullRequest, category: 'Git' },
  { name: '/review', description: 'Code review', icon: Code, category: 'Git' },
  { name: '/diff', description: 'View file diff', icon: GitBranch, category: 'Git' },
  { name: '/worktree', description: 'Manage git worktrees', icon: GitFork, category: 'Git' },
  { name: '/branch', description: 'Manage session branches', icon: Layers, category: 'Git' },
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

  // Custom commands from .claude/commands/ with isCustom flag
  const customCommands: SlashCommand[] = (extraCommands || [])
    .filter(ec => !SLASH_COMMANDS.some(bc => bc.name === ec.name))
    .map(ec => ({ name: ec.name, description: ec.description, icon: FolderOpen, isCustom: true, category: 'Custom' }))

  const allCommands: SlashCommand[] = [...SLASH_COMMANDS, ...customCommands]

  const filtered = allCommands.filter(c =>
    !query || c.name.toLowerCase().includes(query.toLowerCase())
  )

  if (filtered.length === 0) return null

  // When searching: show flat filtered list (mixed built-in + custom)
  // When not searching: show two sections — built-in grouped by category, then custom
  const isFiltering = !!query

  // Build category groups for built-in commands
  const builtinFiltered = filtered.filter(c => !c.isCustom)
  const customFiltered = filtered.filter(c => c.isCustom)

  // Group built-in commands by category
  const builtinGroups: { label: string; commands: SlashCommand[] }[] = []
  if (!isFiltering) {
    const seen = new Set<string>()
    for (const cmd of builtinFiltered) {
      const cat = cmd.category || 'Other'
      if (!seen.has(cat)) {
        seen.add(cat)
        builtinGroups.push({ label: cat, commands: [] })
      }
      builtinGroups[builtinGroups.length - 1].commands.push(cmd)
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
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 16px 48px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        zIndex: 1001,
        marginBottom: 4,
        overflow: 'hidden',
      }}
    >
      <style>{`.slash-popup-scroll::-webkit-scrollbar { width: 4px; } .slash-popup-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }`}</style>

      {/* Top micro-label header */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-muted)',
        padding: '6px 12px 4px',
        borderBottom: '1px solid var(--border)',
      }}>
        Commands
      </div>

      <div className="slash-popup-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
        {isFiltering ? (
          /* Flat filtered list — mixed built-in and custom */
          filtered.map((cmd) => {
            flatIdx++
            return renderCommand(cmd, flatIdx, selectedIndex, onSelect, onHover, t)
          })
        ) : (
          /* Grouped display: built-in by category, then custom section */
          <>
            {/* Built-in commands grouped by category */}
            {builtinGroups.length > 0 && (
              <div>
                {builtinGroups.map((group) => (
                  <div key={group.label}>
                    <SectionDivider label={group.label} />
                    {group.commands.map((cmd) => {
                      flatIdx++
                      return renderCommand(cmd, flatIdx, selectedIndex, onSelect, onHover, t)
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* User custom commands section */}
            {customFiltered.length > 0 && (
              <div>
                <SectionDivider label="Custom Commands" />
                {customFiltered.map((cmd) => {
                  flatIdx++
                  return renderCommand(cmd, flatIdx, selectedIndex, onSelect, onHover, t)
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer keyboard hints */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderTop: '1px solid var(--border)',
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
              background: 'var(--border)',
              border: '1px solid var(--bg-active)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.6,
            }}>
              {key}
            </kbd>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Section divider with micro-label title */
function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px 3px',
    }}>
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 1,
        background: 'var(--border)',
      }} />
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
  const isCustom = cmd.isCustom

  return (
    <div
      key={cmd.name}
      onClick={() => onSelect(cmd)}
      onMouseEnter={(e) => {
        onHover(flatIdx)
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'
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
        background: isSelected
          ? (isCustom ? 'rgba(134,239,172,0.25)' : 'rgba(99,102,241,0.25)')
          : (isCustom ? 'rgba(134,239,172,0.12)' : 'rgba(99,102,241,0.15)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s ease',
      }}>
        <Icon size={13} style={{ color: isCustom ? (isSelected ? '#86efac' : '#6ee7b7') : (isSelected ? '#a5b4fc' : '#818cf8') }} />
      </div>

      {/* Name + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: isCustom ? '#86efac' : '#818cf8' }}>{slash}</span>
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: isSelected ? 'rgba(255,255,255,0.95)' : 'var(--text-primary)',
            transition: 'color 0.15s ease',
          }}>
            {cmdName}
          </span>
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {cmd.descriptionKey ? t(cmd.descriptionKey) : cmd.description}
        </div>
      </div>

      {/* Right-side badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* client-only badge */}
        {cmd.clientOnly && (
          <kbd style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
            color: 'var(--text-muted)',
            padding: '1px 5px',
            fontFamily: 'monospace',
          }}>
            client
          </kbd>
        )}
        {/* custom badge for user-defined commands */}
        {isCustom && (
          <kbd style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(134,239,172,0.07)',
            border: '1px solid rgba(134,239,172,0.18)',
            borderRadius: 5,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
            color: 'rgba(134,239,172,0.60)',
            padding: '1px 5px',
            fontFamily: 'monospace',
          }}>
            custom
          </kbd>
        )}
      </div>
    </div>
  )
}
