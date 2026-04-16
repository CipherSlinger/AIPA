import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { ToolUseInfo } from '../../types/app.types'
import { ChevronDown, Terminal, FileEdit, Search, Globe, Loader2, Check, X, Timer, ClipboardCopy, FileCode, FileText, Image, Palette, GitBranch, GitMerge, Clock, StopCircle, BookOpen, Network, Code2, CheckSquare, ClipboardList, Settings2, Send, Users, Compass, CheckCircle2, Layers, Database, FileInput, HelpCircle } from 'lucide-react'
import { useT } from '../../i18n'
import DiffView from './DiffView'
import FileDiffView from './FileDiffView'
import { generateToolSummary } from '../../utils/toolSummary'
import LSPResultCard, { parseLSPOutput } from './LSPResultCard'
import TodoListView from './TodoListView'
import AgentToolCard, { AgentToolCardProps } from './AgentToolCard'
import TaskDashboardCard, { TaskItem } from './TaskDashboardCard'
import { McpResourceListCard, McpResourceReadCard, parseMcpResourceList } from './tool-cards/McpResourceCard'
import { SendMessageCard } from './tool-cards/SendMessageCard'
import { RemoteTriggerInputCard, RemoteTriggerResultCard, RemoteTriggerAction } from './tool-cards/RemoteTriggerCard'
import { WebBrowserInputCard, WebBrowserResultCard } from './tool-cards/WebBrowserToolCard'
import { CronCard } from './tool-cards/CronToolCard'
import { BashCommandBlock, BashOutputBlock, BashStatusDot, BASH_TOOLS } from './tool-cards/BashToolCard'
import { SearchResultSummary, WebResultBlock } from './tool-cards/SearchResultCard'
import { NotebookEditCard } from './tool-cards/NotebookEditCard'

interface Props {
  tool: ToolUseInfo
  onAbort?: () => void
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  Bash: Terminal,
  computer: Terminal,
  Write: FileEdit,
  Edit: FileEdit,
  Read: FileEdit,
  str_replace_editor: FileEdit,
  str_replace_based_edit_tool: FileEdit,
  create_file: FileEdit,
  read_file: FileEdit,
  Glob: Search,
  LS: Search,
  Grep: Search,
  WebFetch: Globe,
  WebSearch: Globe,
  web_fetch: Globe,
  // Browser automation
  WebBrowserTool: Globe,
  web_browser: Globe,
  browser: Globe,
  // PowerShell (Windows shell — reuses Terminal icon)
  PowerShell: Terminal,
  // Worktree
  EnterWorktree: GitBranch,
  ExitWorktree: GitMerge,
  // Scheduling / time
  CronCreate: Clock,
  CronDelete: Clock,
  CronList: Clock,
  Sleep: Clock,
  // Task management
  TaskCreate: FileText,
  TaskGet: FileText,
  TaskList: FileText,
  TaskUpdate: FileText,
  TaskStop: StopCircle,
  // Notebooks
  NotebookEdit: BookOpen,
  // User interaction
  AskUserQuestion: HelpCircle,
  Brief: FileText,
  // MCP resource tools
  ListMcpResources: Database,
  ReadMcpResource: FileInput,
  // Agent / workflow
  Agent: Network,
  Workflow: Network,
  // LSP code intelligence
  LSP: Code2,
  // Todo tools
  TodoWrite: CheckSquare,
  TodoRead: ClipboardList,
  // Skill & search
  Skill: Layers,
  ToolSearch: Search,
  // Config
  Config: Settings2,
  // Messaging
  SendMessage: Send,
  // Peer listing
  ListPeers: Users,
  // Plan mode
  EnterPlanMode: Compass,
  ExitPlanMode: CheckCircle2,
  // Multi-edit
  MultiEdit: Layers,
  // Remote trigger
  RemoteTrigger: Send,
}

