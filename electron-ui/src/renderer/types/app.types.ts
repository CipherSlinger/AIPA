import type { MemoryTurnReceipt } from '../lib/memoryReceipt'

/**
 * Who started a conversation besides the user. Absent means the user did —
 * the common case, and the only one that gets no badge.
 */
export type SessionOrigin =
  | { kind: 'automation'; jobId: string; jobName: string }
  | { kind: 'plugin'; pluginId: string; pluginLabel: string }

export interface SessionListItem {
  sessionId: string
  lastPrompt: string
  timestamp: number
  project: string
  projectSlug: string
  /** The session's real working directory when the engine reports one (Codex does). */
  cwd?: string
  title?: string
  messageCount?: number
  firstTimestamp?: number
  /** Set by `session:list` when a scheduled job or a plugin opened the session. */
  origin?: SessionOrigin
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

/**
 * One image the user attached to a message.
 *
 * New code stores only the on-disk path (written by the main process into the
 * app-owned attachments directory) — never base64. `dataUrl` survives only for
 * transcripts persisted before wave 41; it is read for display and never
 * written again.
 */
export interface MessageAttachment {
  name: string
  /** Absolute path inside the app attachments directory. Absent on legacy rows. */
  path?: string
  /** Byte size at attach time; 0 when the source could not be measured. */
  size?: number
  mimeType?: string
  /** Legacy base64 preview from older transcripts. Do not write this. */
  dataUrl?: string
}

/**
 * Delivery state of a message steered into a running Codex turn. The bridge
 * either accepted the guidance or rejected it; there is no "delivered and
 * read" signal, so `sent` means the request left the renderer.
 */
export interface GuidanceReceipt {
  /** The Codex turn this guidance was addressed to. */
  turnId: string
  state: 'sending' | 'sent' | 'failed'
  /** The engine's / IPC's own words when `state` is 'failed'. */
  error?: string
}

/**
 * A Codex hook notice rendered as a system row. The model did not produce it:
 * `blocked` means the hook stopped the turn before any model request, and
 * `failed` is shown only for the events whose output the model would have
 * depended on (`userPromptSubmit`, `sessionStart`).
 */
export interface HookNotice {
  kind: 'blocked' | 'failed'
  /** `<event>:<displayOrder>:<sourcePath>` — stable per hook run. */
  runId: string
  eventName: string
  /** Basename of the hook's `sourcePath`; empty when the engine named none. */
  sourceName: string
  /** Feedback (blocked) or error (failed) entries, verbatim, joined by blanks. */
  text: string
  /** At least one entry was cut by the main process. */
  truncated: boolean
}

/**
 * One session cited by an in-chat history answer. The shape is what
 * `revealSessionEvidence` consumes unchanged; `matchedTerm` is the term the
 * cited line actually contains, so the reopened transcript highlights real text
 * instead of the whole question.
 */
export interface HistoryAskSource {
  sessionId: string
  title?: string
  project: string
  matchType: 'content'
  engine: 'claude' | 'codex'
  timestamp: number
  messageTimestamp?: number
  messageRole?: 'user' | 'assistant'
  snippet: string
  matchedTerm: string
}

export type HistoryAskStatus =
  | 'running'
  | 'answered'
  | 'noMatch'
  | 'indexing'
  | 'busy'
  | 'unavailable'
  | 'timeout'
  | 'empty'
  | 'failed'
  | 'invalidQuestion'
  | 'stopped'

/**
 * A transcript row for one "ask your history" run. It is deliberately not a
 * model answer and deliberately not part of the conversation's engine context:
 * retrieval runs in the main process, and the row lives only in this renderer's
 * in-memory transcript. Nothing writes it to disk, so a reload or a session
 * switch removes it — `HistoryAskRow` says so rather than implying it is saved.
 */
export interface HistoryAskNotice {
  question: string
  answer: string
  sources: HistoryAskSource[]
  status: HistoryAskStatus
  /** The main process reported a partially built index; the answer may be incomplete. */
  indexing: boolean
  /** Ended before it settled (user Stop, leaving the view, or aborted by main). */
  stopped: boolean
  /** The IPC's own code when the ask failed, so the row can show the real one. */
  errorCode?: string
  /** `historyAskStatus`'s reason when no authenticated engine was available. */
  unavailableReason?: string
}

export interface StandardChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  toolUses?: ToolUseInfo[]
  timestamp: number
  isStreaming?: boolean
  /**
   * A hook-run notice. Rendered by `Message` from the fields, so the protocol
   * vocabulary (event name, source path) is never translated away.
   */
  hookNotice?: HookNotice
  /** An ephemeral answer retrieved from past conversations. Never model output. */
  historyAsk?: HistoryAskNotice
  attachments?: MessageAttachment[]  // user image attachments (on disk)
  /** Set when the turn failed after the images had been attached: the
   *  transcript must say they were not sent instead of implying delivery. */
  attachmentError?: string
  /**
   * What context this turn prepended to the prompt — memory tiers and, when
   * the conversation belongs to a department, its handbook. Absent means
   * *unknown*, not "nothing was sent": rows re-read from disk never carry a
   * receipt (the transcript does not persist one), and `/compact` deliberately
   * assembles none. Only a present receipt may be rendered as a disclosure.
   */
  memoryReceipt?: MemoryTurnReceipt
  /**
   * This user row is guidance steered into a turn that was already running,
   * not the message that started one. The transcript has to say so: a row that
   * looks like an ordinary prompt would imply a fresh answer is coming.
   */
  guidance?: GuidanceReceipt
  /**
   * The Codex turn this user row started, learned from the engine's
   * `userMessage` item echo. Absent on rows loaded from disk (the transcript
   * does not persist turn ids) and on guidance rows (those name their turn in
   * `guidance.turnId`). A row without a turn id cannot be branched from:
   * `thread/fork` has no other way to name a branch point.
   */
  turnId?: string
  fileAttachments?: { name: string; path: string; size: number }[]  // file context attachments
  rating?: 'up' | 'down' | null
  bookmarked?: boolean
  collapsed?: boolean
  pinned?: boolean
  reactions?: string[]  // emoji reaction tokens: 'thumbsUp' | 'heart' | 'lightbulb' | 'bookmark'
  annotation?: string  // private user annotation/note attached to this message
  /** Duration in ms from when the user sent the prompt to when the result arrived */
  responseDuration?: number
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
  /**
   * `resolved` — Codex settled the request itself (auto-resolution, another
   * client, turn cancel); `expired` — the bridge's timeout rejected it.
   * Neither is a user decision, so both stay neutral in the UI.
   */
  decision: 'pending' | 'allowed' | 'denied' | 'resolved' | 'expired'
  timestamp: number
  permissionSuggestions?: unknown[]  // CLI-suggested rules (PermissionUpdate[])
}

