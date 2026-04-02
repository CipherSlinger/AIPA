# PRD: Conversation Templates & Quick Start

_Author: aipa-pm | Date: 2026-04-02_

## Context

AIPA already has conversation starters on the WelcomeScreen and persona-specific prompts, but lacks reusable **conversation templates** -- pre-configured conversation setups that combine a system prompt snippet, initial context, and suggested follow-ups. For a personal AI assistant, users frequently perform the same types of tasks (drafting emails, summarizing documents, brainstorming ideas) and would benefit from one-click template launching.

## In Scope

### 1. Conversation Template System

**Problem**: Users repeat the same initial setup (persona + first prompt + working directory) for recurring tasks. There's no way to save and reuse a "conversation recipe."

**Solution**:
- Add a "Templates" section to the WelcomeScreen, below the quick actions grid
- Templates are cards showing: icon, title, description, category badge
- Built-in templates (6-8 presets): Email Drafter, Meeting Notes, Document Summary, Weekly Report, Brainstorm Session, Decision Matrix, Learning Session, Travel Planner
- Each template defines: `{ id, icon, title, description, category, initialPrompt, systemContext?, suggestedFollowUps? }`
- Clicking a template auto-sends the initialPrompt to start the conversation
- Templates are stored in a new `conversationTemplates.ts` constants file (similar to welcomeScreenConstants.ts)
- Template names and descriptions are i18n-ized

**Impact**: WelcomeScreen.tsx (template grid section), conversationTemplates.ts (new), en.json + zh-CN.json

### 2. Custom Template Creation

**Problem**: Built-in templates won't cover every user's needs. Users should be able to create their own templates from successful conversations.

**Solution**:
- Add "Save as Template" action in the ChatHeader dropdown menu (next to Export)
- When saving, a small dialog collects: template name, icon (emoji picker, 12 presets), category
- The first user message becomes the template's initialPrompt
- Custom templates appear alongside built-in templates on WelcomeScreen, with a "Custom" badge
- Custom templates stored in electron-store preferences
- Maximum 20 custom templates
- Edit/Delete custom templates via a small inline menu on hover

**Impact**: ChatHeader.tsx (save as template action), WelcomeScreen.tsx (custom templates section), app.types.ts (ConversationTemplate type), en.json + zh-CN.json

### 3. Template Categories & Filtering

**Problem**: With 6-8 built-in + up to 20 custom templates, the list could get long.

**Solution**:
- Categories: "Work" (briefcase icon), "Writing" (pen icon), "Learning" (book icon), "Personal" (heart icon), "Custom" (star icon)
- Category filter pills at the top of the templates section
- "All" shows everything (default)
- Category is optional when creating custom templates (defaults to "Custom")

**Impact**: WelcomeScreen.tsx (category filter UI), conversationTemplates.ts (category definitions)

## Out of Scope

- Template marketplace / sharing
- Template versioning
- Templates with multiple steps (that's what Workflows are for)
- Template import/export

## Success Criteria

- 6-8 built-in templates visible on WelcomeScreen
- Clicking a template starts a conversation with the template's prompt
- Users can save current conversation as a custom template
- Category filters work
- All text i18n-ized (en + zh-CN)
- Build succeeds
