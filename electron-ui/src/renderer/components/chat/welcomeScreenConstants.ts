// WelcomeScreen constants — extracted from WelcomeScreen.tsx (Iteration 223, enhanced Iteration 430)
import { Mail, FileText, ClipboardList, Lightbulb, Settings, FolderOpen, Keyboard, ClipboardCopy, Languages, StickyNote, CalendarCheck, LucideIcon } from 'lucide-react'
import { useUiStore } from '../../store'

/** Returns a time-of-day greeting key */
export function getGreetingKey(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'welcome.greetingMorning'
  if (hour >= 12 && hour < 18) return 'welcome.greetingAfternoon'
  return 'welcome.greetingEvening'
}

export interface StarterItem {
  icon: LucideIcon
  text: string
  templateId?: string
}

/** Get persona-specific conversation starters based on persona name */
export function getPersonaStarters(personaName: string | undefined, t: (key: string) => string): StarterItem[] | null {
  if (!personaName) return null
  const name = personaName.toLowerCase()

  if (name.includes('writ')) {
    return [
      { icon: Mail, text: t('welcome.starter.draftEmail') },
      { icon: FileText, text: t('welcome.starter.proofread') },
      { icon: ClipboardList, text: t('welcome.starter.blogPost') },
      { icon: Lightbulb, text: t('welcome.starter.rewriteTone') },
    ]
  }
  if (name.includes('research') || name.includes('analyst')) {
    return [
      { icon: FileText, text: t('welcome.starter.analyzeTopic') },
      { icon: ClipboardList, text: t('welcome.starter.compareOptions') },
      { icon: Lightbulb, text: t('welcome.starter.summarizeArticle') },
      { icon: Mail, text: t('welcome.starter.factCheck') },
    ]
  }
  if (name.includes('creative') || name.includes('art')) {
    return [
      { icon: Lightbulb, text: t('welcome.starter.brainstorm') },
      { icon: FileText, text: t('welcome.starter.storyIdea') },
      { icon: ClipboardList, text: t('welcome.starter.namingIdeas') },
      { icon: Mail, text: t('welcome.starter.creativeAngle') },
    ]
  }
  if (name.includes('tutor') || name.includes('study') || name.includes('teach')) {
    return [
      { icon: Lightbulb, text: t('welcome.starter.explainSimply') },
      { icon: FileText, text: t('welcome.starter.quizMe') },
      { icon: ClipboardList, text: t('welcome.starter.studyPlan') },
      { icon: Mail, text: t('welcome.starter.practiceProblems') },
    ]
  }
  if (name.includes('productiv') || name.includes('coach') || name.includes('plan')) {
    return [
      { icon: ClipboardList, text: t('welcome.starter.planMyDay') },
      { icon: FileText, text: t('welcome.starter.breakdownGoal') },
      { icon: Lightbulb, text: t('welcome.starter.prioritizeTasks') },
      { icon: Mail, text: t('welcome.starter.weeklyReview') },
    ]
  }
  return null
}

/** Full pool of conversation starters, drawn from at random */
const ALL_STARTERS: { iconKey: 'Mail' | 'FileText' | 'ClipboardList' | 'Lightbulb'; textKey: string; templateId?: string }[] = [
  // Writing
  { iconKey: 'Mail', textKey: 'welcome.starter.draftEmail', templateId: 'writing-assistant' },
  { iconKey: 'FileText', textKey: 'welcome.starter.proofread', templateId: 'writing-assistant' },
  { iconKey: 'ClipboardList', textKey: 'welcome.starter.blogPost', templateId: 'writing-assistant' },
  { iconKey: 'Lightbulb', textKey: 'welcome.starter.rewriteTone', templateId: 'writing-assistant' },
  // Research
  { iconKey: 'FileText', textKey: 'welcome.starter.analyzeTopic', templateId: 'research-analyst' },
  { iconKey: 'ClipboardList', textKey: 'welcome.starter.compareOptions', templateId: 'research-analyst' },
  { iconKey: 'Lightbulb', textKey: 'welcome.starter.summarizeArticle', templateId: 'research-analyst' },
  { iconKey: 'Mail', textKey: 'welcome.starter.factCheck', templateId: 'research-analyst' },
  // Creative
  { iconKey: 'Lightbulb', textKey: 'welcome.starter.brainstorm' },
  { iconKey: 'FileText', textKey: 'welcome.starter.storyIdea' },
  { iconKey: 'ClipboardList', textKey: 'welcome.starter.namingIdeas' },
  // Learning
  { iconKey: 'Lightbulb', textKey: 'welcome.starter.explainSimply', templateId: 'language-tutor' },
  { iconKey: 'FileText', textKey: 'welcome.starter.quizMe', templateId: 'language-tutor' },
  { iconKey: 'ClipboardList', textKey: 'welcome.starter.studyPlan', templateId: 'language-tutor' },
  // Productivity
  { iconKey: 'ClipboardList', textKey: 'welcome.starter.planMyDay' },
  { iconKey: 'FileText', textKey: 'welcome.starter.breakdownGoal' },
  { iconKey: 'Lightbulb', textKey: 'welcome.starter.prioritizeTasks' },
  { iconKey: 'Mail', textKey: 'welcome.starter.weeklyReview' },
]

