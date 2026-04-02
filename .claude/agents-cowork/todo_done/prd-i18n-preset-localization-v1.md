# PRD: i18n Preset Localization & Dynamic Description Rendering

_Version: 1.0 | Date: 2026-04-01 | Author: aipa-pm (via agent-leader)_

## Background

User feedback reports that Agents (Personas) and Workflows preset descriptions are hardcoded in English and do not follow the system language setting. When the user switches to Chinese, preset workflow names like "Weekly Report" and persona names like "Writing Coach" remain in English. This breaks the i18n experience.

## In Scope

### Feature 1: Workflow Preset Localization
- All 6 preset workflow names and descriptions in `workflowConstants.ts` should use i18n keys instead of hardcoded English strings
- When displayed in `WorkflowItem.tsx` and `WorkflowPanel.tsx`, preset workflows should render localized names/descriptions
- User-created workflows remain as-is (user-authored text, not localized)

### Feature 2: Persona Preset Localization
- All 5 preset persona names in `personaConstants.ts` should use i18n keys
- `PersonaPresets.tsx` and `WorkflowPersonasSection.tsx` should render localized preset names
- The systemPrompt for presets is intentionally in English (it's sent to the AI model) -- do NOT localize systemPrompt

### Feature 3: Installed Preset Re-rendering on Language Switch
- When a user has already installed a preset workflow/persona, the displayed name should update when the language changes
- Implementation approach: Store a `presetKey` field on installed presets. If `presetKey` exists, render the i18n version of the name. If not (user-created), render the stored name directly.
- This requires a minor schema addition to the Workflow and Persona types

## Out of Scope
- Localizing user-created workflow/persona names (these are user-authored)
- Localizing systemPrompt content (sent to AI, should remain in English)
- Adding new languages beyond en/zh-CN

## Acceptance Criteria
- [ ] Switching language to zh-CN shows all preset workflow names/descriptions in Chinese
- [ ] Switching language to en shows all preset workflow names/descriptions in English
- [ ] Persona preset names display in the current language
- [ ] Already-installed presets update their display name when language changes
- [ ] User-created workflows/personas are unaffected
- [ ] All new i18n keys present in both en.json and zh-CN.json
- [ ] Build passes with zero TypeScript errors

## i18n Keys Needed (estimated)
- `workflow.preset.weeklyReport` / `workflow.preset.weeklyReportDesc`
- `workflow.preset.codeReview` / `workflow.preset.codeReviewDesc`
- `workflow.preset.researchSummarize` / `workflow.preset.researchSummarizeDesc`
- `workflow.preset.dailySummary` / `workflow.preset.dailySummaryDesc`
- `workflow.preset.weeklyReview` / `workflow.preset.weeklyReviewDesc`
- `workflow.preset.morningMotivation` / `workflow.preset.morningMotivationDesc`
- `persona.preset.writingCoach`
- `persona.preset.researchAnalyst`
- `persona.preset.creativePartner`
- `persona.preset.studyTutor`
- `persona.preset.productivityCoach`
- ~17 new keys total

## Technical Notes
- Workflow type in `app.types.ts` needs optional `presetKey?: string`
- Persona type in `app.types.ts` needs optional `presetKey?: string`
- When rendering, check: if `presetKey` exists, use `t('workflow.preset.' + presetKey)`, else use stored `name`
