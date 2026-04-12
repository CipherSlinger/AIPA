/**
 * ToolApprovalDialog — floating modal overlay that surfaces tool permission
 * requests when permissionMode is not 'bypassPermissions' or 'dontAsk'.
 *
 * The CLI sends a `control_request/can_use_tool` event through stream-JSON
 * mode (via `--permission-prompt-tool stdio`). The AIPA stream-bridge emits
 * this as `permissionRequest`, which is forwarded by the IPC layer as
 * `cli:permissionRequest` and stored as a PermissionMessage in chatStore.
 *
 * This dialog watches the message list for a 'pending' PermissionMessage and
 * renders a blocking overlay so the user never has to scroll to find it.
 * Once the user decides, it calls respondPermission and the inline
 * PermissionCard in the message list updates to reflect the decision.
 */
import React, { useCallback } from 'react'
import {
  ShieldCheck, Check, X,
  Terminal, FilePlus, FileEdit, FileSearch,
  FolderSearch, Search, Globe, GitBranch, Clock,
  ListTodo, MessageCircleQuestion, BookOpen, Layers, Wand2, Zap,
} from 'lucide-react'
import { useChatStore, usePrefsStore } from '../../store'
import { PermissionMessage } from '../../types/app.types'

// ── Helpers (shared subset of PermissionCard's logic) ──────────────────────

function getToolIcon(toolName: string): React.ReactNode {
  const size = 24
  switch (toolName) {
    case 'Bash': case 'computer':       return <Terminal size={size} />
    case 'Write': case 'create_file':   return <FilePlus size={size} />
    case 'Edit': case 'str_replace_editor': case 'MultiEdit': return <FileEdit size={size} />
    case 'Read': case 'read_file':      return <FileSearch size={size} />
    case 'Glob': case 'LS':             return <FolderSearch size={size} />
    case 'Grep':                        return <Search size={size} />
    case 'WebFetch': case 'web_fetch': case 'WebSearch': return <Globe size={size} />
    case 'EnterWorktree': case 'ExitWorktree': return <GitBranch size={size} />
    case 'CronCreate': case 'CronDelete': case 'CronList': case 'Sleep': return <Clock size={size} />
    case 'TaskCreate': case 'TaskGet': case 'TaskList': case 'TaskUpdate': case 'TaskStop': return <ListTodo size={size} />
    case 'AskUserQuestion':             return <MessageCircleQuestion size={size} />
    case 'NotebookEdit': case 'ListMcpResources': case 'ReadMcpResource': return <BookOpen size={size} />
    case 'EnterPlanMode': case 'ExitPlanMode': return <Layers size={size} />
    case 'SkillTool':                   return <Wand2 size={size} />
    case 'ToolSearch':                  return <Zap size={size} />
    default:                            return <ShieldCheck size={size} />
  }
}

function getToolTint(toolName: string): string {
  switch (toolName) {
    case 'Bash': case 'computer':       return 'rgba(78,201,176,0.20)'
    case 'Write': case 'create_file':   return 'rgba(99,102,241,0.20)'
    case 'Edit': case 'str_replace_editor': case 'MultiEdit': return 'rgba(215,186,125,0.20)'
    case 'WebFetch': case 'web_fetch': case 'WebSearch': return 'rgba(90,63,138,0.20)'
    case 'EnterWorktree': case 'ExitWorktree': return 'rgba(40,167,69,0.20)'
    default:                            return 'rgba(99,102,241,0.20)'
  }
}

function getToolLabel(toolName: string, toolInput: Record<string, unknown>): { title: string; detail: string } {
  switch (toolName) {
    case 'Bash': case 'computer': {
      const cmd = (toolInput.command as string) || (toolInput.cmd as string) || ''
      return { title: 'Run shell command', detail: cmd.slice(0, 200) || 'Execute a shell command' }
    }
    case 'Write': case 'create_file': {
      const p = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return { title: 'Write file', detail: p || 'Create or overwrite a file' }
    }
    case 'Edit': case 'str_replace_editor': case 'MultiEdit': {
      const p = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return { title: 'Edit file', detail: p || 'Modify an existing file' }
    }
    case 'Read': case 'read_file': {
      const p = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return { title: 'Read file', detail: p || 'Read file contents' }
    }
    case 'WebFetch': case 'web_fetch': {
      const url = (toolInput.url as string) || ''
      return { title: 'Fetch URL', detail: url || 'Fetch web content' }
    }
    case 'WebSearch': {
      const q = (toolInput.query as string) || ''
      return { title: 'Web search', detail: q ? `"${q.slice(0, 100)}"` : 'Search the web' }
    }
    case 'Grep': {
      const q = (toolInput.pattern as string) || ''
      return { title: 'Search content', detail: q ? `Pattern: "${q.slice(0, 80)}"` : 'Search file contents' }
    }
    case 'Glob': case 'LS': {
      const p = (toolInput.pattern as string) || (toolInput.path as string) || ''
      return { title: 'List / search files', detail: p || 'Browse directory contents' }
    }
    default:
      return { title: `Use tool: ${toolName}`, detail: JSON.stringify(toolInput).slice(0, 120) }
  }
}

