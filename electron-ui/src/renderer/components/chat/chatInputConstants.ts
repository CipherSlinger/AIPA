import { FileText, Languages, PenLine, CircleHelp, SpellCheck } from 'lucide-react'

// Placeholder suggestion i18n keys
export const PLACEHOLDER_KEYS = [
  'chat.placeholders.default',
  'chat.placeholders.draftEmail',
  'chat.placeholders.summarize',
  'chat.placeholders.weeklyReport',
  'chat.placeholders.explainConcept',
  'chat.placeholders.organize',
  'chat.placeholders.translate',
  'chat.placeholders.helpCode',
]

// Clipboard quick-action definitions
export const CLIPBOARD_ACTIONS = [
  { id: 'summarize', icon: FileText, labelKey: 'clipboard.summarize', template: 'Please summarize the following text concisely:\n\n{text}' },
  { id: 'translate', icon: Languages, labelKey: 'clipboard.translate', templateEn: 'Please translate the following text to Chinese:\n\n{text}', templateZh: 'Please translate the following text to English:\n\n{text}' },
  { id: 'rewrite', icon: PenLine, labelKey: 'clipboard.rewrite', template: 'Please rewrite the following text to be more clear and professional:\n\n{text}' },
  { id: 'explain', icon: CircleHelp, labelKey: 'clipboard.explain', template: 'Please explain the following text in simple terms:\n\n{text}' },
  { id: 'grammar', icon: SpellCheck, labelKey: 'clipboard.grammar', template: 'Please check the following text for grammar and spelling errors, and provide corrections:\n\n{text}' },
] as const

// Shared toolbar button style
export const toolbarBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--input-toolbar-icon)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  flexShrink: 0,
  transition: 'color 150ms, background 150ms',
}

export const toolbarHoverIn = (e: React.MouseEvent<HTMLButtonElement>) => {
  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--input-toolbar-hover)'
  ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
}

export const toolbarHoverOut = (e: React.MouseEvent<HTMLButtonElement>) => {
  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--input-toolbar-icon)'
  ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
}
