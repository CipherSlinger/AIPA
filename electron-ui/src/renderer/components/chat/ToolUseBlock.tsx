import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { ToolUseInfo } from '../../types/app.types'
import { ChevronDown, Terminal, FileEdit, Search, Globe, Loader2, Check, X, Timer, ClipboardCopy, FileCode, FileText, Image, FileType, Palette, GitBranch, GitMerge, Clock, StopCircle, BookOpen, Network, Code2, CheckSquare, ClipboardList, Settings2, Send, Users, Compass, CheckCircle2, Layers, Database, FileInput, HelpCircle } from 'lucide-react'
import { useT } from '../../i18n'
import DiffView from './DiffView'
import FileDiffView from './FileDiffView'
import { generateToolSummary } from '../../utils/toolSummary'
import LSPResultCard, { parseLSPOutput } from './LSPResultCard'
import TodoListView from './TodoListView'

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

const BASH_TOOLS = new Set(['Bash', 'computer'])
const FILE_EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'str_replace_editor', 'str_replace_based_edit_tool'])
// CLI snake_case variants (file_edit / file_write / file_create from stream-json)
const FILE_CLI_EDIT_TOOLS = new Set(['file_edit'])
const FILE_CLI_WRITE_TOOLS = new Set(['file_write', 'file_create'])

// File path highlight tools
const FILE_PATH_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'read_file', 'create_file'])

// Glob/Grep result summary tools
const SEARCH_RESULT_TOOLS = new Set(['Glob', 'Grep'])

// Error keywords for Bash output detection
const ERROR_KEYWORDS = /exit code|error|Error|FAILED|fatal/

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

const FILE_WRITE_TOOLS = new Set(['Write', 'create_file'])

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
        color: copied ? '#4ade80' : 'rgba(255,255,255,0.45)',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 9,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#6366f1' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
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
      color: 'rgba(165,180,252,0.80)',
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

/** Bash command block */
function BashCommandBlock({ command }: { command: string }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.30)',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.07)',
      padding: '8px 12px',
      fontFamily: 'monospace',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 0,
      transition: 'all 0.15s ease',
    }}>
      <span style={{
        color: 'rgba(99,102,241,0.80)',
        fontWeight: 700,
        marginRight: 8,
        flexShrink: 0,
        userSelect: 'none',
        fontSize: 13,
      }}>$</span>
      <span style={{
        color: 'rgba(255,255,255,0.82)',
        fontFamily: 'monospace',
        fontSize: 13,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        flex: 1,
      }}>{command}</span>
    </div>
  )
}

const BASH_OUTPUT_MAX_LINES = 30

/** Bash output block with line-limit fold */
function BashOutputBlock({ output }: { output: string }) {
  const lines = output.split('\n')
  const totalLines = lines.length
  const hasError = ERROR_KEYWORDS.test(output)
  const [showAll, setShowAll] = useState(false)

  const visibleLines = (!showAll && totalLines > BASH_OUTPUT_MAX_LINES)
    ? lines.slice(0, BASH_OUTPUT_MAX_LINES)
    : lines

  const textColor = hasError ? 'rgba(239,68,68,0.75)' : 'rgba(255,255,255,0.60)'

  return (
    <div style={{
      background: 'rgba(0,0,0,0.20)',
      borderRadius: 6,
      padding: '6px 10px',
      transition: 'all 0.15s ease',
    }}>
      <pre style={{
        margin: 0,
        fontSize: 12,
        fontFamily: 'monospace',
        color: textColor,
        lineHeight: 1.5,
        maxHeight: 200,
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.10) transparent',
      }}>
        {visibleLines.join('\n')}
      </pre>
      {totalLines > BASH_OUTPUT_MAX_LINES && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            marginTop: 4,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(165,180,252,0.70)',
            fontSize: 11,
            fontFamily: 'monospace',
            padding: '2px 0',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.70)' }}
        >
          展开全部 {totalLines} 行
        </button>
      )}
    </div>
  )
}

