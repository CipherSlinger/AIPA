import React, { useState } from 'react'
import { PermissionMessage } from '../../types/app.types'
import {
  ShieldCheck, Check, X, ShieldPlus, ShieldOff,
  Terminal, FilePlus, FileEdit, FileSearch,
  FolderSearch, Search, Globe, GitBranch, Clock,
  ListTodo, MessageCircleQuestion, BookOpen, Layers, Wand2, Zap
} from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  message: PermissionMessage
  onAllow: () => void
  onDeny: () => void
  onAlwaysAllow?: () => void
  onAlwaysDeny?: () => void
}

// Map tool name to permission type badge: bash | file | network | other
function getPermissionType(toolName: string): 'bash' | 'file' | 'network' | 'other' {
  switch (toolName) {
    case 'Bash':
    case 'computer':
    case 'CronCreate':
    case 'CronDelete':
    case 'CronList':
    case 'Sleep':
    case 'EnterWorktree':
    case 'ExitWorktree':
    case 'EnterPlanMode':
    case 'ExitPlanMode':
    case 'TaskCreate':
    case 'TaskGet':
    case 'TaskList':
    case 'TaskUpdate':
    case 'TaskStop':
    case 'AskUserQuestion':
    case 'SkillTool':
    case 'ToolSearch':
      return 'bash'
    case 'ListMcpResources':
    case 'ReadMcpResource':
    case 'NotebookEdit':
      return 'file'
    case 'Write':
    case 'create_file':
    case 'Edit':
    case 'str_replace_editor':
    case 'MultiEdit':
    case 'Read':
    case 'read_file':
    case 'Glob':
    case 'LS':
    case 'Grep':
      return 'file'
    case 'WebFetch':
    case 'web_fetch':
    case 'WebSearch':
      return 'network'
    default:
      return 'other'
  }
}

