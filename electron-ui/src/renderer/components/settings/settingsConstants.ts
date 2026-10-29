// Settings panel constants — extracted from SettingsPanel.tsx (Iteration 198)

/**
 * Canonical settings rail order, with each tab's label key alongside its id.
 * SettingsPanel renders this list and the UI store types deep links
 * (`openSettingsAt` / `pendingSettingsTab`) against it, so a tab only ever needs
 * to be added in one place — and the rail needs no per-tab label special case.
 */
export const SETTINGS_TABS = [
  { id: 'general', labelKey: 'settings.tabs.general' },
  // Snippets sit beside General because both configure the composer: General
  // holds its font and behaviour, Snippets holds the text `::keyword` expands
  // to. Memory is a different concern — what the assistant remembers.
  { id: 'snippets', labelKey: 'settings.tabs.snippets' },
  { id: 'ai-engine', labelKey: 'settings.tabs.ai-engine' },
  { id: 'memory', labelKey: 'settings.tabs.memory' },
  // Main-process scheduler for "do this on its own" jobs — see src/main/automation/.
  { id: 'automations', labelKey: 'settings.tabs.automations' },
  { id: 'permissions', labelKey: 'settings.tabs.permissions' },
  { id: 'stats', labelKey: 'settings.tabs.stats' },
  // Plugins and MCP servers share this page, hence the label key's name.
  { id: 'plugins', labelKey: 'settings.tabs.pluginsAndMcp' },
  // Codex-native, read-only hook list (not the removed Claude hook editor).
  { id: 'hooks', labelKey: 'settings.tabs.hooks' },
  { id: 'advanced', labelKey: 'settings.tabs.advanced' },
  { id: 'about', labelKey: 'settings.tabs.about' },
] as const

export type SettingsTab = typeof SETTINGS_TABS[number]['id']

export const TAG_PRESETS_SETTINGS = [
  { id: 'tag-1', color: '#3b82f6', defaultKey: 'tags.work' },
  { id: 'tag-2', color: '#22c55e', defaultKey: 'tags.personal' },
  { id: 'tag-3', color: '#f59e0b', defaultKey: 'tags.research' },
  { id: 'tag-4', color: '#ef4444', defaultKey: 'tags.debug' },
  { id: 'tag-5', color: '#8b5cf6', defaultKey: 'tags.docs' },
  { id: 'tag-6', color: '#6b7280', defaultKey: 'tags.archive' },
]

export const MODEL_OPTIONS: { id: string; labelKey: string }[] = [
  { id: 'claude-opus-4-6',            labelKey: 'settings.models.opus46' },
  { id: 'claude-sonnet-4-6',          labelKey: 'settings.models.sonnet46' },
  { id: 'claude-haiku-4-5',           labelKey: 'settings.models.haiku45' },
  { id: 'claude-opus-4',              labelKey: 'settings.models.opus4' },
  { id: 'claude-sonnet-4-5',          labelKey: 'settings.models.sonnet45' },
  { id: 'claude-3-7-sonnet-20250219', labelKey: 'settings.models.sonnet37' },
  { id: 'claude-3-5-sonnet-20241022', labelKey: 'settings.models.sonnet35' },
  { id: 'claude-3-5-haiku-20241022',  labelKey: 'settings.models.haiku35' },
]

export const FONT_FAMILIES: { id: string; label: string; labelKey?: string }[] = [
  { id: "'Cascadia Code', 'Fira Code', Consolas, monospace", label: 'Cascadia Code' },
  { id: "'Fira Code', Consolas, monospace",                  label: 'Fira Code' },
  { id: "'JetBrains Mono', Consolas, monospace",             label: 'JetBrains Mono' },
  { id: "Consolas, 'Courier New', monospace",                label: 'Consolas' },
  { id: 'system-ui, sans-serif',                             label: 'System Default', labelKey: 'settings.fontSystemDefault' },
]

export const THEMES: { id: 'vscode' | 'light' | 'system'; label: string; labelKey: string; colors: string[] }[] = [
  { id: 'system',   label: 'System', labelKey: 'settings.themeSystem', colors: ['rgba(30,30,30,1)', 'rgba(245,245,247,1)', 'rgba(99,102,241,1)', 'rgba(37,99,235,1)'] },
  { id: 'vscode',   label: 'Dark',   labelKey: 'settings.themeDark',  colors: ['rgba(30,30,30,1)', 'rgba(0,122,204,1)', 'rgba(38,79,120,1)', 'rgba(45,45,45,1)'] },
  { id: 'light',    label: 'Light',  labelKey: 'settings.themeLight', colors: ['rgba(245,245,247,1)', 'rgba(37,99,235,1)', 'rgba(234,235,238,1)', 'rgba(237,237,240,1)'] },
]

export const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-hover)',
  border: '1px solid var(--glass-border)',
  borderRadius: 7,
  padding: '6px 10px',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'all 0.15s ease',
}

// ── Providers ────────────────────────────────────────────────────────────────
// Shared by SettingsProviders (the list) and ProviderEditDrawer (the detail
// panel). They live here rather than in either component so the drawer can
// import them without creating a cycle back through the list.

export type ProviderScenario = 'official' | 'gateway'

export interface ProviderConfig {
  id: string
  name: string
  scenario: ProviderScenario
  baseUrl?: string
  /** Never populated from the main process — credentials stay there. Only ever
   *  carries a freshly typed value on its way back via providerUpsert. */
  apiKey?: string
  /** Same as apiKey: write-only on the renderer side. */
  authToken?: string
  /** True when a credential is stored in the main process (value not exposed). */
  hasApiKey?: boolean
  hasAuthToken?: boolean
  model?: string
  models: { id: string; name: string; provider: string }[]
  enabled: boolean
  isDefault?: boolean
  failoverPriority?: number
}

export interface ProviderHealthStatus {
  providerId: string
  status: 'healthy' | 'degraded' | 'down'
  lastCheck: number
  lastError?: string
}

export const BUILT_IN_IDS = ['claude-cli', 'gateway', 'openai', 'ollama', 'deepseek', 'qwen']

export const SCENARIO_COLORS: Record<ProviderScenario, string> = {
  official: 'var(--accent-text)',
  gateway: 'var(--warning-text)',
}

/** "Get an API key" deep links, keyed by built-in provider id. */
export const PROVIDER_KEY_LINKS: Record<string, string> = {
  'claude-cli': 'https://console.anthropic.com/settings/keys',
  'openai': 'https://platform.openai.com/api-keys',
  'deepseek': 'https://platform.deepseek.com/api_keys',
  'qwen': 'https://dashscope.console.aliyun.com/apiKey',
  'ollama': 'https://ollama.ai/download',
}