/** One selectable answer offered by a Codex `requestUserInput` question. */
export interface CodexQuestionOption {
  label: string
  description: string
}

/**
 * A `item/tool/requestUserInput` question, bounded by the bridge. There is no
 * multi-select in the protocol — every question takes exactly one answer.
 */
export interface CodexQuestion {
  id: string
  header: string
  question: string
  options: CodexQuestionOption[] | null
  /** Offer a free-text "Other" answer in addition to the listed options. */
  isOther: boolean
  /** The answer is a secret — render the free-text input as a password field. */
  isSecret: boolean
}

export interface HookCallbackMessage {
  id: string
  role: 'hook_callback'
  requestId: string
  callbackId: string
  hookInput: Record<string, unknown>
  toolUseId?: string
  decision: 'pending' | 'approved' | 'blocked'
  timestamp: number
}

export interface ElicitationMessage {
  id: string
  role: 'elicitation'
  requestId: string
  serverName: string
  message: string
  mode: 'form' | 'url'
  url?: string
  requestedSchema?: Record<string, unknown>
  /**
   * Present when the request came from Codex's `requestUserInput` method. The
   * card renders a real choice form for these instead of a schema-driven text
   * form. Absent for MCP elicitations and the plain-text fallback.
   */
  codexQuestions?: CodexQuestion[]
  /**
   * `resolved`/`expired` mean the request died without a user answer (server
   * auto-resolution or bridge timeout) — the card must render inert.
   */
  decision: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'resolved' | 'expired'
  timestamp: number
}

