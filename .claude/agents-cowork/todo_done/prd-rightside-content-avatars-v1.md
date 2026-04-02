# PRD: Right-Side Content Pages & Avatar Presets

_Author: aipa-pm (agent-leader acting) | Date: 2026-04-02_

## Context

Currently, Settings opens as a modal overlay, and persona/workflow editing uses inline forms or small modals. User feedback requests using the right-side main content area for these operations, reducing popup usage. Additionally, the avatar picker needs Luo Xiaohei preset avatars.

## In Scope

### 1. Settings as Right-Side Page (Replace Modal)

**Problem**: Settings opens as a centered modal overlay that obscures the chat. The right-side main content area (ChatPanel) is wasted space during settings editing.

**Solution**:
- When user opens Settings (via NavRail gear icon or Ctrl+,), replace the ChatPanel with a full SettingsPage component
- No modal overlay -- Settings renders inline in the main content area
- Add a "Back to Chat" button or breadcrumb at top of SettingsPage
- Pressing Escape or clicking the NavRail chat icon returns to chat
- The sidebar remains visible alongside Settings
- Remove SettingsModal.tsx entirely
- SettingsPanel.tsx content stays the same, just rendered in main area instead of modal

**Impact**: AppShell.tsx (conditional render: ChatPanel vs SettingsPage), useUiStore (add mainView: 'chat' | 'settings' | ...), SettingsModal.tsx (delete), NavRail.tsx (settings click handler)

### 2. Persona/Workflow Edit as Right-Side Page

**Problem**: Creating or editing a persona/workflow happens in small forms within the sidebar panel. This is cramped for longer system prompts.

**Solution**:
- When clicking "New Persona" or "Edit" on existing persona, the right side switches to PersonaEditorPage
- PersonaEditorPage shows the persona form fields at full width (name, emoji, color, system prompt textarea)
- System prompt textarea gets full height (no cramped sidebar constraint)
- Same for workflows: clicking a workflow or "New Workflow" opens WorkflowEditorPage in right side
- Add "Save & Back" and "Cancel" buttons at top
- Sidebar stays visible -- user can see persona/workflow list while editing

**Impact**: AppShell.tsx (add mainView states), PersonaForm.tsx (adapt for full-width page), WorkflowStepEditor.tsx (adapt for full-width page), useUiStore (mainView state + editing item ID), WorkflowPersonasSection.tsx + SettingsPersonas.tsx (change edit click handlers)

### 3. Luo Xiaohei Preset Avatars

**Problem**: The avatar picker (NavRail bottom avatar) needs preset avatar images.

**Solution**:
- Add 6-8 Luo Xiaohei themed preset avatars as colored circle/emoji avatars
- Use character-inspired color themes: Xiaohei (black), Xiaobai (white/light), Wuxian (blue/gold), Luozhu (green), Bidou (orange), Fengxi (purple)
- Each preset has: name, emoji, background color
- In the avatar section (NavRail), add an AvatarPicker dropdown showing preset grid
- Clicking a preset sets it as user avatar
- Store selected avatar preset in preferences (electron-store)
- Avatar shows in NavRail bottom section

**Impact**: NavRail.tsx (avatar display + picker), usePrefsStore (avatarPreset), en.json + zh-CN.json

## Out of Scope

- Workflow canvas as right-side page (already exists)
- Avatar image upload from local files
- Persona/workflow import/export (existing feature)
- Nested routing or URL-based navigation

## Success Criteria

- Settings opens in right-side content area, not as modal
- Persona editor opens in right-side area with full-width form
- Workflow editor opens in right-side area with full-width form
- 6-8 Luo Xiaohei-themed preset avatars available
- SettingsModal.tsx is removed
- Build succeeds
- All i18n keys added (en + zh-CN)
