import { FileText, Languages, PenLine, CircleHelp, SpellCheck, Code2, Bug, ListChecks, Eye, ScanText } from 'lucide-react'

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

// Content type classification (Iteration 463)
export type PasteContentType = 'code' | 'url' | 'image' | 'long-text' | 'short-text'

// Unified paste action definitions (Iteration 463)
export interface PasteAction {
  id: string
  icon: React.ElementType
  labelKey: string
  contentTypes: PasteContentType[]
  template?: string
  templateEn?: string
  templateZh?: string
}

export const PASTE_ACTIONS: PasteAction[] = [
  // Universal actions (applicable to multiple types)
  { id: 'summarize', icon: FileText, labelKey: 'clipboard.summarize', contentTypes: ['url', 'long-text'], template: 'Please summarize the following text concisely:\n\n{text}' },
  { id: 'translate', icon: Languages, labelKey: 'clipboard.translate', contentTypes: ['url', 'long-text', 'code'], templateEn: 'Please translate the following text to Chinese:\n\n{text}', templateZh: 'Please translate the following text to English:\n\n{text}' },
  { id: 'rewrite', icon: PenLine, labelKey: 'clipboard.rewrite', contentTypes: ['long-text'], template: 'Please rewrite the following text to be more clear and professional:\n\n{text}' },
  { id: 'explain', icon: CircleHelp, labelKey: 'clipboard.explain', contentTypes: ['url', 'long-text', 'code'], template: 'Please explain the following in simple terms:\n\n{text}' },
  { id: 'grammar', icon: SpellCheck, labelKey: 'clipboard.grammar', contentTypes: ['long-text'], template: 'Please check the following text for grammar and spelling errors, and provide corrections:\n\n{text}' },
  // Code-specific actions (Iteration 463)
  { id: 'review', icon: Eye, labelKey: 'paste.review', contentTypes: ['code'], template: 'Please review the following code for quality, readability, and potential issues:\n\n```\n{text}\n```' },
  { id: 'refactor', icon: Code2, labelKey: 'paste.refactor', contentTypes: ['code'], template: 'Please refactor the following code to improve readability and maintainability:\n\n```\n{text}\n```' },
  { id: 'findBugs', icon: Bug, labelKey: 'paste.findBugs', contentTypes: ['code'], template: 'Please analyze the following code for bugs, edge cases, and potential issues:\n\n```\n{text}\n```' },
  // Long text extra action (Iteration 463)
  { id: 'keyPoints', icon: ListChecks, labelKey: 'paste.keyPoints', contentTypes: ['long-text'], template: 'Please extract the key points from the following text as a bullet list:\n\n{text}' },
  // Image actions (Iteration 463) — displayed after image paste
  { id: 'describe', icon: Eye, labelKey: 'paste.describe', contentTypes: ['image'], template: 'Please describe the content of this image in detail.' },
  { id: 'extractText', icon: ScanText, labelKey: 'paste.extractText', contentTypes: ['image'], template: 'Please extract and transcribe all text visible in this image.' },
]

// Backward-compatible alias for ClipboardActionsMenu
export const CLIPBOARD_ACTIONS = PASTE_ACTIONS.filter(a =>
  ['summarize', 'translate', 'rewrite', 'explain', 'grammar'].includes(a.id)
)

/** Detect content type from pasted text (Iteration 463) */
export function detectContentType(text: string): PasteContentType {
  if (!text || !text.trim()) return 'short-text'

  // URL check
  const urlRegex = /^https?:\/\/[^\s<>'"]+$/i
  if (urlRegex.test(text.trim()) && text.length < 500) return 'url'

  // Code detection — heuristic scoring
  const lines = text.split('\n')
  let codeScore = 0

  // Check for common syntax keywords
  const keywords = /\b(function|class|import|export|const|let|var|def|return|if|else|for|while|switch|case|try|catch|throw|async|await|yield|from|interface|type|enum|struct|impl|fn|pub|mod|use|package|namespace)\b/
  if (keywords.test(text)) codeScore += 2

  // Check for programming symbol combinations
  const symbols = /(\(\)\s*=>|[{}]\s*$|===|!==|=>|\|\||&&|::|#include|#define|#import|@Override|@property)/m
  if (symbols.test(text)) codeScore += 2

  // Check for indentation pattern (2+ lines starting with spaces/tabs)
  const indentedLines = lines.filter(l => /^[\t ]{2,}/.test(l))
  if (indentedLines.length >= 2) codeScore += 1

  // Check for line-ending semicolons or braces ratio
  const codeEndLines = lines.filter(l => /[;{}]\s*$/.test(l.trim()))
  if (lines.length > 2 && codeEndLines.length / lines.length > 0.3) codeScore += 1

  if (codeScore >= 3) return 'code'

  // Long text check
  if (text.length > 500) return 'long-text'

  return 'short-text'
}

// Get actions for a specific content type
export function getActionsForType(contentType: PasteContentType): PasteAction[] {
  return PASTE_ACTIONS.filter(a => a.contentTypes.includes(contentType))
}

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