export interface PlanMessage {
  id: string
  role: 'plan'
  planContent: string
  decision: 'pending' | 'accepted' | 'rejected'
  timestamp: number
}

export type ChatMessage = StandardChatMessage | PermissionMessage | PlanMessage | HookCallbackMessage | ElicitationMessage

export interface FileEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
  path: string
}

export type PermissionMode = 'default' | 'acceptEdits' | 'dontAsk' | 'plan' | 'bypassPermissions'

/** Codex approval policy — maps to Codex CLI's approval modes */
export type ApprovalMode = 'suggest' | 'auto-edit' | 'full-auto'

/** A model the configured API key can actually use, as reported by the API. */
export interface AvailableModel {
  id: string
  name: string
}

export interface AppPrefs {
  apiKey: string
  model: string
  /**
   * Models fetched for the configured key (merged by the main process into the
   * persisted prefs). Built-in `MODEL_OPTIONS` stay the base catalogue; this is
   * only the extra ids the key supports, and it can be absent before any fetch.
   */
  availableModels?: AvailableModel[]
  workingDir: string
  sidebarWidth: number
  terminalWidth: number
  fontSize: number
  fontFamily: string
  skipPermissions: boolean
  permissionMode?: PermissionMode   // legacy permission mode (mapped to approvalMode for Codex)
  approvalMode?: ApprovalMode       // Codex-specific: suggest | auto-edit | full-auto
  verbose: boolean
  theme: 'vscode' | 'light' | 'system'
  onboardingDone?: boolean
  thinkingLevel?: 'off' | 'adaptive'  // kept for UI compat; ignored by Codex
  systemPrompt?: string    // custom system prompt (injected into first user message for Codex)
  maxTurns?: number        // kept for UI compat; Codex uses different limits
  maxBudgetUsd?: number    // kept for UI compat
  outputStyle?: 'default' | 'explanatory' | 'learning'  // output style: default (balanced), explanatory (insight blocks), learning (practice exercises)
  extendedThinking?: boolean  // enable extended thinking (passes --thinking-budget to CLI, default false)
  notifySound?: boolean     // play sound when response completes (default true)
  compactMode?: boolean     // reduce spacing for power users (default false)
  quickReplies?: { label: string; prompt: string }[]  // quick reply template chips
  language?: 'en' | 'zh-CN' | 'system'  // UI language preference (default: system)
  desktopNotifications?: boolean  // OS notifications when response completes while window unfocused (default true)
  tagNames?: string[]  // custom names for the 6 preset tags (indexed 0-5)
  sessionTags?: Record<string, string[]>  // sessionId -> array of tag IDs ('tag-1'..'tag-6')
  customPromptTemplates?: CustomPromptTemplate[]  // user-defined prompt templates
  notes?: Note[]  // user quick notes (persisted via electron-store)
  noteCategories?: NoteCategory[]  // note categories (max 10, persisted via electron-store)
  personas?: Persona[]  // user-defined AI personas (max 10, persisted via electron-store)
  activePersonaId?: string  // currently active persona ID (null/undefined = no persona)
  displayName?: string  // user's display name for personalized greeting (max 30 chars)
  memories?: MemoryItem[]  // persistent AI memory items (max 200, persisted via electron-store)
  workflows?: Workflow[]   // prompt chain workflows (max 50, persisted via electron-store)
  /**
   * Recently deleted workflows — a holding area, not a second workflow list.
   * Nothing here renders in the workflow grid or runs; entries exist only so
   * `deleteWorkflow` can be undone. The area is capped and an entry older than
   * TRASH_RETENTION_DAYS (see lib/workflowTrash.ts) is purged at app launch.
   */
  trashedWorkflows?: TrashedWorkflow[]
  scheduledPrompts?: ScheduledPrompt[]  // scheduled/recurring prompts (max 30, persisted via electron-store)
  promptHistory?: PromptHistoryItem[]   // prompt send history for analytics (max 200, persisted via electron-store)
  textSnippets?: TextSnippet[]          // user-defined text snippets triggered by ::keyword (max 50)
  navExpanded?: boolean                 // expand NavRail to show icon + label (default false, icon-only)
  apiKeyPool?: ApiKeyEntry[]            // multi-key pool for auto-switching on quota exhaustion
  activeApiKeyId?: string              // id of currently active key (undefined = use apiKey field)
  systemPresence?: boolean             // inject OS time, working dir, user name into system prompt (default true)
  channelFeishu?: import('../components/channel/channelConstants').FeishuConfig   // Feishu channel config
  channelWechat?: import('../components/channel/channelConstants').WechatConfig   // WeChat channel config
  resumeLastSession?: boolean   // auto-open the most recent session on app startup (default false)
  compactThreshold?: number      // auto-compact when context usage exceeds this % (default 80, range 60-90)
  advisorModel?: string          // secondary model for background tasks (compaction, auto-memory, away summary) — Iteration 488
  autoMemoryEnabled?: boolean    // auto-extract memories from conversations (default false)
  promptSuggestionsEnabled?: boolean  // show AI-predicted follow-up suggestions after each response (default true)
  speculationEnabled?: boolean        // pre-execute prompt suggestion in sandbox, accept/reject (default false, opt-in)
  tipHistory?: Record<string, number>  // tipId -> last shown timestamp (for contextual tips)
  idleReturnDialogEnabled?: boolean    // show dialog when returning after idle period (default true)
  effortLevel?: 'auto' | 'low' | 'medium' | 'high' | 'max'  // AI effort level: auto (CLI default), low (fast/cheap), medium (balanced), high (thorough), max (deepest reasoning)
  preventSleep?: boolean                    // prevent system idle sleep while AI is streaming (default true)
  avatarPreset?: string                      // selected preset avatar ID (e.g. 'xiaohei', 'xiaobai') — null/undefined = default user icon
  sessionFolders?: SessionFolder[]            // user-defined session folders (max 10)
  sessionFolderMap?: Record<string, string>   // sessionId -> folderId mapping
  customConversationTemplates?: CustomConversationTemplate[]  // user-defined conversation templates (max 20)
  archivedSessions?: string[]  // array of archived session IDs (hidden from main list)
  sessionColorLabels?: Record<string, string>  // sessionId -> hex color for left border stripe (Iteration 436)
  sessionListCompact?: boolean  // compact session list mode: reduced row height, title only (Iteration 444)
  forkMap?: Record<string, { sourceSessionId: string; forkMessageIndex: number; forkedSessionId: string; forkedSessionTitle?: string }>  // messageId -> fork metadata (Iteration 456)
  appendSystemPrompt?: string  // persistent appended system prompt (passed via --append-system-prompt, Iteration 523)
  disallowedTools?: string[]   // tools blocked from CLI via --disallowedTools (Iteration 527)
  clawdEnabled?: boolean       // show Clawd desktop pet that reacts to AI session state (Iteration 615)
  petAttentionAlerts?: boolean // summon the pet for background approvals/questions/failures/plugin completions (default true)
  dreamConsolidationEnabled?: boolean // background memory consolidation passes (default true)
}