const PERMISSION_TYPE_BADGE: Record<'bash' | 'file' | 'network' | 'other', { label: string; bg: string; color: string; border: string }> = {
  bash:    { label: 'bash',    bg: 'rgba(99,102,241,0.15)',  color: '#818cf8', border: 'rgba(99,102,241,0.30)' },
  file:    { label: 'file',    bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24', border: 'rgba(251,191,36,0.30)' },
  network: { label: 'network', bg: 'rgba(67,229,229,0.15)',  color: '#67e8f9', border: 'rgba(67,229,229,0.30)' },
  other:   { label: 'action',  bg: 'var(--border)', color: 'var(--text-secondary)', border: 'var(--border)' },
}

// Map tool names to lucide icons + tint colors
function getToolVisual(toolName: string): { icon: React.ReactNode; tint: string } {
  const size = 22
  switch (toolName) {
    case 'Bash':
    case 'computer':
      return { icon: <Terminal size={size} />, tint: 'rgba(78,201,176,0.15)' }
    case 'Write':
    case 'create_file':
      return { icon: <FilePlus size={size} />, tint: 'rgba(99,102,241,0.15)' }
    case 'Edit':
    case 'str_replace_editor':
    case 'MultiEdit':
      return { icon: <FileEdit size={size} />, tint: 'rgba(215,186,125,0.15)' }
    case 'Read':
    case 'read_file':
      return { icon: <FileSearch size={size} />, tint: 'rgba(133,133,133,0.15)' }
    case 'Glob':
    case 'LS':
      return { icon: <FolderSearch size={size} />, tint: 'rgba(133,133,133,0.15)' }
    case 'Grep':
      return { icon: <Search size={size} />, tint: 'rgba(133,133,133,0.15)' }
    case 'WebFetch':
    case 'web_fetch':
    case 'WebSearch':
      return { icon: <Globe size={size} />, tint: 'rgba(90,63,138,0.15)' }
    case 'EnterWorktree':
    case 'ExitWorktree':
      return { icon: <GitBranch size={size} />, tint: 'rgba(40,167,69,0.15)' }
    case 'TaskCreate':
    case 'TaskGet':
    case 'TaskList':
    case 'TaskUpdate':
    case 'TaskStop':
      return { icon: <ListTodo size={size} />, tint: 'rgba(251,191,36,0.15)' }
    case 'AskUserQuestion':
      return { icon: <MessageCircleQuestion size={size} />, tint: 'rgba(99,102,241,0.15)' }
    case 'NotebookEdit':
    case 'ListMcpResources':
    case 'ReadMcpResource':
      return { icon: <BookOpen size={size} />, tint: 'rgba(165,180,252,0.15)' }
    case 'EnterPlanMode':
    case 'ExitPlanMode':
      return { icon: <Layers size={size} />, tint: 'rgba(139,92,246,0.15)' }
    case 'SkillTool':
      return { icon: <Wand2 size={size} />, tint: 'rgba(236,72,153,0.15)' }
    case 'ToolSearch':
      return { icon: <Zap size={size} />, tint: 'rgba(251,191,36,0.15)' }
    case 'CronCreate':
    case 'CronDelete':
    case 'CronList':
    case 'Sleep':
      return { icon: <Clock size={size} />, tint: 'rgba(255,193,7,0.15)' }
    default:
      return { icon: <ShieldCheck size={size} />, tint: 'rgba(99,102,241,0.15)' }
  }
}

// Convert technical tool names and inputs into user-friendly descriptions
function describeAction(toolName: string, toolInput: Record<string, unknown>, t: (key: string, params?: Record<string, string>) => string): { title: string; detail: string } {
  switch (toolName) {
    case 'Bash':
    case 'computer': {
      const cmd = (toolInput.command as string) || (toolInput.cmd as string) || ''
      return {
        title: t('permission.toolRunCommand'),
        detail: cmd ? `\`${cmd.slice(0, 120)}${cmd.length > 120 ? '...' : ''}\`` : t('permission.toolRunCommandDetail'),
      }
    }
    case 'Write':
    case 'create_file': {
      const path = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return {
        title: t('permission.toolWriteFile'),
        detail: path || t('permission.toolWriteFileDetail'),
      }
    }
    case 'Edit':
    case 'str_replace_editor': {
      const path = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return {
        title: t('permission.toolEditFile'),
        detail: path || t('permission.toolEditFileDetail'),
      }
    }
    case 'MultiEdit': {
      const path = (toolInput.path as string) || ''
      return {
        title: t('permission.toolMultiEdit'),
        detail: path || t('permission.toolMultiEditDetail'),
      }
    }
    case 'Read':
    case 'read_file': {
      const path = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return {
        title: t('permission.toolReadFile'),
        detail: path || t('permission.toolReadFileDetail'),
      }
    }
    case 'Glob':
    case 'LS': {
      const pattern = (toolInput.pattern as string) || (toolInput.path as string) || ''
      return {
        title: t('permission.toolSearchFiles'),
        detail: pattern || t('permission.toolSearchFilesDetail'),
      }
    }
    case 'Grep': {
      const q = (toolInput.pattern as string) || ''
      return {
        title: t('permission.toolSearchContent'),
        detail: q ? `${t('common.search')} "${q.slice(0, 80)}"` : t('permission.toolSearchContentDetail'),
      }
    }
    case 'WebFetch':
    case 'web_fetch': {
      const url = (toolInput.url as string) || ''
      return {
        title: t('permission.toolWebFetch'),
        detail: url || t('permission.toolWebFetchDetail'),
      }
    }
    case 'WebSearch': {
      const q = (toolInput.query as string) || ''
      return {
        title: t('permission.toolWebSearch'),
        detail: q ? `${t('common.search')} "${q.slice(0, 80)}"` : t('permission.toolWebSearchDetail'),
      }
    }
    case 'EnterWorktree': {
      const name = (toolInput.name as string) || ''
      return { title: 'Enter git worktree', detail: name || 'Create isolated worktree environment' }
    }
    case 'ExitWorktree': {
      const action = (toolInput.action as string) || ''
      return { title: 'Exit git worktree', detail: action ? `Action: ${action}` : 'Exit worktree session' }
    }
    case 'CronCreate': {
      const cron = (toolInput.cron as string) || ''
      return { title: 'Schedule cron job', detail: cron || 'Create a scheduled task' }
    }
    case 'CronDelete': {
      const id = (toolInput.id as string) || ''
      return { title: 'Delete cron job', detail: id || 'Remove a scheduled task' }
    }
    case 'CronList':
      return { title: 'List cron jobs', detail: 'Show all scheduled tasks' }
    case 'Sleep': {
      const ms = toolInput.ms ?? toolInput.seconds
      return { title: 'Sleep / wait', detail: ms ? `Wait ${ms}${toolInput.seconds ? 's' : 'ms'}` : 'Pause execution' }
    }
    case 'TaskCreate':
      return { title: 'Create task', detail: (toolInput.title as string) || 'Create a new Todo task' }
    case 'TaskGet': {
      const id = (toolInput.id as string) || ''
      return { title: 'Get task details', detail: id || 'Read task details' }
    }
    case 'TaskList':
      return { title: 'List tasks', detail: 'List all current tasks' }
    case 'TaskUpdate': {
      const id = (toolInput.id as string) || ''
      return { title: 'Update task', detail: id ? `Update task: ${id}` : 'Update task status/content' }
    }
    case 'TaskStop': {
      const id = (toolInput.id as string) || ''
      return { title: 'Stop task', detail: id ? `Stop task: ${id}` : 'Stop a running task' }
    }
    case 'AskUserQuestion': {
      const q = (toolInput.question as string) || ''
      return { title: 'Ask user a question', detail: q ? `"${q.slice(0, 100)}"` : 'Waiting for user response' }
    }
    case 'NotebookEdit': {
      const cell = toolInput.cell_number ?? toolInput.cell_id ?? ''
      const path = (toolInput.notebook_path as string) || ''
      const cellStr = cell !== '' ? ` (cell ${cell})` : ''
      return { title: 'Edit Jupyter Notebook', detail: path ? `${path}${cellStr}` : `Edit notebook${cellStr}` }
    }
    case 'ListMcpResources':
      return { title: 'List MCP resources', detail: 'List available resources from MCP servers' }
    case 'ReadMcpResource': {
      const uri = (toolInput.uri as string) || ''
      return { title: 'Read MCP resource', detail: uri || 'Read MCP resource content' }
    }
    case 'EnterPlanMode':
      return { title: 'Enter plan mode', detail: 'Enter plan mode — execution requires confirmation' }
    case 'ExitPlanMode':
      return { title: 'Confirm & execute plan', detail: 'Confirm plan and begin execution' }
    case 'SkillTool': {
      const skill = (toolInput.skill_name as string) || (toolInput.skill as string) || ''
      return { title: 'Run skill', detail: skill ? `Skill: ${skill}` : 'Run a configured skill' }
    }
    case 'ToolSearch': {
      const q = (toolInput.query as string) || ''
      return { title: 'Search tools', detail: q ? `Search: "${q}"` : 'Search available tools' }
    }
    default: {
      return {
        title: t('permission.toolPerformAction'),
        detail: typeof toolName === 'string' ? toolName : JSON.stringify(toolName),
      }
    }
  }
}

// Extract suggestion rules from CLI-pushed permissionSuggestions array
function extractSuggestionRules(suggestions: unknown[]): { allow: string[]; deny: string[] } {
  const allow: string[] = []
  const deny: string[] = []
  for (const s of suggestions) {
    const sug = s as Record<string, unknown>
    if (sug.type !== 'addRules') continue
    const rules = Array.isArray(sug.rules) ? (sug.rules as string[]) : []
    if (sug.behavior === 'allow') allow.push(...rules)
    else if (sug.behavior === 'deny') deny.push(...rules)
  }
  return { allow, deny }
}

async function writeSuggestionRule(type: 'allow' | 'deny', rule: string): Promise<void> {
  try {
    const settings = await window.electronAPI.configReadCLISettings()
    const perms = (settings.permissions || {}) as { allow?: string[]; deny?: string[] }
    const list = Array.isArray(perms[type]) ? [...perms[type]!] : []
    if (!list.includes(rule)) list.push(rule)
    await window.electronAPI.configWriteCLISettings({ permissions: { ...perms, [type]: list } })
  } catch { /* ignore */ }
}

export default function PermissionCard({ message, onAllow, onDeny, onAlwaysAllow, onAlwaysDeny }: Props) {
  const t = useT()
  const isPending = message.decision === 'pending'
  // Defensive: toolName may arrive as a nested object from some CLI tool variants
  const toolNameStr = typeof message.toolName === 'string' ? message.toolName : String(message.toolName ?? '')
  const { title, detail } = describeAction(toolNameStr, message.toolInput, t)
  const { icon } = getToolVisual(toolNameStr)
  const permType = getPermissionType(toolNameStr)
  const typeBadge = PERMISSION_TYPE_BADGE[permType]
  const suggestions = message.permissionSuggestions || []
  const { allow: allowRules, deny: denyRules } = extractSuggestionRules(suggestions)

  // Checked state for suggestion rules — key: `allow:rule` or `deny:rule`
  const allRuleKeys = [
    ...allowRules.map(r => `allow:${r}`),
    ...denyRules.map(r => `deny:${r}`),
  ]
  const [checkedRules, setCheckedRules] = useState<Set<string>>(() => new Set(allRuleKeys))

  const toggleRule = (key: string) => {
    setCheckedRules(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const applyCheckedRules = async () => {
    const writes: Promise<void>[] = []
    for (const key of checkedRules) {
      const [type, ...rest] = key.split(':')
      const rule = rest.join(':')
      if (rule) writes.push(writeSuggestionRule(type as 'allow' | 'deny', rule))
    }
    await Promise.all(writes)
    onAlwaysAllow?.()
  }

  const hasSuggestions = allowRules.length > 0 || denyRules.length > 0

  // Derive state-based left border color
  const isDenied = message.decision === 'denied'
  const isAllowed = message.decision === 'allowed'
  const leftBorder = isDenied
    ? '3px solid rgba(239,68,68,0.5)'
    : isAllowed
      ? '3px solid rgba(34,197,94,0.5)'
      : '3px solid rgba(99,102,241,0.6)'

  return (
    <div
      className={isPending ? 'permission-card-pending' : 'permission-card-enter'}
      style={{
        margin: '8px auto',
        maxWidth: 420,
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderLeft: leftBorder,
        borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Header: Icon square + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.8), rgba(139,92,246,0.8))',
            boxShadow: '0 0 12px rgba(99,102,241,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: 'rgba(255,255,255,0.95)',
            opacity: isPending ? 1 : 0.7,
            transition: 'opacity 0.15s ease',
          }}
        >
          {icon}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {title}
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              background: typeBadge.bg,
              color: typeBadge.color,
              border: `1px solid ${typeBadge.border}`,
              borderRadius: 20,
              padding: '1px 6px',
              flexShrink: 0,
            }}>
              {typeBadge.label}
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('permission.requiresPermission')}
          </span>
        </div>
      </div>

      {/* Detail block */}
      {detail && (
        <div
          style={{
            fontSize: 11,
            color: 'rgba(165,180,252,0.9)',
            background: 'var(--code-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 10px',
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
          }}
        >
          {detail}
        </div>
      )}

      {/* Actions or result */}
      {isPending ? (
        <>
          {/* Primary actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onAllow}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)'
                e.currentTarget.style.filter = 'brightness(1.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.filter = 'brightness(1)'
              }}
              style={{
                flex: 1,
                background: 'linear-gradient(135deg, rgba(34,197,94,0.70), rgba(16,185,129,0.70))',
                border: 'none',
                borderRadius: 7,
                padding: '0',
                height: 36,
                color: 'rgba(255,255,255,0.95)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                transition: 'all 0.15s ease',
              }}
            >
              <Check size={14} /> {t('permission.allow')}
            </button>
            <button
              onClick={onDeny}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.18)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
              }}
              style={{
                flex: 1,
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 7,
                padding: '0',
                height: 36,
                color: '#fca5a5',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <X size={14} /> {t('permission.deny')}
            </button>
          </div>

          {/* Secondary actions: Always Allow / Always Deny */}
          {(onAlwaysAllow || onAlwaysDeny) && (
            <div style={{
              display: 'flex', gap: 8,
              borderTop: '1px solid var(--border)', paddingTop: 8,
            }}>
              {onAlwaysAllow && (
                <button
                  onClick={onAlwaysAllow}
                  aria-label={t('permission.alwaysAllowTool')}
                  style={{
                    flex: 1,
                    background: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.3)',
                    borderRadius: 6,
                    padding: '4px 0',
                    color: '#4ade80',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.22)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.12)' }}
                >
                  <ShieldPlus size={12} /> {t('permission.alwaysAllowTool')}
                </button>
              )}
              {onAlwaysDeny && (
                <button
                  onClick={onAlwaysDeny}
                  aria-label={t('permission.alwaysDenyTool')}
                  style={{
                    flex: 1,
                    background: 'rgba(239,68,68,0.18)',
                    border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: 6,
                    padding: '4px 0',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.28)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)' }}
                >
                  <ShieldOff size={12} /> {t('permission.alwaysDenyTool')}
                </button>
              )}
            </div>
          )}

          {/* Suggested permanent rules from CLI */}
          {hasSuggestions && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              borderTop: '1px solid var(--bg-hover)', paddingTop: 10,
            }}>
              {/* Section micro-label */}
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 2,
              }}>
                建议的永久规则 <span style={{ opacity: 0.6 }}>SUGGESTED RULES</span>
              </div>

              {/* Allow rule rows */}
              {allowRules.map(rule => {
                const key = `allow:${rule}`
                const checked = checkedRules.has(key)
                return (
                  <div
                    key={key}
                    onClick={() => toggleRule(key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 8px',
                      borderRadius: 6,
                      background: 'rgba(34,197,94,0.06)',
                      border: '1px solid rgba(34,197,94,0.15)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.12)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.06)' }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      background: checked ? 'rgba(99,102,241,0.85)' : 'var(--border)',
                      border: checked ? '1px solid rgba(99,102,241,0.40)' : '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s ease',
                    }}>
                      {checked && <Check size={9} color="rgba(255,255,255,0.95)" />}
                    </div>
                    <ShieldPlus size={11} color="#4ade80" style={{ flexShrink: 0 }} />
                    <span style={{
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {rule}
                    </span>
                    <span style={{ fontSize: 9, color: '#4ade80', fontWeight: 600, flexShrink: 0 }}>allow</span>
                  </div>
                )
              })}

              {/* Deny rule rows */}
              {denyRules.map(rule => {
                const key = `deny:${rule}`
                const checked = checkedRules.has(key)
                return (
                  <div
                    key={key}
                    onClick={() => toggleRule(key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 8px',
                      borderRadius: 6,
                      background: 'rgba(239,68,68,0.06)',
                      border: '1px solid rgba(239,68,68,0.18)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      background: checked ? 'rgba(99,102,241,0.85)' : 'var(--border)',
                      border: checked ? '1px solid rgba(99,102,241,0.40)' : '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s ease',
                    }}>
                      {checked && <Check size={9} color="rgba(255,255,255,0.95)" />}
                    </div>
                    <ShieldOff size={11} color="#fca5a5" style={{ flexShrink: 0 }} />
                    <span style={{
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {rule}
                    </span>
                    <span style={{ fontSize: 9, color: '#fca5a5', fontWeight: 600, flexShrink: 0 }}>deny</span>
                  </div>
                )
              })}

              {/* Apply CTA */}
              <button
                onClick={applyCheckedRules}
                disabled={checkedRules.size === 0}
                style={{
                  marginTop: 2,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                  border: 'none',
                  borderRadius: 7,
                  padding: '6px 0',
                  color: 'rgba(255,255,255,0.95)',
                  cursor: checkedRules.size === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  transition: 'all 0.15s ease',
                  opacity: checkedRules.size === 0 ? 0.4 : 1,
                  boxShadow: checkedRules.size > 0 ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
                }}
                onMouseEnter={e => {
                  if (checkedRules.size > 0) e.currentTarget.style.filter = 'brightness(1.1)'
                }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
              >
                <ShieldPlus size={12} />
                添加选中规则 ({checkedRules.size})
              </button>
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
          }}
        >
          {message.decision === 'allowed' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(34,197,94,0.15)',
                color: '#4ade80',
                borderRadius: 12,
                padding: '3px 10px',
                fontWeight: 600,
              }}
            >
              <Check size={12} /> {t('permission.allowed')}
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(239,68,68,0.15)',
                color: '#fca5a5',
                borderRadius: 12,
                padding: '3px 10px',
                fontWeight: 600,
              }}
            >
              <X size={12} /> {t('permission.denied')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
