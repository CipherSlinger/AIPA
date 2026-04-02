// Conversation Templates — built-in and custom template definitions (Iteration 416)

export type TemplateCategory = 'work' | 'writing' | 'learning' | 'personal' | 'custom'

export interface ConversationTemplate {
  id: string
  emoji: string
  titleKey: string        // i18n key
  descriptionKey: string  // i18n key
  category: TemplateCategory
  promptKey: string       // i18n key for built-in prompt text
  isBuiltIn: true
}

export interface CustomConversationTemplate {
  id: string
  emoji: string
  title: string
  description: string
  category: TemplateCategory
  initialPrompt: string
  isBuiltIn: false
  createdAt: number
}

export type AnyTemplate = ConversationTemplate | CustomConversationTemplate

export const TEMPLATE_CATEGORIES: { key: TemplateCategory; labelKey: string }[] = [
  { key: 'work', labelKey: 'convTemplate.work' },
  { key: 'writing', labelKey: 'convTemplate.writing' },
  { key: 'learning', labelKey: 'convTemplate.learning' },
  { key: 'personal', labelKey: 'convTemplate.personal' },
  { key: 'custom', labelKey: 'convTemplate.custom' },
]

export const BUILT_IN_TEMPLATES: ConversationTemplate[] = [
  {
    id: 'tpl-email-drafter',
    emoji: '\u2709\uFE0F',
    titleKey: 'convTemplate.emailDrafter',
    descriptionKey: 'convTemplate.emailDrafterDesc',
    category: 'work',
    promptKey: 'convTemplate.emailDrafterPrompt',
    isBuiltIn: true,
  },
  {
    id: 'tpl-meeting-notes',
    emoji: '\uD83D\uDDD2\uFE0F',
    titleKey: 'convTemplate.meetingNotes',
    descriptionKey: 'convTemplate.meetingNotesDesc',
    category: 'work',
    promptKey: 'convTemplate.meetingNotesPrompt',
    isBuiltIn: true,
  },
  {
    id: 'tpl-doc-summary',
    emoji: '\uD83D\uDCC4',
    titleKey: 'convTemplate.docSummary',
    descriptionKey: 'convTemplate.docSummaryDesc',
    category: 'work',
    promptKey: 'convTemplate.docSummaryPrompt',
    isBuiltIn: true,
  },
  {
    id: 'tpl-weekly-report',
    emoji: '\uD83D\uDCCA',
    titleKey: 'convTemplate.weeklyReport',
    descriptionKey: 'convTemplate.weeklyReportDesc',
    category: 'work',
    promptKey: 'convTemplate.weeklyReportPrompt',
    isBuiltIn: true,
  },
  {
    id: 'tpl-brainstorm',
    emoji: '\uD83D\uDCA1',
    titleKey: 'convTemplate.brainstorm',
    descriptionKey: 'convTemplate.brainstormDesc',
    category: 'personal',
    promptKey: 'convTemplate.brainstormPrompt',
    isBuiltIn: true,
  },
  {
    id: 'tpl-decision-matrix',
    emoji: '\u2696\uFE0F',
    titleKey: 'convTemplate.decisionMatrix',
    descriptionKey: 'convTemplate.decisionMatrixDesc',
    category: 'personal',
    promptKey: 'convTemplate.decisionMatrixPrompt',
    isBuiltIn: true,
  },
  {
    id: 'tpl-learning-session',
    emoji: '\uD83C\uDF93',
    titleKey: 'convTemplate.learningSession',
    descriptionKey: 'convTemplate.learningSessionDesc',
    category: 'learning',
    promptKey: 'convTemplate.learningSessionPrompt',
    isBuiltIn: true,
  },
  {
    id: 'tpl-travel-planner',
    emoji: '\uD83C\uDF0D',
    titleKey: 'convTemplate.travelPlanner',
    descriptionKey: 'convTemplate.travelPlannerDesc',
    category: 'personal',
    promptKey: 'convTemplate.travelPlannerPrompt',
    isBuiltIn: true,
  },
]

/** Preset emoji choices for custom templates */
export const TEMPLATE_EMOJI_PRESETS = [
  '\uD83D\uDCBC', '\u270D\uFE0F', '\uD83D\uDCDA', '\u2764\uFE0F',
  '\u2B50', '\uD83D\uDE80', '\u2615', '\uD83C\uDFB5',
  '\uD83D\uDCF7', '\uD83C\uDF10', '\u26A1', '\uD83C\uDFAF',
]

export const MAX_CUSTOM_TEMPLATES = 20
