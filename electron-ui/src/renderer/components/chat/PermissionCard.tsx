import React from 'react'
import { PermissionMessage } from '../../types/app.types'
import {
  ShieldCheck, Check, X, ShieldPlus, ShieldOff,
  Terminal, FilePlus, FileEdit, FileSearch,
  FolderSearch, Search, Globe, GitBranch, Clock
} from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  message: PermissionMessage
  onAllow: () => void
  onDeny: () => void
  onAlwaysAllow?: () => void
  onAlwaysDeny?: () => void
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
      return { icon: <FilePlus size={size} />, tint: 'rgba(0,122,204,0.15)' }
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
    case 'CronCreate':
    case 'CronDelete':
    case 'CronList':
    case 'Sleep':
      return { icon: <Clock size={size} />, tint: 'rgba(255,193,7,0.15)' }
    default:
      return { icon: <ShieldCheck size={size} />, tint: 'rgba(0,122,204,0.15)' }
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
    default: {
      return {
        title: t('permission.toolPerformAction'),
        detail: toolName,
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
  const { title, detail } = describeAction(message.toolName, message.toolInput, t)
  const { icon, tint } = getToolVisual(message.toolName)
  const suggestions = message.permissionSuggestions || []
  const { allow: allowRules, deny: denyRules } = extractSuggestionRules(suggestions)

  return (
    <div
      className={isPending ? 'permission-card-pending' : 'permission-card-enter'}
      style={{
        margin: '8px auto',
        maxWidth: 420,
        border: `${isPending ? '2px' : '1px'} solid ${isPending ? 'var(--accent)' : 'var(--card-border)'}`,
        borderRadius: 12,
        background: 'var(--card-bg)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Header: Icon circle + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: tint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: isPending ? 'var(--text-primary)' : 'var(--text-muted)',
            opacity: isPending ? 1 : 0.6,
            transition: 'opacity 0.2s ease',
          }}
        >
          {icon}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {title}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('permission.requiresPermission')}
          </span>
        </div>
      </div>

      {/* Detail block */}
      {detail && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            background: 'var(--action-btn-bg)',
            borderRadius: 6,
            padding: '8px 12px',
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
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 8,
                padding: '0',
                height: 36,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'transform 0.15s ease, filter 0.15s ease',
              }}
            >
              <Check size={14} /> {t('permission.allow')}
            </button>
            <button
              onClick={onDeny}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--popup-item-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
              style={{
                flex: 1,
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0',
                height: 36,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'background 0.15s ease',
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
                    background: 'none',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 0',
                    color: 'var(--success)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    opacity: 0.8,
                    transition: 'opacity 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
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
                    background: 'none',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 0',
                    color: 'var(--error)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    opacity: 0.8,
                    transition: 'opacity 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
                >
                  <ShieldOff size={12} /> {t('permission.alwaysDenyTool')}
                </button>
              )}
            </div>
          )}

          {/* Suggestion rule buttons from CLI */}
          {(allowRules.length > 0 || denyRules.length > 0) && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              borderTop: '1px solid var(--border)', paddingTop: 8,
            }}>
              {allowRules.slice(0, 2).map((rule) => (
                <button
                  key={`allow-${rule}`}
                  onClick={() => { writeSuggestionRule('allow', rule); onAllow() }}
                  style={{
                    background: 'rgba(78,201,176,0.08)',
                    border: '1px solid rgba(78,201,176,0.3)',
                    borderRadius: 6,
                    padding: '5px 10px',
                    color: 'var(--success)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    textAlign: 'left',
                  }}
                >
                  <ShieldPlus size={11} />
                  Always Allow ({rule})
                </button>
              ))}
              {denyRules.slice(0, 1).map((rule) => (
                <button
                  key={`deny-${rule}`}
                  onClick={() => { writeSuggestionRule('deny', rule); onDeny() }}
                  style={{
                    background: 'rgba(244,71,71,0.08)',
                    border: '1px solid rgba(244,71,71,0.3)',
                    borderRadius: 6,
                    padding: '5px 10px',
                    color: 'var(--error)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    textAlign: 'left',
                  }}
                >
                  <ShieldOff size={11} />
                  Always Deny ({rule})
                </button>
              ))}
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
                background: 'rgba(78,201,176,0.15)',
                color: 'var(--success)',
                borderRadius: 12,
                padding: '3px 10px',
                fontWeight: 500,
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
                background: 'rgba(244,71,71,0.15)',
                color: 'var(--error)',
                borderRadius: 12,
                padding: '3px 10px',
                fontWeight: 500,
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