// Build a compact params preview (key=value pairs, max 3 lines)
function buildParamsPreview(toolInput: Record<string, unknown>): string {
  const entries = Object.entries(toolInput)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .slice(0, 4)
  if (entries.length === 0) return ''
  return entries
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v)
      const truncated = val.length > 80 ? val.slice(0, 80) + '…' : val
      return `${k}: ${truncated}`
    })
    .join('\n')
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  onRespond: (permissionId: string, allowed: boolean) => void
}

export default function ToolApprovalDialog({ onRespond }: Props) {
  const prefs = usePrefsStore(s => s.prefs)
  const messages = useChatStore(s => s.messages)

  // Find the first pending permission message
  const pending = messages.find(
    m => m.role === 'permission' && (m as PermissionMessage).decision === 'pending'
  ) as PermissionMessage | undefined

  // Only show dialog when permissionMode is NOT 'bypassPermissions' or 'dontAsk'
  // (those modes auto-handle without user interaction)
  const mode = prefs.permissionMode || 'default'
  const shouldShow = pending !== undefined && mode !== 'bypassPermissions' && mode !== 'dontAsk'

  const handleAllow = useCallback(() => {
    if (pending) onRespond(pending.permissionId, true)
  }, [pending, onRespond])

  const handleDeny = useCallback(() => {
    if (pending) onRespond(pending.permissionId, false)
  }, [pending, onRespond])

  if (!shouldShow || !pending) return null

  const toolName = typeof pending.toolName === 'string' ? pending.toolName : String(pending.toolName ?? '')
  const { title, detail } = getToolLabel(toolName, pending.toolInput)
  const icon = getToolIcon(toolName)
  const tint = getToolTint(toolName)
  const paramsPreview = buildParamsPreview(pending.toolInput)

  return (
    // Full-screen backdrop
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.70)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
      // Deny on backdrop click as a safety default
      onClick={handleDeny}
    >
      {/* Dialog card */}
      <div
        style={{
          background: 'rgba(15,15,25,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
          maxWidth: 480,
          width: '100%',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
        // Stop backdrop-click from firing when user clicks inside the card
        onClick={e => e.stopPropagation()}
      >
        {/* Header row: icon + title + badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: tint,
              border: '1px solid rgba(255,255,255,0.09)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.85)',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.82)',
                lineHeight: 1.3,
              }}>
                {title}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                background: 'rgba(99,102,241,0.15)',
                color: '#818cf8',
                border: '1px solid rgba(99,102,241,0.30)',
                borderRadius: 20,
                padding: '1px 7px',
                flexShrink: 0,
              }}>
                {mode}
              </span>
            </div>
            <div style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.45)',
              marginTop: 3,
              lineHeight: 1.4,
            }}>
              Claude wants to use a tool — please confirm
            </div>
          </div>
        </div>

        {/* Tool name row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 8,
          padding: '8px 12px',
        }}>
          <ShieldCheck size={14} color="rgba(165,180,252,0.80)" style={{ flexShrink: 0 }} />
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(165,180,252,0.90)',
            fontFamily: 'monospace',
          }}>
            {toolName}
          </span>
        </div>

        {/* Detail / file path */}
        {detail && (
          <div style={{
            fontSize: 12,
            color: 'rgba(165,180,252,0.85)',
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 8,
            padding: '8px 12px',
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
          }}>
            {detail}
          </div>
        )}

        {/* Params preview (if different from detail) */}
        {paramsPreview && paramsPreview !== detail && (
          <div>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.35)',
              marginBottom: 6,
            }}>
              Parameters
            </div>
            <pre style={{
              margin: 0,
              fontSize: 11,
              color: 'rgba(255,255,255,0.60)',
              background: 'rgba(0,0,0,0.30)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8,
              padding: '8px 12px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              lineHeight: 1.6,
              maxHeight: 100,
              overflowY: 'auto',
            }}>
              {paramsPreview}
            </pre>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {/* Allow */}
          <button
            onClick={handleAllow}
            onMouseEnter={e => {
              e.currentTarget.style.filter = 'brightness(1.12)'
              e.currentTarget.style.transform = 'scale(1.02)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.filter = 'brightness(1)'
              e.currentTarget.style.transform = 'scale(1)'
            }}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, rgba(34,197,94,0.88), rgba(16,185,129,0.88))',
              border: 'none',
              borderRadius: 8,
              padding: '0',
              height: 40,
              color: 'rgba(255,255,255,0.95)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              boxShadow: '0 2px 12px rgba(34,197,94,0.35)',
              transition: 'all 0.15s ease',
            }}
          >
            <Check size={15} /> Allow
          </button>

          {/* Deny */}
          <button
            onClick={handleDeny}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
            style={{
              flex: 1,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 8,
              padding: '0',
              height: 40,
              color: 'rgba(239,68,68,0.80)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              transition: 'all 0.15s ease',
            }}
          >
            <X size={15} /> Deny
          </button>
        </div>

        {/* Keyboard hint */}
        <div style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.28)',
          textAlign: 'center',
          marginTop: -6,
        }}>
          Click outside to deny
        </div>
      </div>
    </div>
  )
}
