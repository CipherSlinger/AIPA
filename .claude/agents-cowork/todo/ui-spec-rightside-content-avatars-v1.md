# UI Spec: Right-Side Content Pages & Avatar Presets

_Author: aipa-ui (agent-leader acting) | Date: 2026-04-02_
_Source PRD: prd-rightside-content-avatars-v1.md_

## 1. Settings as Right-Side Page

### Visual Design

**AppShell layout change**:
- Add `mainView` state to useUiStore: 'chat' | 'settings' | 'persona-editor' | 'workflow-editor'
- Default: 'chat' (shows ChatPanel as today)
- When mainView is 'settings', render SettingsPage instead of ChatPanel
- The three-column layout stays: NavRail | Sidebar | MainContent(SettingsPage)

**SettingsPage component**:
- Full width of main content area (flex: 1)
- Top bar: height 44px, background var(--chat-header-bg)
  - Left: back arrow (ArrowLeft icon) + "Settings" title (13px semibold)
  - Right: close button (X icon)
- Content below: render existing SettingsPanel content
- Max-width constraint: 800px centered within the main area for readability
- Background: var(--bg-chat)
- Scrollable content area

**Navigation**:
- NavRail settings gear icon: toggles mainView between 'chat' and 'settings'
- Escape key: returns to 'chat'
- Active state: gear icon highlighted when mainView is 'settings'

## 2. Persona/Workflow Editor as Right-Side Page

### Visual Design

**PersonaEditorPage**:
- Same top bar pattern as SettingsPage (44px, back arrow + "Edit Persona" title)
- Form layout: single column, max-width 600px centered
- Fields stack vertically with 16px gap:
  - Row 1: Emoji picker (48px circle) + Name input (flex: 1) + Color picker
  - Row 2: Description textarea (3 lines)
  - Row 3: System prompt textarea (flex: 1, fills remaining space, min-height 200px)
- Bottom bar: "Cancel" (ghost button) + "Save" (primary blue button), right-aligned
- For new persona: title shows "New Persona" / "新建角色"
- For editing: title shows persona name

**WorkflowEditorPage**:
- Same top bar pattern
- Form layout: name input + description + step list
- Step list: each step is a card with title input + prompt textarea
- Add step button at bottom
- More spacious than sidebar version

### Triggering

- WorkflowPersonasSection: "New Persona" and "Edit" buttons set mainView to 'persona-editor' and store editing persona ID (null for new)
- SettingsPersonas: same behavior
- WorkflowPanel: "New Workflow" and workflow click set mainView to 'workflow-editor' and store editing workflow ID

## 3. Luo Xiaohei Preset Avatars

### Visual Design

**AvatarPicker dropdown**:
- Triggered by clicking the avatar circle in NavRail bottom
- Dropdown appears above the avatar (position: absolute, bottom: 100%)
- Size: 200px wide, auto height
- Background: var(--popup-bg), border-radius 8px, shadow
- Title: "Choose Avatar" / "选择头像" (10px, muted)
- Grid: 4 columns, 40px cells
- Each cell: colored circle with emoji, hover: scale(1.1)

**Preset avatars** (Luo Xiaohei theme):

| Name | Emoji | Background | Border |
|------|-------|------------|--------|
| Xiaohei | :black_cat: | #1a1a2e | #4a4a6a |
| Xiaobai | :white_circle: | #f0f0f0 | #d0d0d0 |
| Wuxian | :crystal_ball: | #1e3a5f | #4a8bc2 |
| Luozhu | :herb: | #1a3a2e | #4a8a6a |
| Bidou | :fire: | #5a2a0e | #c27a3a |
| Fengxi | :cyclone: | #3a1a5e | #8a4ac2 |
| Argen | :star2: | #5a4a1e | #c2b24a |
| Tianhu | :cloud: | #2a3a4e | #6a8aaa |

**Selected state**: blue ring (2px solid var(--accent)) around selected avatar
**Current avatar display**: in NavRail, show selected preset emoji in colored circle (replace generic User icon)

### Data Model

```ts
// In usePrefsStore
avatarPreset: string | null  // preset ID or null for default
```

## I18n Keys

```
settings.backToChat
persona.editor.title / persona.editor.newTitle
workflow.editor.title / workflow.editor.newTitle
editor.save / editor.cancel / editor.saveAndBack
avatar.choose / avatar.presets
avatar.xiaohei / avatar.xiaobai / avatar.wuxian / avatar.luozhu
avatar.bidou / avatar.fengxi / avatar.argen / avatar.tianhu
```