// File extension to icon mapping for more specific file type icons (Iteration 462)
const FILE_EXT_ICONS: Record<string, React.ElementType> = {
  '.ts': FileCode, '.tsx': FileCode, '.js': FileCode, '.jsx': FileCode,
  '.py': FileCode, '.go': FileCode, '.rs': FileCode, '.java': FileCode,
  '.c': FileCode, '.cpp': FileCode, '.h': FileCode, '.hpp': FileCode,
  '.rb': FileCode, '.php': FileCode, '.swift': FileCode,
  '.md': FileText, '.txt': FileText, '.json': FileText, '.yaml': FileText,
  '.yml': FileText, '.toml': FileText, '.xml': FileText, '.csv': FileText,
  '.png': Image, '.jpg': Image, '.jpeg': Image, '.gif': Image,
  '.svg': Image, '.webp': Image, '.ico': Image, '.bmp': Image,
  '.css': Palette, '.scss': Palette, '.less': Palette, '.sass': Palette,
  '.html': Globe, '.htm': Globe,
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'])

/** Extract file path from tool input */
function extractFilePath(input: Record<string, unknown>): string | null {
  const path = input.file_path || input.path || input.filePath
  if (typeof path === 'string') return path
  // Try to extract from command string (Bash)
  if (typeof input.command === 'string') {
    const match = input.command.match(/(?:cat|less|head|tail|vim|nano|code)\s+["']?([^\s"']+)/)
    if (match) return match[1]
  }
  return null
}

/** Get file extension from path */
function getFileExt(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return ''
  return path.slice(dot).toLowerCase()
}

/** Get the appropriate icon for a tool based on its file input */
function getToolIcon(tool: ToolUseInfo): React.ElementType {
  const filePath = extractFilePath(tool.input || {})
  if (filePath) {
    const ext = getFileExt(filePath)
    if (ext && FILE_EXT_ICONS[ext]) return FILE_EXT_ICONS[ext]
  }
  return TOOL_ICONS[tool.name] || Terminal
}

/** Extract image paths from tool input/result */
function extractImagePaths(tool: ToolUseInfo): string[] {
  const paths: string[] = []
  const filePath = extractFilePath(tool.input || {})
  if (filePath) {
    const ext = getFileExt(filePath)
    if (IMAGE_EXTENSIONS.has(ext)) paths.push(filePath)
  }
  return paths.slice(0, 4) // Max 4 images
}

const FILE_EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'str_replace_editor', 'str_replace_based_edit_tool'])
// CLI snake_case variants (file_edit / file_write / file_create from stream-json)
const FILE_CLI_EDIT_TOOLS = new Set(['file_edit'])
const FILE_CLI_WRITE_TOOLS = new Set(['file_write', 'file_create'])

// File path highlight tools
const FILE_PATH_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'read_file', 'create_file'])

// Glob/Grep result summary tools
const SEARCH_RESULT_TOOLS = new Set(['Glob', 'Grep'])

// Web result tools (URL linking + truncated summary)
const WEB_RESULT_TOOLS = new Set(['WebSearch', 'WebFetch', 'web_fetch'])

// Browser automation tools
const BROWSER_TOOLS = new Set(['WebBrowserTool', 'web_browser', 'browser'])

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

const FILE_WRITE_TOOLS = new Set(['Write', 'create_file'])

// Task management tools (isTodoV2Enabled feature gate)
const TASK_CREATE_TOOLS = new Set(['TaskCreate', 'task_create'])
const TASK_UPDATE_TOOLS = new Set(['TaskUpdate', 'task_update'])
const TASK_LIST_TOOLS = new Set(['TaskList', 'task_list'])
const TASK_GET_TOOLS = new Set(['TaskGet', 'task_get'])