export interface SessionFolder {
  id: string       // 'folder-' + timestamp
  name: string     // folder name (max 30 chars)
  emoji: string    // folder icon emoji
  color: string    // folder accent color hex (e.g. '#3b82f6')
  collapsed: boolean  // whether folder is collapsed in sidebar
}

export interface CustomConversationTemplate {
  id: string           // 'ctpl-' + timestamp
  emoji: string        // emoji icon
  title: string        // template name (max 50 chars)
  description: string  // short description (max 200 chars)
  category: 'work' | 'writing' | 'learning' | 'personal' | 'custom'
  initialPrompt: string  // the prompt to send when using this template
  createdAt: number      // epoch ms
}

export interface ApiKeyEntry {
  id: string           // unique id
  label: string        // display label (e.g. 'Key 1', 'Work Key')
  apiKey: string       // the API key
  baseUrl?: string     // optional custom base URL (for OpenAI-compatible endpoints)
  enabled: boolean     // whether this key is enabled in the pool
  exhausted: boolean   // whether this key hit quota limit (auto-set on 402)
  addedAt: number      // epoch ms
  /**
   * Models this key can run, as fetched from /v1/models (never the stored
   * union). The pool owns this list; the global `availableModels` prefs field
   * is the deduped union of every entry's `models`, because that is what the
   * model pickers and the main process read. Absent until a fetch succeeds.
   */
  models?: AvailableModel[]
}

