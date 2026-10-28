/**
 * Shared types and bounds for AIPA's background memory consolidation
 * ("dream") pass.
 *
 * These live in one module so the consolidator, the persisted store, the
 * transcript reader and the renderer-facing IPC can all agree on the shape of
 * a pass without importing Electron or Node.
 */

export type DreamMemoryKind = 'user' | 'feedback' | 'project' | 'reference'

export type DreamPassStatus = 'written' | 'empty' | 'junk' | 'unavailable' | 'error'

export type DreamEngine = 'codex' | 'claude'

/** One candidate returned by the extraction turn. */
export interface DreamCandidate {
  statement: string
  kind: DreamMemoryKind
  confidence: number
}

/** A single normalised conversation turn used to build the digest. */
export interface DreamTurn {
  role: 'user' | 'assistant'
  text: string
  timestamp?: number
}

export interface DreamTranscript {
  sessionId: string
  /** Real working directory when known. */
  cwd?: string
  /** Claude's project directory name; required to resolve the memdir. */
  projectSlug?: string
  turns: DreamTurn[]
  userTurnCount: number
}

/**
 * One consolidation attempt, whether or not it wrote a file.
 *
 * Records are deliberately small: the console can list a failed/empty pass
 * without keeping the model's raw output (which may contain private text).
 */
export interface DreamPassRecord {
  id: string
  status: DreamPassStatus
  createdAt: number
  sessionId: string
  projectSlug: string
  /** Empty unless `status === 'written'`. */
  filePath: string
  entryCount: number
  /** Raw statements written by this pass; used to suppress re-adding them after delete. */
  statements: string[]
  trigger: 'idle' | 'manual'
  /** A machine-readable reason. Never raw model output. */
  note?: string
}

export interface DreamSessionState {
  sessionId: string
  engine?: DreamEngine
  cwd?: string
  projectSlug: string
  /** Successful user turns observed for this session. */
  turnsSeen: number
  /** Turns represented by completed passes (written, empty or discarded). */
  turnsConsolidated: number
  lastActivity: number
  /** Last attempt, successful or not; throttles retries when the model is down. */
  lastAttemptAt?: number
}

export interface DreamStoreData {
  version: 1
  sessions: Record<string, DreamSessionState>
  passes: DreamPassRecord[]
  /** Normalised statements from deleted passes, so they are not re-added. */
  suppressed: string[]
  /** One "model unavailable" notice per outage, not per retry. */
  unavailableNotifiedAt?: number
}

/** Idle time before a conversation is considered finished. */
export const DREAM_IDLE_MS = 10 * 60_000
/** A pass needs this many unconsolidated turns to be worth a model call. */
export const DREAM_MIN_NEW_TURNS = 3
/** Do not retry a failed/unavailable extraction more often than this. */
export const DREAM_RETRY_MS = 6 * 60 * 60_000
export const DREAM_CHECK_INTERVAL_MS = 60_000
/** Startup grace period: let the app settle before a catch-up pass. */
export const DREAM_STARTUP_DELAY_MS = 20_000

/** Hard caps so a verbose model can never bloat the memory tier. */
export const DREAM_DIGEST_BUDGET = 6_000
export const DREAM_EXISTING_BUDGET = 1_600
export const DREAM_MAX_ENTRIES = 5
export const DREAM_MAX_ENTRY_CHARS = 280
export const DREAM_MAX_FILE_CHARS = 4_000
export const DREAM_PASS_RETENTION = 100
export const DREAM_SUPPRESSED_RETENTION = 500

export const DREAM_TURN_TIMEOUT_MS = 120_000

/**
 * The extraction prompt states its input budget in characters so the model
 * cannot be surprised by a truncated transcript.
 */
export const DREAM_INPUT_BUDGET = DREAM_DIGEST_BUDGET + DREAM_EXISTING_BUDGET