/** Safely parse a JSON string, returning null on failure */
function safeParseJSON(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

/** Parse tool result text into an array of TaskItem, or null if not parseable */
function parseTaskItems(resultText: string): TaskItem[] | null {
  const parsed = safeParseJSON(resultText)
  if (Array.isArray(parsed)) {
    const items = parsed.filter(
      (x): x is TaskItem =>
        x !== null &&
        typeof x === 'object' &&
        typeof (x as Record<string, unknown>).id === 'string' &&
        typeof (x as Record<string, unknown>).subject === 'string'
    )
    return items.length > 0 ? items : null
  }
  if (parsed !== null && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    if (typeof obj.id === 'string' && typeof obj.subject === 'string') {
      return [obj as unknown as TaskItem]
    }
  }
  return null
}


// Tool card components extracted to ./tool-cards/ sub-modules

/** Small copy button for tool output */
function CopyOutputBtn({ text, t }: { text: string; t: (key: string) => string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [text])

  return (
    <button
      onClick={handleCopy}
      title={t('message.copyCode')}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '1px 4px',
        borderRadius: 6,
        color: copied ? '#4ade80' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 9,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#6366f1' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={10} /> : <ClipboardCopy size={10} />}
      {copied ? t('message.codeCopied') : t('message.copyCode')}
    </button>
  )
}

/** Render file path with directory dimmed and filename bold */
function FilePathHighlight({ filePath }: { filePath: string }) {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : ''
  const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized

  return (
    <span style={{
      fontFamily: 'monospace',
      fontSize: 12,
      color: 'rgba(165,180,252,0.82)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      maxWidth: 280,
      display: 'inline-block',
      verticalAlign: 'middle',
    }}>
      {dir && (
        <span style={{ fontWeight: 400, opacity: 0.65 }}>{dir}</span>
      )}
      <span style={{ fontWeight: 600 }}>{fileName}</span>
    </span>
  )
}

// ── AskUserQuestionCard ────────────────────────────────────────────────────────

interface AskUserQuestionCardProps {
  question: string
  options?: string[]
  isAnswered: boolean
  answer?: string
}

function AskUserQuestionCard({ question, options, isAnswered, answer }: AskUserQuestionCardProps) {
  const t = useT()
  const [selected, setSelected] = useState<string | null>(null)
  const [customText, setCustomText] = useState('')
  const [sent, setSent] = useState(false)

  const sendReply = (text: string) => {
    if (!text.trim() || sent) return
    setSent(true)
    window.dispatchEvent(new CustomEvent('aipa:sendMessage', { detail: { text } }))
  }

  // If the tool has already been answered (result exists), show the answered state
  if (isAnswered && answer) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid rgba(99,102,241,0.60)',
        borderRadius: 10,
        marginBottom: 6,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <HelpCircle size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
              {question}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <Check size={11} style={{ color: '#4ade80', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{answer}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(99,102,241,0.30)',
      borderLeft: '3px solid rgba(99,102,241,0.60)',
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Question label + text */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <HelpCircle size={15} style={{ color: '#818cf8', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {question}
          </span>
        </div>

        {/* Option buttons (if provided) */}
        {options && options.length > 0 && !sent && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 23 }}>
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={() => { setSelected(opt); sendReply(opt) }}
                disabled={sent}
                style={{
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: 8,
                  border: `1px solid ${selected === opt ? 'rgba(99,102,241,0.60)' : 'rgba(99,102,241,0.30)'}`,
                  background: selected === opt ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.10)',
                  color: 'rgba(165,180,252,0.90)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.22)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)' }}
                onMouseLeave={(e) => {
                  if (selected !== opt) {
                    e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)'
                  }
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Custom text input (always shown when no options, or as fallback) */}
        {!sent && (
          <div style={{ display: 'flex', gap: 6, paddingLeft: options && options.length > 0 ? 23 : 0, alignItems: 'flex-end' }}>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendReply(customText) } }}
              placeholder={options && options.length > 0 ? t('askUser.customReply') : t('askUser.typeReply')}
              style={{
                flex: 1,
                fontSize: 12,
                padding: '6px 10px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            <button
              onClick={() => sendReply(customText)}
              disabled={!customText.trim()}
              style={{
                fontSize: 12,
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: customText.trim() ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))' : 'rgba(99,102,241,0.25)',
                color: 'rgba(255,255,255,0.95)',
                cursor: customText.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
            >
              {t('askUser.send')}
            </button>
          </div>
        )}

        {/* Sent indicator */}
        {sent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#4ade80', paddingLeft: 23 }}>
            <Check size={11} />
            {t('askUser.sent')}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ToolUseBlock ──────────────────────────────────────────────────────────

export default function ToolUseBlock({ tool, onAbort }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [finalDuration, setFinalDuration] = useState<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const userToggledRef = useRef(false)

  const isRunning = tool.status === 'running'

  // Auto-expand when tool starts running, auto-collapse when done
  // Respects manual user toggle: if user collapsed a running tool, don't re-expand
  useEffect(() => {
    if (isRunning && !userToggledRef.current) {
      setExpanded(true)
    } else if (!isRunning && !userToggledRef.current) {
      setExpanded(false)
    }
    // Reset user toggle tracking when tool status changes
    if (!isRunning) {
      userToggledRef.current = false
    }
  }, [isRunning])

  // Start elapsed timer when tool begins running, capture final duration when done
  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now()
      setElapsed(0)
      setFinalDuration(null)
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      // Capture final duration when transitioning from running to done/error
      if (startTimeRef.current && elapsed > 0) {
        setFinalDuration(elapsed)
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning])

  const Icon = getToolIcon(tool)
  const summaryLabel = generateToolSummary(tool, t)
  const isBash = BASH_TOOLS.has(tool.name)
  const isFileEdit = FILE_EDIT_TOOLS.has(tool.name)
  const isFilePath = FILE_PATH_TOOLS.has(tool.name)
  const isSearchResult = SEARCH_RESULT_TOOLS.has(tool.name)
  const isWebResult = WEB_RESULT_TOOLS.has(tool.name)
  const showElapsed = isRunning && elapsed >= 2
  const showFinalDuration = !isRunning && finalDuration !== null && finalDuration >= 1
  const imagePaths = !isRunning ? extractImagePaths(tool) : []
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const statusIcon = isRunning
    ? <Loader2 size={11} className="animate-spin" style={{ color: '#818cf8' }} />
    : tool.status === 'done'
    ? <Check size={11} style={{ color: '#4ade80' }} />
    : <X size={11} style={{ color: '#f87171' }} />

  const resultText = typeof tool.result === 'string'
    ? tool.result
    : tool.result != null ? JSON.stringify(tool.result, null, 2) : ''

  // Dynamic left border accent by status
  const leftBorderColor = isRunning
    ? 'rgba(99,102,241,0.60)'
    : tool.status === 'done'
    ? 'rgba(34,197,94,0.50)'
    : 'rgba(239,68,68,0.50)'

  // File path for path-highlight tools
  const highlightFilePath = isFilePath ? extractFilePath(tool.input || {}) : null

  // Bash command string
  const bashCommand = isBash && typeof tool.input?.command === 'string' ? tool.input.command : null

  // Agent tool: delegate to specialized card
  if (tool.name === 'Agent' || tool.name === 'agent') {
    const agentResult = typeof tool.result === 'string'
      ? tool.result
      : tool.result != null ? JSON.stringify(tool.result, null, 2) : null
    return (
      <AgentToolCard
        input={tool.input as AgentToolCardProps['input']}
        result={agentResult}
        isStreaming={tool.status === 'running'}
        tool={tool}
        onAbort={onAbort}
      />
    )
  }

  // AskUserQuestion: render specialized interactive question card
  if (tool.name === 'AskUserQuestion' || tool.name === 'ask_user_question') {
    const question = typeof tool.input?.question === 'string' ? tool.input.question : ''
    const options = Array.isArray(tool.input?.options) ? tool.input.options as string[] : undefined
    const isAnswered = tool.status !== 'running'
    const answer = typeof tool.result === 'string' ? tool.result : undefined
    return (
      <AskUserQuestionCard
        question={question}
        options={options}
        isAnswered={isAnswered}
        answer={answer}
      />
    )
  }

  // SendMessage: delegate to specialized card
  if (tool.name === 'SendMessage') {
    return <SendMessageCard tool={tool} />
  }

  // TaskCreate: compact inline "created" badge
  if (TASK_CREATE_TOOLS.has(tool.name)) {
    const subject = typeof tool.input?.subject === 'string' ? tool.input.subject : '(unnamed task)'
    const isDone = tool.status === 'done'
    const isRunning = tool.status === 'running'
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 8,
        background: isDone ? 'rgba(34,197,94,0.12)' : isRunning ? 'rgba(99,102,241,0.10)' : 'rgba(239,68,68,0.10)',
        border: `1px solid ${isDone ? 'rgba(34,197,94,0.28)' : isRunning ? 'rgba(99,102,241,0.28)' : 'rgba(239,68,68,0.28)'}`,
        marginBottom: 4,
        fontSize: 12,
        color: isDone ? 'rgba(74,222,128,0.90)' : isRunning ? 'rgba(165,180,252,0.90)' : 'rgba(252,165,165,0.90)',
        fontWeight: 500,
        maxWidth: '100%',
        overflow: 'hidden',
        transition: 'all 0.15s ease',
      }}>
        {isDone
          ? <Check size={12} style={{ flexShrink: 0 }} />
          : isRunning
          ? <Loader2 size={12} className="animate-spin" style={{ flexShrink: 0 }} />
          : <X size={12} style={{ flexShrink: 0 }} />
        }
        <span style={{ fontWeight: 700, flexShrink: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.75 }}>
          TaskCreate
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subject}
        </span>
      </div>
    )
  }

  // TaskUpdate: compact inline "updated" badge
  if (TASK_UPDATE_TOOLS.has(tool.name)) {
    const taskId = typeof tool.input?.taskId === 'string' ? tool.input.taskId : ''
    const status = typeof tool.input?.status === 'string' ? tool.input.status : ''
    const shortId = taskId.length > 6 ? taskId.slice(0, 6) : taskId
    const isDone = tool.status === 'done'
    const isRunning = tool.status === 'running'
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 8,
        background: isDone ? 'rgba(99,102,241,0.10)' : isRunning ? 'rgba(99,102,241,0.08)' : 'rgba(239,68,68,0.10)',
        border: `1px solid ${isDone ? 'rgba(99,102,241,0.28)' : isRunning ? 'rgba(99,102,241,0.20)' : 'rgba(239,68,68,0.28)'}`,
        marginBottom: 4,
        fontSize: 12,
        color: isDone ? 'rgba(165,180,252,0.90)' : isRunning ? 'rgba(165,180,252,0.75)' : 'rgba(252,165,165,0.90)',
        fontWeight: 500,
        maxWidth: '100%',
        overflow: 'hidden',
        transition: 'all 0.15s ease',
      }}>
        {isDone
          ? <Check size={12} style={{ flexShrink: 0 }} />
          : isRunning
          ? <Loader2 size={12} className="animate-spin" style={{ flexShrink: 0 }} />
          : <X size={12} style={{ flexShrink: 0 }} />
        }
        <span style={{ fontWeight: 700, flexShrink: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.75 }}>
          TaskUpdate
        </span>
        {shortId && (
          <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.75 }}>#{shortId}</span>
        )}
        {status && (
          <span style={{ fontSize: 10, opacity: 0.80 }}>{'\u2192'} {status}</span>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderLeft: `2px solid ${leftBorderColor}`,
        borderRadius: 10,
        marginBottom: 6,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header */}
      <button
        onClick={() => { userToggledRef.current = true; setExpanded(!expanded) }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: 'var(--bg-hover)',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--bg-hover)' : 'none',
          borderRadius: expanded ? '8px 8px 0 0' : 8,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--text-primary)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-active)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
      >
        <ChevronDown
          size={11}
          style={{
            color: 'var(--text-muted)',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        />
        <Icon size={13} style={{ color: 'rgba(165,180,252,0.8)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
          {/* For file path tools, show path-highlighted summary; otherwise show normal summary */}
          {isFilePath && highlightFilePath ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', minWidth: 0 }}>
              <span style={{ flexShrink: 0, color: 'var(--text-secondary)', fontWeight: 400 }}>
                {tool.name === 'Read' ? '读取' : tool.name === 'Write' ? '写入' : tool.name === 'Edit' ? '编辑' : tool.name === 'MultiEdit' ? '多段编辑' : tool.name}
              </span>
              <FilePathHighlight filePath={highlightFilePath} />
            </span>
          ) : (
            summaryLabel
          )}
          {tool.name.startsWith('mcp__') && (() => {
            const parts = tool.name.split('__')
            const serverName = parts[1]
            return serverName ? (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                background: 'rgba(99,102,241,0.15)',
                color: '#6366f1',
                borderRadius: 6,
                padding: '1px 4px',
                flexShrink: 0,
                letterSpacing: '0.02em',
                border: '1px solid rgba(99,102,241,0.3)',
              }}>
                {serverName}
              </span>
            ) : null
          })()}
        </span>
        {showElapsed && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
            fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatElapsed(elapsed)}
          </span>
        )}
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {/* Status badge */}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 6px',
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 600,
            ...(isRunning
              ? { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }
              : tool.status === 'done'
              ? { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80' }
              : { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }
            ),
          }}>
            {statusIcon}
          </span>
        </span>
        {showFinalDuration && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
            fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}>
            <Timer size={9} />
            {formatElapsed(finalDuration)}
          </span>
        )}
        {showElapsed && onAbort && (
          <button
            onClick={(e) => { e.stopPropagation(); onAbort() }}
            title={t('toolbar.cancelTool')}
            style={{
              padding: '1px 6px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 600,
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
          >
            {t('common.cancel')}
          </button>
        )}
      </button>

      {/* Expanded detail with animated height */}
      <div className={`tool-output-wrapper${expanded ? ' expanded' : ''}`}>
        <div>
        {expanded && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          {/* Input section */}
          <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              {t('tool.input')}
              {/* File path for non-file-path-highlight tools (legacy display) */}
              {!isFilePath && extractFilePath(tool.input || {}) && (
                <span style={{ color: '#a5b4fc', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260, fontWeight: 400, letterSpacing: 'normal', textTransform: 'none' }}>
                  {extractFilePath(tool.input || {})}
                </span>
              )}
            </div>

            {/* Bash: command block */}
            {isBash && bashCommand ? (
              <BashCommandBlock command={bashCommand} />
            ) : FILE_CLI_EDIT_TOOLS.has(tool.name) && typeof tool.input.path === 'string' ? (
              <FileDiffView
                tool="file_edit"
                path={tool.input.path}
                oldString={typeof tool.input.old_string === 'string' ? tool.input.old_string : ''}
                newString={typeof tool.input.new_string === 'string' ? tool.input.new_string : ''}
              />
            ) : FILE_CLI_WRITE_TOOLS.has(tool.name) && typeof tool.input.path === 'string' ? (
              <FileDiffView
                tool={tool.name === 'file_create' ? 'file_create' : 'file_write'}
                path={tool.input.path}
                content={typeof tool.input.content === 'string' ? tool.input.content : ''}
              />
            ) : isFileEdit && (tool.input.old_str || tool.input.new_str || tool.input.old_string || tool.input.new_string) ? (
              <>
                <DiffView
                  oldStr={String(tool.input.old_str ?? tool.input.old_string ?? '')}
                  newStr={String(tool.input.new_str ?? tool.input.new_string ?? '')}
                  filePath={tool.input.path ? String(tool.input.path) : undefined}
                />
              </>
            ) : FILE_WRITE_TOOLS.has(tool.name) && tool.input.content ? (
              <DiffView
                oldStr=""
                newStr={String(tool.input.content)}
                filePath={tool.input.path ? String(tool.input.path) : tool.input.file_path ? String(tool.input.file_path) : undefined}
              />
            ) : tool.name === 'NotebookEdit' ? (
              <NotebookEditCard input={tool.input} />
            ) : tool.name === 'RemoteTrigger' ? (
              <RemoteTriggerInputCard input={tool.input} />
            ) : tool.name === 'TodoWrite' || tool.name === 'todo_write' ? (
              <TodoListView todos={Array.isArray(tool.input.todos) ? (tool.input.todos as import('./TodoListView').TodoItem[]) : []} />
            ) : TASK_LIST_TOOLS.has(tool.name) || TASK_GET_TOOLS.has(tool.name) ? (
              /* TaskList/TaskGet: show compact task cards in input section (query params) */
              <pre style={{ fontSize: 11, margin: 0, fontFamily: 'monospace', background: 'rgba(8,8,16,1)', border: '1px solid var(--bg-hover)', borderRadius: 4, padding: '6px 8px', overflow: 'auto', maxHeight: 100, color: '#a5b4fc', lineHeight: 1.5 }}>
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            ) : tool.name === 'CronCreate' ? (
              <CronCard mode='create' input={tool.input} />
            ) : tool.name === 'CronDelete' ? (
              <CronCard mode='delete' input={tool.input} />
            ) : BROWSER_TOOLS.has(tool.name) ? (
              <WebBrowserInputCard input={tool.input} />
            ) : (
              <pre style={{ fontSize: 11, margin: 0, fontFamily: 'monospace', background: 'rgba(8,8,16,1)', border: '1px solid var(--bg-hover)', borderRadius: 4, padding: '6px 8px', overflow: 'auto', maxHeight: 200, color: '#a5b4fc', lineHeight: 1.5 }}>
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            )}
          </div>

          {/* Output section */}
          {tool.result !== undefined && (() => {
            // NotebookEdit: show compact success/error badge
            if (tool.name === 'NotebookEdit') {
              const isError = tool.status === 'error'
              return (
                <div>
                  <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                      {t('tool.output')}
                    </div>
                    {isError ? (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 8,
                        background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)',
                        color: '#fca5a5', fontSize: 11, fontWeight: 500,
                      }}>
                        <X size={11} style={{ flexShrink: 0 }} />
                        {resultText || 'Error editing cell'}
                      </div>
                    ) : (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 8,
                        background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.28)',
                        color: '#4ade80', fontSize: 11, fontWeight: 500,
                      }}>
                        <Check size={11} style={{ flexShrink: 0 }} />
                        Cell updated
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            // LSP tool: try to parse result as structured LSP output
            if (tool.name === 'LSP') {
              const lspData = parseLSPOutput(resultText)
              if (lspData) {
                return (
                  <div style={{ borderTop: '1px solid var(--bg-hover)', padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('tool.output')}</span>
                      <CopyOutputBtn text={resultText} t={t} />
                    </div>
                    <LSPResultCard data={lspData} />
                  </div>
                )
              }
            }

            // WebBrowserTool / web_browser / browser: action card with screenshot or text result
            if (BROWSER_TOOLS.has(tool.name) && resultText) {
              return (
                <div>
                  <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('tool.output')}</span>
                      <CopyOutputBtn text={resultText} t={t} />
                    </div>
                    <WebBrowserResultCard result={resultText} status={tool.status} t={t} />
                  </div>
                </div>
              )
            }

            // ListMcpResources: render resource URI chips
            if (tool.name === 'ListMcpResources' && resultText) {
              const items = parseMcpResourceList(resultText)
              if (items) {
                return (
                  <div>
                    <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                    <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{t('tool.output')}</span>
                        <CopyOutputBtn text={resultText} t={t} />
                      </div>
                      <McpResourceListCard items={items} t={t} />
                    </div>
                  </div>
                )
              }
            }

            // ReadMcpResource: render URI header + content preview
            if (tool.name === 'ReadMcpResource' && resultText) {
              const uri = typeof tool.input?.uri === 'string' ? tool.input.uri : ''
              return (
                <div>
                  <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('tool.output')}</span>
                    </div>
                    <McpResourceReadCard uri={uri} content={resultText} t={t} />
                  </div>
                </div>
              )
            }

            // TaskList / TaskGet: parse JSON result into TaskDashboardCard
            if ((TASK_LIST_TOOLS.has(tool.name) || TASK_GET_TOOLS.has(tool.name)) && resultText) {
              const taskItems = parseTaskItems(resultText)
              if (taskItems) {
                return (
                  <div>
                    <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                    <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{t('tool.output')}</span>
                        <CopyOutputBtn text={resultText} t={t} />
                      </div>
                      <TaskDashboardCard tasks={taskItems} singleTask={TASK_GET_TOOLS.has(tool.name)} />
                    </div>
                  </div>
                )
              }
            }

            // RemoteTrigger: action-aware result card
            if (tool.name === 'RemoteTrigger' && resultText) {
              const rtAction = (typeof tool.input?.action === 'string' ? tool.input.action : 'list') as RemoteTriggerAction
              return (
                <div>
                  <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('tool.output')}</span>
                      <CopyOutputBtn text={resultText} t={t} />
                    </div>
                    <RemoteTriggerResultCard action={rtAction} resultText={resultText} />
                  </div>
                </div>
              )
            }

            // CronCreate: show scheduled badge with job ID
            if (tool.name === 'CronCreate' && resultText) {
              return (
                <div>
                  <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                      {t('tool.output')}
                    </div>
                    <CronCard mode='create' input={tool.input} resultText={resultText} isResult />
                  </div>
                </div>
              )
            }

            // CronDelete: show success/error badge
            if (tool.name === 'CronDelete') {
              const isError = tool.status === 'error'
              return (
                <div>
                  <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                      {t('tool.output')}
                    </div>
                    {isError ? (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 8,
                        background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)',
                        color: '#fca5a5', fontSize: 11, fontWeight: 500,
                      }}>
                        <X size={11} style={{ flexShrink: 0 }} />
                        {resultText || 'Delete failed'}
                      </div>
                    ) : (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 8,
                        background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.28)',
                        color: '#4ade80', fontSize: 11, fontWeight: 500,
                      }}>
                        <Check size={11} style={{ flexShrink: 0 }} />
                        Job deleted
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            // CronList: parse job list and show compact cards
            if (tool.name === 'CronList' && resultText) {
              return (
                <div>
                  <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('tool.output')}</span>
                      <CopyOutputBtn text={resultText} t={t} />
                    </div>
                    <CronCard mode='list' input={tool.input} resultText={resultText} isResult />
                  </div>
                </div>
              )
            }

            // Glob/Grep: structured result summary
            if (isSearchResult && resultText) {
              return (
                <div>
                  <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('tool.output')}</span>
                      <CopyOutputBtn text={resultText} t={t} />
                    </div>
                    <SearchResultSummary resultText={resultText} toolName={tool.name} />
                  </div>
                </div>
              )
            }

            // WebSearch/WebFetch: URL links + content preview
            if (isWebResult && resultText) {
              return (
                <div>
                  <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('tool.output')}</span>
                      <CopyOutputBtn text={resultText} t={t} />
                    </div>
                    <WebResultBlock resultText={resultText} toolName={tool.name} />
                  </div>
                </div>
              )
            }

            // Bash: command output with fold, error highlighting, status dot
            if (isBash) {
              return (
                <div>
                  <div style={{ height: 1, background: 'var(--bg-hover)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {t('tool.output')}
                        {resultText && <BashStatusDot output={resultText} />}
                      </span>
                      {resultText && <CopyOutputBtn text={resultText} t={t} />}
                    </div>
                    {resultText ? (
                      <BashOutputBlock output={resultText} />
                    ) : (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontStyle: 'italic', fontFamily: 'monospace' }}>
                        {t('tool.noOutput')}
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            return (
            <div>
              {/* Divider */}
              <div style={{ height: 1, background: 'var(--bg-hover)' }} />
              <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t('tool.output')}
                    {resultText && resultText.split('\n').length > 1 && (
                      <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 400, letterSpacing: 'normal', textTransform: 'none' }}>
                        {t('tool.linesCount', { count: String(resultText.split('\n').length) })}
                      </span>
                    )}
                  </span>
                  {resultText && (
                    <CopyOutputBtn text={resultText} t={t} />
                  )}
                </div>
                <pre style={{
                  fontSize: 11, margin: 0, padding: '6px 8px',
                  fontFamily: 'monospace',
                  background: 'rgba(8,8,16,1)',
                  border: '1px solid var(--bg-hover)',
                  borderRadius: 4,
                  color: tool.status === 'error' ? '#fca5a5' : 'var(--text-secondary)',
                  overflow: 'auto', maxHeight: 200,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  lineHeight: 1.5,
                }}>
                  {resultText}
                </pre>
              </div>
            </div>
            )
          })()}

          {/* Image preview thumbnails (Iteration 462) */}
          {imagePaths.length > 0 && (
            <div style={{ borderTop: '1px solid var(--bg-hover)', padding: '6px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', background: 'rgba(8,8,16,0.7)' }}>
              {imagePaths.map((imgPath, i) => (
                <ImageThumbnail key={i} filePath={imgPath} onClick={() => setLightboxSrc(`file://${imgPath}`)} t={t} />
              ))}
            </div>
          )}
        </div>
        )}
        </div>
      </div>

      {/* Image Lightbox portal (Iteration 462) */}
      {lightboxSrc && ReactDOM.createPortal(
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10001,
            background: 'rgba(0,0,0,0.70)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
            animation: 'slideUp 0.15s ease',
          }}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={lightboxSrc}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 6 }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </div>
  )
}


/** Image thumbnail with error fallback */
function ImageThumbnail({ filePath, onClick, t }: { filePath: string; onClick: () => void; t: (key: string) => string }) {
  const [error, setError] = useState(false)
  const fileName = filePath.split(/[/\\]/).pop() || filePath

  if (error) {
    return (
      <div style={{
        width: 80, height: 60, borderRadius: 4,
        background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: 'var(--text-muted)', gap: 2,
      }}>
        <Image size={14} style={{ opacity: 0.5 }} />
        <span style={{ maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
      </div>
    )
  }

  return (
    <img
      src={`file://${filePath}`}
      alt={fileName}
      title={fileName}
      onClick={onClick}
      onError={() => setError(true)}
      style={{
        maxWidth: 300, maxHeight: 200, objectFit: 'contain',
        borderRadius: 4, cursor: 'zoom-in',
        border: '1px solid var(--border)',
      }}
    />
  )
}
