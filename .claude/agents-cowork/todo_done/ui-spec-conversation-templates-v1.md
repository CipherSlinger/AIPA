# UI Spec: Conversation Templates & Quick Start

_Author: aipa-ui | Date: 2026-04-02_
_Source PRD: prd-conversation-templates-v1.md_

## 1. Templates Section on WelcomeScreen

### Visual Design

**Section placement**: Between the "Suggestion cards" section and the "Keyboard shortcuts" section.

**Section header**:
- Layout: `[FileText 11px icon] [Templates label] [category pills]`
- Font: 11px, color `var(--text-muted)`
- Category pills: inline, small rounded buttons (padding 3px 8px, border-radius 10px)
- Active pill: `background: var(--accent)`, `color: #fff`
- Inactive pill: `background: transparent`, `border: 1px solid var(--card-border)`, `color: var(--text-muted)`
- Categories: All | Work | Writing | Learning | Personal | Custom

**Template cards**:
- Grid: 2 columns, max-width 420px, gap 8px
- Card size: flex, min-height 60px, padding 10px 14px
- Layout per card: `[emoji 24px] [title + description stack]`
- Title: 12px, font-weight 600, color `var(--text-primary)`, single line truncate
- Description: 10px, color `var(--text-muted)`, max 2 lines
- Background: `var(--card-bg)`, border: `1px solid var(--card-border)`, border-radius: 10px
- Hover: `background: var(--action-btn-hover)`, `border-color: var(--accent)`
- Custom templates show a small X delete button on hover

### Built-in Templates (8)

| ID | Emoji | Category | Prompt |
|----|-------|----------|--------|
| email-drafter | envelope | work | Help me draft a professional email |
| meeting-notes | notepad | work | Help me organize meeting notes |
| doc-summary | page | work | Summarize the following document |
| weekly-report | chart | work | Help me write my weekly report |
| brainstorm | bulb | personal | Brainstorm ideas together |
| decision-matrix | scales | personal | Evaluate options with a decision matrix |
| learning-session | graduation | learning | Learn about a new topic step by step |
| travel-planner | globe | personal | Help me plan a trip |

## 2. Save as Template (ChatHeader)

- New dropdown item after Export: Save as Template
- Icon: FilePlus
- Opens small dialog: name input, emoji row (12 presets), category pills
- Cancel + Save buttons
- First user message becomes initialPrompt
- Max 20 custom templates in electron-store

## 3. Data Model

```ts
// conversationTemplates.ts constants
interface ConversationTemplate {
  id: string; emoji: string; titleKey: string; descriptionKey: string;
  category: 'work' | 'writing' | 'learning' | 'personal' | 'custom';
  initialPromptKey: string; isBuiltIn: boolean;
}

// ClaudePrefs addition
customTemplates?: Array<{
  id: string; emoji: string; title: string; description: string;
  category: string; initialPrompt: string; createdAt: number;
}>
```

## I18n Keys

template.section, template.all, template.work, template.writing, template.learning, template.personal, template.custom
template.emailDrafter, template.emailDrafterDesc, template.emailDrafterPrompt
template.meetingNotes, template.meetingNotesDesc, template.meetingNotesPrompt
template.docSummary, template.docSummaryDesc, template.docSummaryPrompt
template.weeklyReport, template.weeklyReportDesc, template.weeklyReportPrompt
template.brainstorm, template.brainstormDesc, template.brainstormPrompt
template.decisionMatrix, template.decisionMatrixDesc, template.decisionMatrixPrompt
template.learningSession, template.learningSessionDesc, template.learningSessionPrompt
template.travelPlanner, template.travelPlannerDesc, template.travelPlannerPrompt
template.saveAsTemplate, template.templateName, template.selectEmoji, template.selectCategory
template.saved, template.deleted, template.maxReached