/** Bash exit status indicator */
function BashStatusDot({ output }: { output: string }) {
  const hasError = ERROR_KEYWORDS.test(output)
  const dotColor = hasError ? 'rgba(239,68,68,0.80)' : 'rgba(34,197,94,0.80)'
  const label = hasError ? '失败' : '成功'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 10,
      fontWeight: 600,
      color: dotColor,
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: dotColor,
        display: 'inline-block',
        flexShrink: 0,
      }} />
      {label}
    </span>
  )
}

/** Glob/Grep result summary */
function SearchResultSummary({ resultText }: { resultText: string }) {
  const [showAll, setShowAll] = useState(false)
  const lines = resultText.split('\n').filter(l => l.trim().length > 0)
  const total = lines.length
  const PREVIEW_LIMIT = 5
  const visibleLines = (!showAll && total > PREVIEW_LIMIT) ? lines.slice(0, PREVIEW_LIMIT) : lines

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      transition: 'all 0.15s ease',
    }}>
      {/* Count badge */}
      <div>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 7px',
          borderRadius: 6,
          background: 'rgba(34,197,94,0.15)',
          color: 'rgba(34,197,94,0.80)',
          fontSize: 10,
          fontWeight: 700,
          border: '1px solid rgba(34,197,94,0.25)',
          letterSpacing: '0.03em',
        }}>
          找到 {total} 项
        </span>
      </div>
      {/* Results list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visibleLines.map((line, idx) => (
          <div key={idx} style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.60)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.5,
          }}>
            {line}
          </div>
        ))}
        {total > PREVIEW_LIMIT && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(165,180,252,0.70)',
              fontSize: 11,
              fontFamily: 'monospace',
              padding: '2px 0',
              textAlign: 'left',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.70)' }}
          >
            + {total - PREVIEW_LIMIT} 更多...
          </button>
        )}
      </div>
    </div>
  )
}

// ── AgentToolCard ──────────────────────────────────────────────────────────────

interface AgentToolCardProps {
  input: {
    description?: string
    prompt?: string
    subagent_type?: string
    [key: string]: unknown
  }
  result?: string | null
  isStreaming?: boolean
  tool: ToolUseInfo
  onAbort?: () => void
}

function AgentToolCard({ input, result, isStreaming, tool, onAbort }: AgentToolCardProps) {
  const isRunning = tool.status === 'running'
  const isDone = tool.status === 'done'
  const description = input.description || input.prompt || ''
  const subagentType = input.subagent_type || ''
  const [elapsed, setElapsed] = useState(0)
  const [finalDuration, setFinalDuration] = useState<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (isRunning) {
      setExpanded(true)
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
      if (startTimeRef.current && elapsed > 0) {
        setFinalDuration(elapsed)
      }
      setExpanded(false)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning])

  const statusColor = isRunning
    ? 'rgba(251,191,36,0.82)'
    : isDone
    ? 'rgba(134,239,172,0.82)'
    : 'rgba(239,68,68,0.82)'

  const statusLabel = isRunning ? '运行中' : isDone ? '已完成' : '出错'

  const promptText = typeof input.prompt === 'string' ? input.prompt : ''

  return (
    <div
      style={{
        background: 'rgba(15,15,25,0.60)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: '3px solid rgba(139,92,246,0.60)',
        borderRadius: 10,
        marginBottom: 6,
        overflow: 'hidden',
        transition: 'all 0.15s ease',
      }}
    >
      <style>{`
        @keyframes agent-pulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>

      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          background: 'rgba(139,92,246,0.06)',
          border: 'none',
          borderBottom: expanded ? '1px solid rgba(255,255,255,0.07)' : 'none',
          borderRadius: expanded ? '8px 8px 0 0' : 8,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.10)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.06)' }}
      >
        {/* Sub-agent label */}
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase' as const,
          color: 'rgba(192,132,252,0.82)',
          flexShrink: 0,
        }}>
          子代理
        </span>

        {/* Description preview */}
        <span style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.82)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {description || '(无描述)'}
        </span>

        {/* Elapsed timer */}
        {isRunning && elapsed >= 2 && (
          <span style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.38)',
            flexShrink: 0,
            fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatElapsed(elapsed)}
          </span>
        )}

        {/* Final duration */}
        {!isRunning && finalDuration !== null && finalDuration >= 1 && (
          <span style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.38)',
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

        {/* Status badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 10,
          fontWeight: 600,
          color: statusColor,
          flexShrink: 0,
        }}>
          {isRunning ? (
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor,
              display: 'inline-block',
              flexShrink: 0,
              animation: 'agent-pulse 1.5s ease-in-out infinite',
            }} />
          ) : isDone ? (
            <Check size={10} style={{ color: statusColor }} />
          ) : (
            <X size={10} style={{ color: statusColor }} />
          )}
          {statusLabel}
        </span>

        {/* Abort button */}
        {isRunning && onAbort && (
          <button
            onClick={(e) => { e.stopPropagation(); onAbort() }}
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
            取消
          </button>
        )}

        {/* Chevron */}
        <ChevronDown
          size={11}
          style={{
            color: 'rgba(255,255,255,0.45)',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Subagent type tag */}
          {subagentType && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase' as const,
                color: 'rgba(255,255,255,0.45)',
              }}>类型</span>
              <span style={{
                fontSize: 11,
                color: 'rgba(192,132,252,0.60)',
                background: 'rgba(139,92,246,0.10)',
                border: '1px solid rgba(139,92,246,0.20)',
                borderRadius: 6,
                padding: '1px 6px',
                fontWeight: 500,
              }}>
                {subagentType}
              </span>
            </div>
          )}

          {/* Prompt content */}
          {promptText && (
            <div>
              <div style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase' as const,
                color: 'rgba(255,255,255,0.38)',
                marginBottom: 4,
              }}>
                提示词
              </div>
              <pre style={{
                margin: 0,
                fontSize: 11,
                fontFamily: 'monospace',
                background: 'rgba(8,8,16,0.80)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6,
                padding: '6px 10px',
                overflow: 'auto',
                maxHeight: 160,
                color: 'rgba(255,255,255,0.60)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255,255,255,0.10) transparent',
              }}>
                {promptText}
              </pre>
            </div>
          )}

          {/* Result */}
          {result != null && (
            <div>
              <div style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase' as const,
                color: 'rgba(255,255,255,0.38)',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span>子代理输出</span>
                {result && <CopyOutputBtn text={result} t={(k) => k === 'message.copyCode' ? '复制' : k === 'message.codeCopied' ? '已复制' : k} />}
              </div>
              <pre style={{
                margin: 0,
                fontSize: 11,
                fontFamily: 'monospace',
                background: 'rgba(8,8,16,0.80)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6,
                padding: '6px 10px',
                overflow: 'auto',
                maxHeight: 200,
                color: 'rgba(255,255,255,0.60)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255,255,255,0.10) transparent',
              }}>
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
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

  return (
    <div
      style={{
        background: 'rgba(15,15,25,0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
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
          background: 'rgba(255,255,255,0.03)',
          border: 'none',
          borderBottom: expanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
          borderRadius: expanded ? '8px 8px 0 0' : 8,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'rgba(255,255,255,0.82)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      >
        <ChevronDown
          size={11}
          style={{
            color: 'rgba(255,255,255,0.45)',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        />
        <Icon size={13} style={{ color: 'rgba(165,180,252,0.8)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
          {/* For file path tools, show path-highlighted summary; otherwise show normal summary */}
          {isFilePath && highlightFilePath ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', minWidth: 0 }}>
              <span style={{ flexShrink: 0, color: 'rgba(255,255,255,0.60)', fontWeight: 400 }}>
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
            color: 'rgba(255,255,255,0.38)',
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
            color: 'rgba(255,255,255,0.38)',
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
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Input section */}
          <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
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
            ) : tool.name === 'TodoWrite' || tool.name === 'todo_write' ? (
              <TodoListView todos={Array.isArray(tool.input.todos) ? (tool.input.todos as import('./TodoListView').TodoItem[]) : []} />
            ) : (
              <pre style={{ fontSize: 11, margin: 0, fontFamily: 'monospace', background: 'rgba(8,8,16,1)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '6px 8px', overflow: 'auto', maxHeight: 200, color: '#a5b4fc', lineHeight: 1.5 }}>
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            )}
          </div>

          {/* Output section */}
          {tool.result !== undefined && (() => {
            // LSP tool: try to parse result as structured LSP output
            if (tool.name === 'LSP') {
              const lspData = parseLSPOutput(resultText)
              if (lspData) {
                return (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('tool.output')}</span>
                      <CopyOutputBtn text={resultText} t={t} />
                    </div>
                    <LSPResultCard data={lspData} />
                  </div>
                )
              }
            }

            // Glob/Grep: structured result summary
            if (isSearchResult && resultText) {
              return (
                <div>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('tool.output')}</span>
                      <CopyOutputBtn text={resultText} t={t} />
                    </div>
                    <SearchResultSummary resultText={resultText} />
                  </div>
                </div>
              )
            }

            // Bash: command output with fold, error highlighting, status dot
            if (isBash) {
              return (
                <div>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ padding: '8px 10px', background: 'rgba(8,8,16,0.7)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 4,
                  color: tool.status === 'error' ? '#fca5a5' : 'rgba(255,255,255,0.60)',
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
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', background: 'rgba(8,8,16,0.7)' }}>
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
            background: 'rgba(0,0,0,0.85)',
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

// ── NotebookEdit specialized card ─────────────────────────────────────────────

const NOTEBOOK_EDIT_MODE_STYLES: Record<string, { label: string; bg: string; border: string; color: string }> = {
  replace: {
    label: 'replace',
    bg: 'rgba(99,102,241,0.15)',
    border: 'rgba(99,102,241,0.30)',
    color: '#818cf8',
  },
  insert: {
    label: 'insert',
    bg: 'rgba(34,197,94,0.15)',
    border: 'rgba(34,197,94,0.30)',
    color: '#4ade80',
  },
  delete: {
    label: 'delete',
    bg: 'rgba(239,68,68,0.15)',
    border: 'rgba(239,68,68,0.30)',
    color: '#f87171',
  },
}

function NotebookEditCard({ input }: { input: Record<string, unknown> }) {
  const editMode = typeof input.edit_mode === 'string' ? input.edit_mode : 'replace'
  const cellNumber = typeof input.cell_number === 'number' ? input.cell_number : null
  const newSource = typeof input.new_source === 'string' ? input.new_source : null
  const cellType = typeof input.cell_type === 'string' ? input.cell_type : null
  const modeStyle = NOTEBOOK_EDIT_MODE_STYLES[editMode] ?? NOTEBOOK_EDIT_MODE_STYLES.replace

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {/* Header row: mode badge + cell info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Edit mode badge */}
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          padding: '2px 7px',
          borderRadius: 8,
          background: modeStyle.bg,
          border: `1px solid ${modeStyle.border}`,
          color: modeStyle.color,
          flexShrink: 0,
        }}>
          {modeStyle.label}
        </span>

        {/* Cell number */}
        {cellNumber !== null && (
          <span style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            Cell <span style={{ color: '#a5b4fc', fontWeight: 600 }}>{cellNumber}</span>
          </span>
        )}

        {/* Cell type badge */}
        {cellType && (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.04em',
            padding: '1px 5px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.45)',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            {cellType}
          </span>
        )}
      </div>

      {/* Cell source content */}
      {newSource !== null && editMode !== 'delete' && (
        <pre style={{
          margin: 0,
          fontSize: 11,
          fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
          background: 'rgba(8,8,16,1)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
          padding: '8px 10px',
          overflow: 'auto',
          maxHeight: 200,
          color: '#a5b4fc',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {newSource}
        </pre>
      )}

      {/* Delete placeholder */}
      {editMode === 'delete' && (
        <div style={{
          fontSize: 11,
          color: '#fca5a5',
          fontStyle: 'italic',
          opacity: 0.7,
        }}>
          Cell {cellNumber !== null ? cellNumber : ''} will be deleted.
        </div>
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
        background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: 'rgba(255,255,255,0.45)', gap: 2,
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
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    />
  )
}
