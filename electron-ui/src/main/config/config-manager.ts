import Store from 'electron-store'
import { safeStorage } from 'electron'
import { createLogger } from '../utils/logger'

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
  theme: 'vscode' | 'modern' | 'minimal'
  onboardingDone: boolean
  // Multi-model provider support (Iteration 301)
  modelProviders: unknown[]
  activeProviderId: string
  // Window state persistence (Iteration 325)
  windowBounds: { x: number; y: number; width: number; height: number; isMaximized: boolean } | null
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
    theme: 'vscode',
    onboardingDone: false,
    modelProviders: [],
    activeProviderId: 'claude-cli',
    windowBounds: null,
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
  store.clear()
}
