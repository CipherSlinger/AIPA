# PRD: Smart Welcome Suggestions with Auto Prompt Template
_Version: v1 | Status: Approved | PM: aipa-pm | Date: 2026-03-28_

## One-line Definition
Enhance Welcome Screen suggestion cards to automatically activate the matching prompt template when clicked, providing a more integrated personal assistant experience.

## Background & Motivation
- Welcome Screen has 4 suggestion cards (email, summarize, report, explain)
- Settings has 6 prompt templates (Writing Assistant, Research Analyst, Tutor, Code Reviewer, Creative Writer, Productivity Coach)
- Currently these are disconnected -- clicking a suggestion just sends text, doesn't set the optimal prompt template
- Connecting them creates a smarter assistant that adapts its personality to the task

## Scope

### In Scope
- Each welcome suggestion card optionally specifies a prompt template ID
- When clicked, if a template ID is specified, the system prompt is automatically set before sending
- Toast notification briefly shows which assistant role was activated
- Update i18n strings for the toast

### Out of Scope
- Persisting the template change beyond the current session
- Adding new templates
- Changing the visual layout of the welcome screen

## Detailed Changes

### 1. WelcomeScreen.tsx
- Add optional `templateId` field to each suggestion
- Map: "Draft email" -> "writing-assistant", "Summarize" -> "research-analyst", "Weekly report" -> "writing-assistant", "Explain concept" -> "language-tutor"
- Pass templateId to onSuggestion callback

### 2. ChatPanel.tsx
- When a suggestion is clicked with a templateId, set the system prompt in prefs before sending the message
- Show a brief toast: "Activated: Writing Assistant" or similar

### Acceptance Criteria
- [ ] Clicking a welcome suggestion with a matching template activates that template
- [ ] System prompt is set to the template's prompt text
- [ ] Toast notification shows which role was activated
- [ ] User can still override by changing the template in Settings
- [ ] Build passes with zero errors
