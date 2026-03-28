# PRD: Settings Decomposition, Lazy Loading & Accessibility Foundations

**Author**: aipa-pm (executed by agent-leader)
**Date**: 2026-03-28
**Iteration**: 198
**Priority**: P1-eng + P1-ux

---

## Problem Statement

1. **SettingsPanel.tsx is 986 lines** -- the third-largest component after SkillsPanel (996) and ChatInput (858). It contains General settings, Templates tab, About tab, and inline sub-components (Toggle, GroupedSettings, SearchFilter). This monolith makes modifications error-prone and slows development.

2. **Bundle is 1,268 KB** (single chunk). Vite warns about chunks >500 KB. Sidebar panels (Settings, Skills, Notes) are loaded eagerly even though users may never open them in a session. React.lazy + Suspense can defer loading until needed.

3. **Accessibility gaps** -- the app has no ARIA attributes on interactive elements, no focus trapping in modal dialogs (CommandPalette, ShortcutCheatsheet, ImageLightbox), and no keyboard navigation for key workflows. This excludes users who rely on assistive technology.

---

## In Scope (3 Features)

### Feature 1: SettingsPanel Decomposition
Extract SettingsPanel.tsx (986 lines) into focused sub-components:
- `SettingsGeneral.tsx` -- the grouped settings sections (AI Engine, Prompts, Appearance, Workspace, Behavior)
- `SettingsTemplates.tsx` -- custom prompt template CRUD
- `SettingsAbout.tsx` -- about tab content
- `settingsConstants.ts` -- TAG_PRESETS_SETTINGS, MODEL_OPTIONS, FONT_FAMILIES, THEMES arrays
- `Toggle.tsx` -- reusable toggle component (currently inline in SettingsPanel)

**Acceptance Criteria**:
- SettingsPanel.tsx reduced to <200 lines (tab routing + shared state)
- Each sub-component is self-contained with its own file
- Constants extracted to a separate module
- Toggle component reusable from `components/ui/Toggle.tsx`
- Zero visual or behavioral changes
- Build passes with zero TypeScript errors

### Feature 2: Lazy-Load Sidebar Panels
Apply `React.lazy()` + `Suspense` to heavy sidebar panels that are not visible on initial render:
- SettingsPanel (loaded when user clicks Settings tab)
- SkillsPanel (loaded when user clicks Skills tab)
- FileBrowser (loaded when user clicks Files tab)
- NotesPanel (loaded when user clicks Notes tab)

**Acceptance Criteria**:
- Sidebar.tsx uses `React.lazy()` for SettingsPanel, SkillsPanel, FileBrowser, NotesPanel
- Each lazy panel wrapped in `Suspense` with a skeleton/spinner fallback
- Initial bundle size reduced (measurable via Vite build output)
- No flash of unstyled content when panels load
- Tab switching feels instant (panels cached after first load)

### Feature 3: Accessibility Foundations (Focus Trap + ARIA)
Add core accessibility infrastructure:
- Focus trap in modal dialogs: CommandPalette, ShortcutCheatsheet, ImageLightbox
- `aria-label` on all icon-only buttons (NavRail icons, toolbar icons, close buttons)
- `role="dialog"` and `aria-modal="true"` on modal overlays
- `aria-live="polite"` on toast notifications
- `Escape` key closes all modals (most already do, audit and fix gaps)

**Acceptance Criteria**:
- Tab key cycles within modal boundaries (does not escape to background content)
- Screen reader announces modal opening/closing
- All icon-only buttons have descriptive aria-labels
- Toasts announced to screen readers
- No visual changes to sighted users
- Build passes with zero TypeScript errors

---

## Out of Scope
- SkillsPanel decomposition (deferred to next iteration -- similar pattern)
- Full WCAG 2.1 AA audit (this is foundations only)
- Code-splitting at route level (Electron SPA doesn't have routes)
- Keyboard navigation within settings form fields (browser default is sufficient)

---

## Technical Notes
- React.lazy requires default exports. Sidebar panels already use `export default`.
- Focus trap can be implemented with a lightweight `useFocusTrap` hook (no new dependencies needed).
- ARIA labels should use i18n keys for localization.
- The Toggle component extraction is backwards-compatible -- just move + re-export.

---

## Success Metrics
- SettingsPanel.tsx: 986 -> <200 lines
- Initial bundle: 1,268 KB -> target <1,000 KB (code-split panels)
- Zero regressions in existing functionality
