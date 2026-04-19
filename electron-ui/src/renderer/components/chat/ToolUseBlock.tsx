import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { ToolUseInfo } from '../../types/app.types'
import { Terminal, FileEdit, Search, Globe, Check, X, ClipboardCopy, FileCode, FileText, Image, Palette, GitBranch, GitMerge, Clock, StopCircle, BookOpen, Network, Code2, CheckSquare, ClipboardList, Settings2, Send, Users, Compass, CheckCircle2, Layers, Database, FileInput, HelpCircle } from 'lucide-react'
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
import { AskUserQuestionCard } from './tool-cards/AskUserQuestionCard'
import { TaskCreateBadge, TaskUpdateBadge, TaskStopBadge, TASK_CREATE_TOOLS, TASK_UPDATE_TOOLS, TASK_STOP_TOOLS } from './tool-cards/TaskBadgeCard'
import { TeamCreateCard } from './tool-cards/TeamCreateCard'
import { SkillToolCard } from './tool-cards/SkillToolCard'
import { ToolSearchToolCard } from './tool-cards/ToolSearchToolCard'
import { ImageThumbnail } from './tool-cards/ImageThumbnail'
import { ToolCardHeader } from './tool-cards/ToolCardHeader'
import { StructuredOutputCard } from './tool-cards/StructuredOutputCard'
import { FileReadCard } from './tool-cards/FileReadCard'
import { FileWriteCard } from './tool-cards/FileWriteCard'
import { FileEditCard } from './tool-cards/FileEditCard'
import { BriefToolCard } from './BriefToolCard'
import { SleepToolCard } from './SleepToolCard'
import { TaskOutputCard } from './tool-cards/TaskOutputCard'
import { WorktreeToolCard } from './tool-cards/WorktreeToolCard'

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
  TaskOutput: ClipboardList,
  task_output: ClipboardList,
  // Notebooks
  NotebookEdit: BookOpen,
  // User interaction
  AskUserQuestion: HelpCircle,
  Brief: FileText,
  // MCP resource tools
  ListMcpResources: Database,
  ReadMcpResource: FileInput,
  // Structured output (P3-1)
  StructuredOutput: Database,
  structured_output: Database,
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

const FILE_WRITE_TOOLS = new Set(['Write', 'create_file'])

