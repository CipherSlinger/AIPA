// WelcomeScreen constants — extracted from WelcomeScreen.tsx (Iteration 223)
import { Mail, FileText, ClipboardList, Lightbulb, Settings, Terminal, FolderOpen, Keyboard, LucideIcon } from 'lucide-react'
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

/** Default conversation starter suggestions */
export function getDefaultSuggestions(t: (key: string) => string): StarterItem[] {
  return [
    { icon: Mail, text: t('welcome.suggestion.draftEmail'), templateId: 'writing-assistant' },
    { icon: FileText, text: t('welcome.suggestion.summarizeDoc'), templateId: 'research-analyst' },
    { icon: ClipboardList, text: t('welcome.suggestion.weeklyReport'), templateId: 'writing-assistant' },
    { icon: Lightbulb, text: t('welcome.suggestion.explainConcept'), templateId: 'language-tutor' },
  ]
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
    { label: t('welcome.openTerminal'), icon: Terminal, shortcut: 'Ctrl+`', action: () => useUiStore.getState().toggleTerminal() },
    { label: t('welcome.openFiles'), icon: FolderOpen, shortcut: 'Ctrl+B', action: () => { useUiStore.getState().setSidebarOpen(true); useUiStore.getState().setSidebarTab('files') } },
    { label: t('welcome.showShortcuts'), icon: Keyboard, shortcut: 'Ctrl+/', action: () => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: '/' })) },
  ]
}
