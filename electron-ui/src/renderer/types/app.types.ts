export interface SessionListItem {
  sessionId: string
  lastPrompt: string
  timestamp: number
  project: string
  projectSlug: string
  title?: string
}

export interface SessionMessage {
  type: string
  role?: string
  content?: unknown
  message?: unknown
  timestamp?: number
  [key: string]: unknown
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'permission'

export interface ToolUseInfo {
  id: string
  name: string
  input: Record<string, unknown>
  result?: unknown
  status: 'running' | 'done' | 'error'
}

export interface StandardChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  toolUses?: ToolUseInfo[]
  timestamp: number
  isStreaming?: boolean
  attachments?: { name: string; dataUrl: string }[]  // image attachments
  rating?: 'up' | 'down' | null
  bookmarked?: boolean
  collapsed?: boolean
  /** Internal: accumulated content chunks during streaming (joined into content on stream end) */
  _contentChunks?: string[]
  /** Internal: accumulated thinking chunks during streaming */
  _thinkingChunks?: string[]
}

export interface PermissionMessage {
  id: string
  role: 'permission'
  permissionId: string         // requestId from CLI
  toolName: string
  toolInput: Record<string, unknown>
  decision: 'pending' | 'allowed' | 'denied'
  timestamp: number
}

export interface PlanMessage {
  id: string
  role: 'plan'
  planContent: string
  decision: 'pending' | 'accepted' | 'rejected'
  timestamp: number
}

export type ChatMessage = StandardChatMessage | PermissionMessage | PlanMessage

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
  theme: 'vscode' | 'light'
  onboardingDone?: boolean
  thinkingLevel?: 'off' | 'adaptive'
  systemPrompt?: string    // custom system prompt (passed via --append-system-prompt)
  maxTurns?: number        // --max-turns
  maxBudgetUsd?: number    // --max-budget-usd
  notifySound?: boolean     // play sound when response completes (default true)
  compactMode?: boolean     // reduce spacing for power users (default false)
  quickReplies?: { label: string; prompt: string }[]  // quick reply template chips
  language?: 'en' | 'zh-CN' | 'system'  // UI language preference (default: system)
  desktopNotifications?: boolean  // OS notifications when response completes while window unfocused (default true)
  tagNames?: string[]  // custom names for the 6 preset tags (indexed 0-5)
  sessionTags?: Record<string, string[]>  // sessionId -> array of tag IDs ('tag-1'..'tag-6')
}
