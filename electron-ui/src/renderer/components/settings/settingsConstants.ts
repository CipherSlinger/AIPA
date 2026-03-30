// Settings panel constants — extracted from SettingsPanel.tsx (Iteration 198)

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
  { id: 'system',   label: 'System', labelKey: 'settings.themeSystem', colors: ['#1e1e1e', '#f5f5f7', '#007acc', '#2563eb'] },
  { id: 'vscode',   label: 'Dark',   labelKey: 'settings.themeDark',  colors: ['#1e1e1e', '#007acc', '#264f78', '#2d2d2d'] },
  { id: 'light',    label: 'Light',  labelKey: 'settings.themeLight', colors: ['#f5f5f7', '#2563eb', '#eaebee', '#ededf0'] },
]

export const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '6px 10px',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
}
