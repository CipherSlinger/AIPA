import Store from 'electron-store'

interface StoreSchema {
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
  onboardingDone: boolean
}

const store = new Store<StoreSchema>({
  name: 'claude-code-ui-prefs',
  defaults: {
    apiKey: '',
    model: 'claude-sonnet-4-6',
    workingDir: require('os').homedir(),
    sidebarWidth: 240,
    terminalWidth: 400,
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
    skipPermissions: true,
    verbose: false,
    theme: 'vscode',
    onboardingDone: false,
  },
  encryptionKey: 'claude-code-ui-secret-2024',
})

export function getApiKey(): string {
  return process.env.ANTHROPIC_API_KEY || store.get('apiKey') || ''
}

export function setApiKey(key: string): void {
  store.set('apiKey', key)
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
