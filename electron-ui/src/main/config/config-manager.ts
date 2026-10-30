import Store from 'electron-store'
import { safeStorage } from 'electron'
import { createLogger } from '../utils/logger'
import { clearAllowedRoots } from '../utils/allowed-roots'

const log = createLogger('config-manager')

interface StoreSchema {
  apiKeyEncrypted: string
  apiKey: string  // legacy plaintext field — migrated on first read
  model: string
  workingDir: string
  sidebarWidth: number
  terminalWidth: number
  fontSize: number
  fontFamily: string
  skipPermissions: boolean
  permissionMode: 'default' | 'acceptEdits' | 'dontAsk' | 'plan' | 'bypassPermissions'
  verbose: boolean
  theme: 'vscode' | 'light' | 'system' | 'modern' | 'minimal'
  onboardingDone: boolean
  // Multi-model provider support (Iteration 301). The provider subsystem is
  // gone: AI now runs only on the app API key plus the built-in model list.
  // These fields stay so existing stores keep their shape and no migration
  // deletes what the user configured; nothing reads them any more.
  modelProviders: unknown[]
  activeProviderId: string
  // Window state persistence (Iteration 325)
  windowBounds: { x: number; y: number; width: number; height: number; isMaximized: boolean } | null
  // Clawd desktop pet (Iteration 685)
  clawdEnabled: boolean
  /**
   * Summon the desktop pet for background attention events (approval waiting,
   * clarification needed, task failed, plugin job finished). Default on; only
   * fires while the main window is hidden, minimised or unfocused.
   */
  petAttentionAlerts: boolean
  /**
   * Skin for the pet's attention/notice bubbles. `sao` is the HUD card (dark
   * panel, clipped corners, eyebrow + accent by kind); `clawd` keeps the plain
   * light card. Defaults to `sao` — the richer card is the point of the wave.
   */
  petBubbleTheme: 'sao' | 'clawd'
  /**
   * Say a short greeting from the pet a few seconds after launch. Off is for
   * people who find the pet chatty; the bubble never replaces an attention
   * card and respects DND and "hide bubbles".
   */
  petBootGreeting: boolean
  /**
   * Announce a turn that finished while AIPA was in the background. The pet
   * card replaces the generic native notification; when the pet cannot speak
   * the native one still appears, so this never loses the notice.
   */
  petTurnNotices: boolean
  /**
   * Epoch ms until which the pet keeps quiet (tray "Silence for…"). 0 means
   * not silenced. A deadline rather than a timer so it survives a restart.
   */
  petQuietUntil: number
  /**
   * Show a live activity strip on the pet while a turn runs: what the agent is
   * doing right now, in one card that is updated in place. Silent and never
   * recorded in the announcement history. Default on.
   */
  petActivityStrip: boolean
  /**
   * A quiet "needs you" count drawn on the pet's own hit window: how many tasks
   * are waiting on the user right now. Hidden while the pet is silenced, in DND,
   * or when the pet is hidden. Default on.
   */
  petNeedsYouBadge: boolean
  /**
   * Once a local day, a few seconds after launch, open the task brief beside the
   * pet if anything is unfinished. Opt-in (`false` by default); a skipped day
   * is not retried.
   */
  petMorningBrief: boolean
  /**
   * Background memory consolidation ("dream"): turns idle conversations into
   * append-only project memory files. Default on; the Memory console exposes
   * the switch and its pass log.
   */
  dreamConsolidationEnabled: boolean
  /**
   * Folders the user has granted through an OS folder dialog. The file-system
   * gate treats them as roots alongside home and the working folder, so a
   * project on another drive works once it has been picked. Granted rather than
   * claimed: only the main process writes here, when a dialog returns. See
   * `utils/allowed-roots.ts`.
   */
  allowedFolders: string[]
  /**
   * Each plugin's host-chosen AI "work model", pluginId → model id. An entry
   * exists only while a model is chosen: clearing the picker removes the key.
   * A saved id that is no longer in the built-in model list is kept rather than reverted —
   * the picker reports it as unavailable instead of silently swapping the
   * plugin onto a different model.
   */
  pluginAiModels: Record<string, string>
  /**
   * Models the current API key reported as available. Kept between launches so
   * the pickers still work offline; the built-in catalogue still wins on an id
   * collision.
   */
  availableModels: { id: string; name: string }[]
}