const ICON_MAP: Record<string, LucideIcon> = { Mail, FileText, ClipboardList, Lightbulb }

/** Default conversation starter suggestions — picks 4 random starters from the full pool */
export function getDefaultSuggestions(t: (key: string) => string): StarterItem[] {
  // Shuffle and pick 4, ensuring varied icons
  const shuffled = [...ALL_STARTERS].sort(() => Math.random() - 0.5)
  const picked: typeof ALL_STARTERS[number][] = []
  const usedIcons = new Set<string>()
  // First pass: pick one per icon to ensure variety
  for (const item of shuffled) {
    if (picked.length >= 4) break
    if (!usedIcons.has(item.iconKey)) {
      usedIcons.add(item.iconKey)
      picked.push(item)
    }
  }
  // Second pass: fill remaining slots
  for (const item of shuffled) {
    if (picked.length >= 4) break
    if (!picked.includes(item)) {
      picked.push(item)
    }
  }
  return picked.map(item => ({
    icon: ICON_MAP[item.iconKey],
    text: t(item.textKey),
    templateId: item.templateId,
  }))
}

export interface ShortcutDef {
  keys: string
  desc: string
}

export function getShortcuts(t: (key: string) => string): ShortcutDef[] {
  return [
    { keys: 'Ctrl+Shift+Space', desc: t('welcome.shortcut.toggleWindow') },
    { keys: 'Ctrl+Shift+G', desc: t('welcome.shortcut.clipboardAction') },
    { keys: 'Ctrl+Shift+P', desc: t('welcome.shortcut.commandPalette') },
    { keys: 'Ctrl+B', desc: t('welcome.shortcut.toggleSidebar') },
    { keys: 'Ctrl+L', desc: t('welcome.shortcut.focusInput') },
    { keys: '@file', desc: t('welcome.shortcut.referenceFiles') },
  ]
}

export interface QuickAction {
  label: string
  icon: LucideIcon
  shortcut: string
  action: () => void
}

export function getQuickActions(t: (key: string) => string): QuickAction[] {
  return [
    { label: t('welcome.openSettings'), icon: Settings, shortcut: 'Ctrl+,', action: () => { useUiStore.getState().openSettingsModal() } },
    { label: t('welcome.openFiles'), icon: FolderOpen, shortcut: 'Ctrl+B', action: () => { useUiStore.getState().setSidebarOpen(true); useUiStore.getState().setSidebarTab('files') } },
    { label: t('welcome.showShortcuts'), icon: Keyboard, shortcut: 'Ctrl/', action: () => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: '/' })) },
  ]
}

/** Time-contextual suggestion prompts — adapted to time of day */
export interface TimeSuggestion {
  icon: LucideIcon
  textKey: string
}

export function getTimeSuggestions(t: (key: string) => string): TimeSuggestion[] {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) {
    return [
      { icon: CalendarCheck, textKey: 'welcome.timeSuggestion.planDay' },
      { icon: Mail, textKey: 'welcome.timeSuggestion.reviewEmails' },
      { icon: FileText, textKey: 'welcome.timeSuggestion.morningBrief' },
    ]
  }
  if (hour >= 12 && hour < 18) {
    return [
      { icon: FileText, textKey: 'welcome.timeSuggestion.summarizeMorning' },
      { icon: Mail, textKey: 'welcome.timeSuggestion.draftUpdate' },
      { icon: Lightbulb, textKey: 'welcome.timeSuggestion.afternoonFocus' },
    ]
  }
  return [
    { icon: CalendarCheck, textKey: 'welcome.timeSuggestion.tomorrowAgenda' },
    { icon: FileText, textKey: 'welcome.timeSuggestion.dailySummary' },
    { icon: Lightbulb, textKey: 'welcome.timeSuggestion.eveningReflect' },
  ]
}

/** Clipboard-based quick actions for the floating action bar */
export interface FloatingAction {
  label: string
  icon: LucideIcon
  prompt: string
}

export function getFloatingActions(t: (key: string) => string): FloatingAction[] {
  return [
    { label: t('welcome.floatingAction.summarizeClipboard'), icon: ClipboardCopy, prompt: t('welcome.floatingAction.summarizeClipboardPrompt') },
    { label: t('welcome.floatingAction.translateClipboard'), icon: Languages, prompt: t('welcome.floatingAction.translateClipboardPrompt') },
    { label: t('welcome.floatingAction.quickNote'), icon: StickyNote, prompt: t('welcome.floatingAction.quickNotePrompt') },
    { label: t('welcome.floatingAction.todaysTasks'), icon: CalendarCheck, prompt: t('welcome.floatingAction.todaysTasksPrompt') },
  ]
}
