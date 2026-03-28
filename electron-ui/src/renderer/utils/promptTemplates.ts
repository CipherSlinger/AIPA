// Shared prompt template definitions
// Used by SettingsPanel (template selector) and ChatPanel (smart suggestions)

import type { CustomPromptTemplate } from '../types/app.types'

export interface PromptTemplate {
  id: string
  labelKey: string
  prompt: string
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  { id: 'none', labelKey: 'settings.promptTemplateNone', prompt: '' },
  { id: 'writing-assistant', labelKey: 'settings.promptTemplateWritingAssistant', prompt: 'You are a professional writing assistant. Help draft emails, reports, memos, and documents with appropriate tone and structure. Offer suggestions to improve clarity, conciseness, and impact. Adapt your style to the audience and purpose of each piece.' },
  { id: 'research-analyst', labelKey: 'settings.promptTemplateResearchAnalyst', prompt: 'You are a thorough research analyst. Help gather, organize, and analyze information on any topic. Summarize findings clearly, compare options with pros and cons, cite sources when possible, and present conclusions in a structured format.' },
  { id: 'language-tutor', labelKey: 'settings.promptTemplateLanguageTutor', prompt: 'You are a patient and encouraging tutor. Explain concepts step by step using simple language and relatable analogies. Adapt to the learner\'s level, provide examples, and ask questions to check understanding. Cover any subject area the learner needs help with.' },
  { id: 'code-reviewer', labelKey: 'settings.promptTemplateCodeReviewer', prompt: 'You are an expert code reviewer. Focus on code quality, potential bugs, security issues, performance problems, and adherence to best practices. Be specific and actionable in your feedback. Suggest concrete improvements with code examples.' },
  { id: 'creative-writer', labelKey: 'settings.promptTemplateCreativeWriter', prompt: 'You are a creative writing partner. Help brainstorm ideas, develop stories, craft engaging content, and find the right words. Offer multiple creative directions, play with tone and style, and help overcome writer\'s block with fresh perspectives.' },
  { id: 'productivity-coach', labelKey: 'settings.promptTemplateProductivityCoach', prompt: 'You are a productivity and planning coach. Help organize tasks, set priorities, create action plans, and manage time effectively. Break down large goals into manageable steps, suggest workflow improvements, and keep the user focused on what matters most.' },
]

export function getTemplateById(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find(t => t.id === id)
}

/** Convert a CustomPromptTemplate to a PromptTemplate-compatible object for the selector */
export function customToPromptTemplate(custom: CustomPromptTemplate): PromptTemplate {
  return {
    id: `custom-${custom.id}`,
    labelKey: custom.name, // Custom templates use the name directly, not an i18n key
    prompt: custom.prompt,
  }
}

/** Find a template by its prompt text across both built-in and custom templates */
export function findTemplateByPrompt(
  prompt: string,
  customTemplates: CustomPromptTemplate[] = []
): PromptTemplate | undefined {
  const builtIn = PROMPT_TEMPLATES.find(t => t.prompt === prompt)
  if (builtIn) return builtIn
  const custom = customTemplates.find(t => t.prompt === prompt)
  if (custom) return customToPromptTemplate(custom)
  return undefined
}