export interface TextSnippet {
  id: string           // unique id
  keyword: string      // trigger keyword (e.g., 'sig', 'email', 'addr') -- \w{1,32}, no spaces (see snippetRules.ts)
  content: string      // snippet content to insert (max 4000 chars)
}

export interface Note {
  id: string           // unique id (timestamp-based)
  title: string        // note title
  content: string      // note content (plain text, max 10000 chars)
  createdAt: number    // epoch ms
  updatedAt: number    // epoch ms
  categoryId?: string  // references NoteCategory.id; undefined = uncategorized
  pinned?: boolean     // pinned notes sort to top of the list
}

export interface NoteCategory {
  id: string           // 'notecat-' + timestamp + random
  name: string         // max 20 characters
  color: string        // preset hex color
  emoji?: string       // optional emoji for category display
  createdAt: number    // epoch ms
}

export interface CustomPromptTemplate {
  id: string           // uuid
  name: string         // display name
  prompt: string       // system prompt text
  createdAt: number    // timestamp
  updatedAt: number    // timestamp
}

export interface Persona {
  id: string           // 'persona-' + timestamp
  name: string         // display name (max 30 chars)
  emoji: string        // emoji avatar (single emoji, e.g. '🧑‍💼')
  model: string        // preferred model ID (e.g. 'claude-sonnet-4-6')
  systemPrompt: string // system prompt text
  color: string        // badge/accent color hex
  presetKey?: string   // if this is an installed preset, the i18n key root (e.g. 'writingCoach')
  outputStyle?: 'default' | 'explanatory' | 'learning'  // per-persona output style
  createdAt: number    // epoch ms
  updatedAt: number    // epoch ms
}

export type MemoryCategory = 'preference' | 'fact' | 'instruction' | 'context'

/**
 * Claude Code-aligned memory type taxonomy (Iteration 480).
 * Maps to the 4 canonical types from Claude Code's memoryTypes.ts:
 * - user: about the user's role/goals/knowledge
 * - feedback: guidance on how to approach work (corrections + validations)
 * - project: ongoing work, goals, deadlines, decisions
 * - reference: pointers to external systems/resources
 */
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export interface MemoryItem {
  id: string              // 'mem-' + timestamp + random
  content: string         // the memory content text (max 500 chars)
  category: MemoryCategory // legacy display category
  memoryType?: MemoryType  // Claude Code-aligned semantic type (optional, new in Iteration 480)
  pinned?: boolean        // pinned memories stay at top
  createdAt: number       // epoch ms
  updatedAt: number       // epoch ms
  source?: string         // optional: which session it came from
}

export type WorkflowNodeType = 'prompt' | 'condition' | 'parallel' | 'note'

