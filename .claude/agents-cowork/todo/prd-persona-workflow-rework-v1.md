# PRD: Persona & Workflow System Rework

_Author: agent-leader (acting as PM) | Date: 2026-04-02_

## Context

The current persona and workflow systems have usability gaps: they start empty on fresh install, personas use a confusing "global activation" model, and preset prompts don't switch language with the UI.

## In Scope

### 1. Built-in Default Personas and Workflows on First Launch
**Problem**: After initial installation, the Personas and Workflows panels are empty. Users must manually create them, which creates a poor first-run experience.
**Solution**:
- On first launch (when persona/workflow lists are empty), auto-populate with the 5 built-in preset personas and 6 preset workflows
- These should be actual entries in the store, not just UI presets that need manual clicking
- Users can freely edit or delete any of them
- Use the existing preset data (persona presets in PersonaPanel, workflow presets in useWorkflowCrud) but create them as real entries instead of showing them as "click to add" cards
**Impact**: Store initialization logic (usePrefsStore for personas, workflow CRUD), PersonaPanel.tsx, WorkflowPanel.tsx

### 2. Persona Per-Session Instead of Global Activation
**Problem**: Currently there's one globally "activated" persona. This doesn't match how users actually work -- they want different personas for different sessions (a coding session uses "Code Reviewer", a writing session uses "Writing Coach").
**Solution**:
- Remove the global `activePersonaId` concept from `usePrefsStore`
- Add a `personaId` field to each session/conversation
- When creating a new conversation, the user can optionally select a persona
- The persona selector should appear in the ChatHeader area (near the model selector)
- The persona's system prompt is injected into the conversation when the persona is set
- Switching personas mid-session is allowed (updates the system prompt for subsequent messages)
- The "Activate/Deactivate" buttons in PersonaPanel become "Set as Default for New Sessions"
**Impact**: Store (usePrefsStore: remove activePersonaId; useChatStore: add personaId per session), ChatHeader.tsx (persona selector), PersonaPanel.tsx (remove activate/deactivate flow)

### 3. Preset Prompt I18n for Personas and Workflows
**Problem**: When the UI language switches (e.g., en -> zh-CN), the preset persona/workflow prompts remain in their original language.
**Solution**:
- For the 5 built-in preset personas: store a `presetKey` identifier on each
- For the 6 built-in preset workflows: already have `presetKey` -- use it
- When rendering preset personas/workflows, if the entry has a `presetKey`, look up the translated name and system prompt from i18n instead of displaying the stored text
- This means preset names and prompts auto-switch with language, while user-created custom entries remain unchanged
- Add persona preset prompt translations to both en.json and zh-CN.json
**Impact**: i18n locale files (persona preset prompts), PersonaPanel.tsx (conditional i18n rendering), WorkflowPanel.tsx (already partially done for names/descriptions -- extend to step prompts)

## Out of Scope
- Persona auto-detection from conversation content
- Workflow step-level persona switching
- Custom persona import/export (already exists)

## Success Criteria
- Fresh install shows 5 personas and 6 workflows pre-populated
- Each session can independently select a persona from ChatHeader
- No global "activated persona" concept remains
- Switching UI language updates preset persona names and prompts
- Build succeeds
- All i18n keys added