// Task management tools (isTodoV2Enabled feature gate)
// TASK_CREATE_TOOLS and TASK_UPDATE_TOOLS are imported from ./tool-cards/TaskBadgeCard
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

  // StructuredOutput: render specialized JSON schema output card (P3-1)
  if (tool.name === 'StructuredOutput' || tool.name === 'structured_output') {
    return <StructuredOutputCard tool={tool} />
  }

  // Read (FileRead): structured file content card
  if (tool.name === 'Read' || tool.name === 'read_file') {
    const fileResult = typeof tool.result === 'string' ? tool.result : null
    return (
      <FileReadCard
        input={tool.input || {}}
        result={fileResult}
        isStreaming={tool.status === 'running'}
      />
    )
  }

  // Write (FileWrite): structured file write card with green accent
  if (tool.name === 'Write') {
    const writeResult = typeof tool.result === 'string' ? tool.result : null
    return (
      <FileWriteCard
        input={tool.input || {}}
        result={writeResult}
        isStreaming={tool.status === 'running'}
      />
    )
  }

  // Edit / str_replace_editor / str_replace_based_edit_tool: inline diff card with orange accent
  if (tool.name === 'Edit' || tool.name === 'str_replace_editor' || tool.name === 'str_replace_based_edit_tool') {
    const editResult = typeof tool.result === 'string' ? tool.result : null
    return (
      <FileEditCard
        input={tool.input || {}}
        result={editResult}
        isStreaming={tool.status === 'running'}
      />
    )
  }

  // BriefTool: brief file content card with slate theme
  if (tool.name === 'BriefTool' || tool.name === 'brief') {
    const briefResult = typeof tool.result === 'string' ? tool.result : null
    return (
      <BriefToolCard
        input={tool.input || {}}
        result={briefResult}
      />
    )
  }

  // SleepTool: sleep status card with purple theme
  if (tool.name === 'SleepTool' || tool.name === 'sleep') {
    const sleepResult = typeof tool.result === 'string' ? tool.result : null
    return (
      <SleepToolCard
        input={tool.input || {}}
        result={sleepResult}
      />
    )
  }

  // TaskOutput: structured task output card with indigo theme
  if (tool.name === 'TaskOutput' || tool.name === 'task_output') {
    const taskOutputResult = typeof tool.result === 'string' ? tool.result : null
    return (
      <TaskOutputCard
        input={tool.input || {}}
        result={taskOutputResult}
        isLoading={tool.status === 'running'}
      />
    )
  }

  // TaskCreate: compact inline "created" badge
  if (TASK_CREATE_TOOLS.has(tool.name)) {
    const subject = typeof tool.input?.subject === 'string' ? tool.input.subject : '(unnamed task)'
    return (
      <TaskCreateBadge
        subject={subject}
        status={tool.status as 'running' | 'done' | 'error'}
      />
    )
  }

  // TaskUpdate: compact inline "updated" badge
  if (TASK_UPDATE_TOOLS.has(tool.name)) {
    const taskId = typeof tool.input?.taskId === 'string' ? tool.input.taskId : ''
    const updateStatus = typeof tool.input?.status === 'string' ? tool.input.status : ''
    return (
      <TaskUpdateBadge
        taskId={taskId}
        status={tool.status as 'running' | 'done' | 'error'}
        updateStatus={updateStatus}
      />
    )
  }

  // TaskStop: compact inline "stopped" badge
  if (TASK_STOP_TOOLS.has(tool.name)) {
    const taskId = typeof tool.input?.task_id === 'string' ? tool.input.task_id
      : typeof tool.input?.taskId === 'string' ? tool.input.taskId : ''
    return (
      <TaskStopBadge
        taskId={taskId}
        status={tool.status as 'running' | 'done' | 'error'}
      />
    )
  }

  // TeamCreate / TeamDelete: team management card
  if (tool.name === 'TeamCreate' || tool.name === 'team_create' || tool.name === 'TeamDelete' || tool.name === 'team_delete') {
    const teamResult = typeof tool.result === 'string' ? tool.result : null
    return (
      <TeamCreateCard
        input={tool.input || {}}
        result={teamResult}
        isLoading={tool.status === 'running'}
      />
    )
  }

  // EnterWorktree / ExitWorktree: worktree lifecycle card
  if (tool.name === 'EnterWorktree' || tool.name === 'enter_worktree') {
    return (
      <WorktreeToolCard
        action="enter"
        input={tool.input || {}}
        isLoading={tool.status === 'running'}
      />
    )
  }

  if (tool.name === 'ExitWorktree' || tool.name === 'exit_worktree') {
    return (
      <WorktreeToolCard
        action="exit"
        input={tool.input || {}}
        isLoading={tool.status === 'running'}
      />
    )
  }

  // Skill: skill invocation card
  if (tool.name === 'Skill' || tool.name === 'skill') {
    const skillResult = typeof tool.result === 'string' ? tool.result : null
    return (
      <SkillToolCard
        input={tool.input || {}}
        result={skillResult}
        isLoading={tool.status === 'running'}
      />
    )
  }

  // ToolSearchTool: tool search result card
  if (tool.name === 'ToolSearchTool' || tool.name === 'tool_search') {
    const searchResult = typeof tool.result === 'string' ? tool.result : null
    return (
      <ToolSearchToolCard
        input={tool.input || {}}
        result={searchResult}
        isLoading={tool.status === 'running'}
      />
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
      <ToolCardHeader
        expanded={expanded}
        onToggle={() => { userToggledRef.current = true; setExpanded(!expanded) }}
        Icon={Icon}
        leftBorderColor={leftBorderColor}
        summaryLabel={summaryLabel}
        isFilePath={isFilePath}
        filePath={highlightFilePath}
        toolName={tool.name}
        status={tool.status}
        showElapsed={showElapsed}
        showFinalDuration={showFinalDuration}
        elapsed={elapsed}
        finalDuration={finalDuration}
        onAbort={onAbort}
        t={t}
        FilePathHighlightComponent={FilePathHighlight}
      />

      {/* Expanded detail with animated height */}
      <div className={`tool-output-wrapper${expanded ? ' expanded' : ''}`}>
        <div>
        {expanded && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          {/* Input section */}
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
              <pre style={{ fontSize: 11, margin: 0, fontFamily: 'monospace', background: 'var(--code-bg)', border: '1px solid var(--bg-hover)', borderRadius: 4, padding: '6px 8px', overflow: 'auto', maxHeight: 100, color: '#a5b4fc', lineHeight: 1.5 }}>
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            ) : tool.name === 'CronCreate' ? (
              <CronCard mode='create' input={tool.input} />
            ) : tool.name === 'CronDelete' ? (
              <CronCard mode='delete' input={tool.input} />
            ) : BROWSER_TOOLS.has(tool.name) ? (
              <WebBrowserInputCard input={tool.input} />
            ) : (
              <pre style={{ fontSize: 11, margin: 0, fontFamily: 'monospace', background: 'var(--code-bg)', border: '1px solid var(--bg-hover)', borderRadius: 4, padding: '6px 8px', overflow: 'auto', maxHeight: 200, color: '#a5b4fc', lineHeight: 1.5 }}>
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
                  <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  <div style={{ borderTop: '1px solid var(--bg-hover)', padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                    <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                    <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', fontFamily: 'monospace' }}>
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
              <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                  background: 'var(--code-bg)',
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
            <div style={{ borderTop: '1px solid var(--bg-hover)', padding: '6px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', background: 'var(--section-bg)' }}>
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
            background: 'var(--glass-overlay)',
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

