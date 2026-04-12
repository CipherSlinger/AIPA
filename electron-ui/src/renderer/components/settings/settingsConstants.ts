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
  { id: 'system',   label: 'System', labelKey: 'settings.themeSystem', colors: ['rgba(30,30,30,1)', 'rgba(245,245,247,1)', 'rgba(99,102,241,1)', 'rgba(37,99,235,1)'] },
  { id: 'vscode',   label: 'Dark',   labelKey: 'settings.themeDark',  colors: ['rgba(30,30,30,1)', 'rgba(0,122,204,1)', 'rgba(38,79,120,1)', 'rgba(45,45,45,1)'] },
  { id: 'light',    label: 'Light',  labelKey: 'settings.themeLight', colors: ['rgba(245,245,247,1)', 'rgba(37,99,235,1)', 'rgba(234,235,238,1)', 'rgba(237,237,240,1)'] },
]

export const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  padding: '6px 10px',
  color: 'rgba(255,255,255,0.82)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'all 0.15s ease',
}
