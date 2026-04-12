import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { ToolUseInfo } from '../../types/app.types'
import { ChevronDown, Terminal, FileEdit, Search, Globe, Loader2, Check, X, Timer, ClipboardCopy, FileCode, FileText, Image, FileType, Palette, GitBranch, GitMerge, Clock, StopCircle, BookOpen, Network, Code2, CheckSquare, ClipboardList, Settings2, Send, Users, Compass, CheckCircle2, Layers, Database, FileInput, HelpCircle } from 'lucide-react'
import { useT } from '../../i18n'
import DiffView from './DiffView'
import { generateToolSummary } from '../../utils/toolSummary'
import LSPResultCard, { parseLSPOutput } from './LSPResultCard'

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
        transition: 'color 0.15s ease, background 0.15s ease',
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#6366f1' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
    >
      {copied ? <Check size={10} /> : <ClipboardCopy size={10} />}
      {copied ? t('message.codeCopied') : t('message.copyCode')}
    </button>
  )
}

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
        transition: 'border-left-color 0.15s ease',
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
          {summaryLabel}
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
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              {t('tool.input')}
              {extractFilePath(tool.input || {}) && (
                <span style={{ color: '#a5b4fc', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260, fontWeight: 400, letterSpacing: 'normal', textTransform: 'none' }}>
                  {extractFilePath(tool.input || {})}
                </span>
              )}
            </div>
            {isFileEdit && (tool.input.old_str || tool.input.new_str || tool.input.old_string || tool.input.new_string) ? (
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
            ) : tool.name === 'TodoWrite' ? (
              <TodoWriteCard input={tool.input} />
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
                {isBash ? (
                  <pre style={{
                    margin: 0, padding: '6px 8px',
                    fontFamily: 'monospace', fontSize: 11,
                    background: 'rgba(8,8,16,1)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 4,
                    color: '#4ade80',
                    maxHeight: 200, overflowY: 'auto',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    lineHeight: 1.5,
                  }}>
                    {resultText || t('tool.noOutput')}
                  </pre>
                ) : (
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
                )}
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

// ── TodoWrite specialized card ─────────────────────────────────────────────────

interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'high' | 'medium' | 'low'
  id?: string
}

function TodoWriteCard({ input }: { input: Record<string, unknown> }) {
  const todos: TodoItem[] = Array.isArray(input.todos)
    ? (input.todos as TodoItem[])
    : []

  const priorityColor: Record<string, string> = {
    high: 'rgba(239,68,68,0.85)',
    medium: 'rgba(251,191,36,0.85)',
    low: 'rgba(255,255,255,0.38)',
  }

  if (todos.length === 0) {
    return (
      <div style={{
        background: 'rgba(8,8,16,0.8)',
        borderRadius: 8,
        padding: 8,
        fontSize: 11,
        color: 'rgba(255,255,255,0.38)',
        fontStyle: 'italic',
      }}>
        No todo items
      </div>
    )
  }

  return (
    <div style={{
      background: 'rgba(8,8,16,0.8)',
      borderRadius: 8,
      padding: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {todos.map((todo, idx) => {
        const isDone = todo.status === 'completed'
        const isActive = todo.status === 'in_progress'
        return (
          <div
            key={todo.id ?? idx}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '4px 0',
              borderBottom: idx < todos.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}
          >
            {/* Checkbox icon */}
            <span style={{
              flexShrink: 0,
              marginTop: 1,
              fontSize: 13,
              color: isDone ? '#4ade80' : isActive ? '#818cf8' : 'rgba(255,255,255,0.30)',
            }}>
              {isDone ? '☑' : isActive ? '◉' : '☐'}
            </span>
            {/* Content */}
            <span style={{
              flex: 1,
              fontSize: 12,
              color: isDone ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.82)',
              textDecoration: isDone ? 'line-through' : 'none',
              lineHeight: 1.5,
            }}>
              {todo.content}
            </span>
            {/* Priority badge */}
            {todo.priority && (
              <span style={{
                flexShrink: 0,
                fontSize: 9,
                fontWeight: 700,
                color: priorityColor[todo.priority] ?? 'rgba(255,255,255,0.38)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}>
                {todo.priority}
              </span>
            )}
          </div>
        )
      })}
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
