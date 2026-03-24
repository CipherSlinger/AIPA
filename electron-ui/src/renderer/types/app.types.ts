export interface SessionListItem {
  sessionId: string
  lastPrompt: string
  timestamp: number
  project: string
  projectSlug: string
}

export interface SessionMessage {
  type: string
  role?: string
  content?: unknown
  message?: unknown
  timestamp?: number
  [key: string]: unknown
}

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ToolUseInfo {
  id: string
  name: string
  input: Record<string, unknown>
  result?: unknown
  status: 'running' | 'done' | 'error'
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  thinking?: string
  toolUses?: ToolUseInfo[]
  timestamp: number
  isStreaming?: boolean
}

export interface FileEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
  path: string
}

export interface ClaudePrefs {
  apiKey: string
  model: string
  workingDir: string
  sidebarWidth: number
  terminalWidth: number
  fontSize: number
  fontFamily: string
  skipPermissions: boolean
  verbose: boolean
  theme: 'vscode' | 'modern' | 'minimal'
}