const store = new Store<StoreSchema>({
  name: 'claude-code-ui-prefs',
  defaults: {
    apiKeyEncrypted: '',
    apiKey: '',
    model: 'claude-sonnet-4-6',
    workingDir: require('os').homedir(),
    sidebarWidth: 240,
    terminalWidth: 400,
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
    skipPermissions: false,
    permissionMode: 'default',
    verbose: false,
    theme: 'light',
    onboardingDone: false,
    modelProviders: [],
    activeProviderId: 'claude-cli',
    windowBounds: null,
    clawdEnabled: true,
    petAttentionAlerts: true,
    petBubbleTheme: 'sao',
    petBootGreeting: true,
    petTurnNotices: true,
    petQuietUntil: 0,
    petActivityStrip: true,
    petNeedsYouBadge: true,
    petMorningBrief: false,
    dreamConsolidationEnabled: true,
    allowedFolders: [],
    pluginAiModels: {},
    availableModels: [],
  },
  // Removed hardcoded encryptionKey — API key is now encrypted via safeStorage
})

/**
 * Encrypt an API key using Electron's safeStorage (DPAPI on Windows, Keychain on macOS).
 * Returns base64-encoded ciphertext. Falls back to empty string on failure.
 */
function encryptApiKey(plaintext: string): string {
  if (!plaintext) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('safeStorage not available — storing API key as plaintext (insecure)')
    return plaintext
  }
  try {
    const encrypted = safeStorage.encryptString(plaintext)
    return encrypted.toString('base64')
  } catch (err) {
    log.error('Failed to encrypt API key:', String(err))
    return ''
  }
}

/**
 * Decrypt an API key stored as base64-encoded ciphertext via safeStorage.
 * Returns empty string on failure.
 */
function decryptApiKey(encrypted: string): string {
  if (!encrypted) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    // If safeStorage is not available, the value was stored as plaintext
    return encrypted
  }
  try {
    const buffer = Buffer.from(encrypted, 'base64')
    return safeStorage.decryptString(buffer)
  } catch {
    // Could be old plaintext stored before migration — return as-is
    return encrypted
  }
}

/**
 * One-time migration: move plaintext apiKey to encrypted apiKeyEncrypted.
 */
function migrateApiKey(): void {
  const legacy = store.get('apiKey')
  if (legacy && !store.get('apiKeyEncrypted')) {
    log.info('Migrating API key to safeStorage encryption')
    const encrypted = encryptApiKey(legacy)
    if (encrypted) {
      store.set('apiKeyEncrypted', encrypted)
      store.delete('apiKey' as keyof StoreSchema)
      log.info('API key migration complete')
    }
  }
}

// Run migration on module load (happens when main process starts)
migrateApiKey()

export function getApiKey(): string {
  // Prefer ANTHROPIC_API_KEY environment variable
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const encrypted = store.get('apiKeyEncrypted')
  return decryptApiKey(encrypted)
}

export function setApiKey(key: string): void {
  const encrypted = encryptApiKey(key)
  store.set('apiKeyEncrypted', encrypted)
  // Remove any legacy plaintext key
  if (store.has('apiKey' as keyof StoreSchema)) {
    store.delete('apiKey' as keyof StoreSchema)
  }
}

export function getPref<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
  return store.get(key)
}

export function setPref<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
  store.set(key, value)
}

/** Read/delete keys outside StoreSchema (e.g. legacy renderer-only prefs). */
export function getRawPref(key: string): unknown {
  return (store as unknown as { get: (k: string) => unknown }).get(key)
}

export function deleteRawPref(key: string): void {
  (store as unknown as { delete: (k: string) => void }).delete(key)
}

export function getAllPrefs(): StoreSchema {
  return store.store
}

export function getOnboardingDone(): boolean {
  return store.get('onboardingDone')
}

export function setOnboardingDone(value: boolean): void {
  store.set('onboardingDone', value)
}

export function resetAllPrefs(): void {
  // Grants are part of what this file stores, but the gate reads them from
  // memory. Clearing the store alone would leave that list live, and the next
  // folder pick would write it back — a reset quietly undone. Clear both, and
  // do it first so the failure mode is "no access" rather than "old access".
  clearAllowedRoots()
  store.clear()
}