export interface WorkflowStep {
  id: string              // 'step-' + timestamp + random
  title: string           // step display name (max 50 chars)
  prompt: string          // the prompt text to send (max 2000 chars)
  nodeType?: WorkflowNodeType  // default: 'prompt'
  condition?: string           // for condition nodes: the condition text
  branches?: { label: string; prompt: string }[]  // for condition: [{label:'Yes', prompt:'...'}, {label:'No', prompt:'...'}]
  parallelPrompts?: string[]   // for parallel nodes: list of prompts to run simultaneously
  canvasPos?: { x: number; y: number }   // user-dragged position override
  groupId?: string        // P4.1: group membership — steps sharing a groupId are visually grouped
  groupLabel?: string     // P4.1: display label for the group (only meaningful on first step of group)
  nodeColor?: string      // user-assigned accent color for left border / status dot (CSS color string)
}

export interface Workflow {
  id: string              // 'wf-' + timestamp + random
  name: string            // workflow name (max 50 chars)
  description: string     // short description (max 200 chars)
  steps: WorkflowStep[]   // ordered list of steps (max 20)
  icon: string            // emoji icon
  presetKey?: string      // if this is an installed preset, the i18n key root (e.g. 'weeklyReport')
  /**
   * Expert a scheduled automation runs this workflow as. Undefined = the plain
   * assistant. Manual "Run" is unaffected: it uses the open conversation's expert.
   */
  personaId?: string
  teamwork?: boolean      // true = multi-agent teamwork workflow, false/undefined = single-agent workflow
  /**
   * Where this workflow came from, when it was drafted from a conversation.
   * Absent for hand-made workflows and for every workflow saved before wave 65,
   * so the detail page renders no line rather than an "unknown source".
   *
   * `sourceDraftedAt` is the local calendar date (YYYY-MM-DD) the draft was
   * saved, not the record's `createdAt` epoch: `createdAt` already means "when
   * this record was created" — sorting, run stats and staleness compare it as
   * an instant — so reusing it would silently redefine a number every stored
   * workflow already relies on. The line also needs a day, not an instant: it
   * is stamped once from the user's own clock at save time, exactly like a
   * skill's `created_at`, and must not shift with a timezone or a later edit.
   */
  sourceConversation?: string
  sourceTitle?: string
  sourceDraftedAt?: string
  createdAt: number       // epoch ms
  updatedAt: number       // epoch ms
  runCount: number        // how many times this workflow has been run
}

/**
 * A workflow kept in the "Recently deleted" holding area.
 *
 * `deletedAt` is an instant, not a display date: the purge compares it with
 * the retention window, and the row derives "removes on <date>" from it.
 */
export interface TrashedWorkflow {
  workflow: Workflow
  deletedAt: number
}

export type ScheduleRepeat = 'once' | 'daily' | 'weekly' | 'monthly'

export interface ScheduledPrompt {
  id: string               // 'sched-' + timestamp + random
  name: string             // display name (max 50 chars)
  prompt: string           // the prompt text to send (max 2000 chars)
  icon: string             // emoji icon
  repeat: ScheduleRepeat   // recurrence pattern
  hour: number             // 0-23, hour of day to execute
  minute: number           // 0-59, minute to execute
  dayOfWeek?: number       // 0-6 (Sun-Sat), only used for 'weekly'
  dayOfMonth?: number      // 1-31, only used for 'monthly'
  enabled: boolean         // whether the schedule is active
  lastRunAt?: number       // epoch ms of last execution
  nextRunAt: number        // epoch ms of next planned execution
  runCount: number         // how many times this has been run
  createdAt: number        // epoch ms
  updatedAt: number        // epoch ms
}

export interface PromptHistoryItem {
  id: string              // 'ph-' + hash of normalized text
  text: string            // the prompt text (first 500 chars)
  count: number           // how many times this exact prompt was sent
  lastUsedAt: number      // epoch ms of most recent use
  firstUsedAt: number     // epoch ms of first use
  favorite?: boolean      // starred for quick access
}
