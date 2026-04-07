---
name: Superpower Integration - Phase 1-2 PRDs
description: 4 PRDs for CLI superpower integration (effort control, token usage, compact, plan mode) based on SUPERPOWER-INTEGRATION-PLAN.md
type: project
---

## Superpower Integration Phase 1-2 PRDs (2026-04-07)

Strategic direction: Full CLI capability integration into AIPA GUI (SUPERPOWER-INTEGRATION-PLAN.md).

### PRDs Delivered This Session

1. **prd-effort-control-v1.md** (Phase 1.1) — Replace system prompt effort hack with CLI `--effort` flag. 5 levels: auto/low/medium/high/max. Key insight: current implementation wastes tokens via system prompt injection.
2. **prd-context-token-usage-v1.md** (Phase 1.2) — StatusBar token progress bar, click-to-expand details, >85% auto-warning toast. Builds on existing ContextUsageMeter + chatStore.lastContextUsage.
3. **prd-compact-v1.md** (Phase 2.1) — ChatPanel toolbar compact button, progress/loading state, token savings feedback, custom compact instructions. Leverages existing `/compact` send path.
4. **prd-plan-mode-v1.md** (Phase 2.2) — Plan Mode toggle via `/plan` slash command. Visual indicators: InputToolbar button + border color + PlanModeBanner + StatusBar PLAN badge.

### File Conflict Analysis

All 4 PRDs share `StatusBar.tsx`, `chatStore.ts`, and `i18n/locales/*.json`. Recommended execution order: effort → token → compact → plan (strict serial).

### User Feedback Processed (2026-04-07)

Feedback items (not addressed in this batch, should carry forward):
1. Remove archive feature
2. New conversation dialog: remove agents cards, use dropdown menu for agents/workflow selection
3. Workflow agent cards: remove "activate" button (agents are per-session, not global)
4. Workflow agent cards: remove "edit" button, click card to enter edit in main panel (like workflow editing)
5. Workflow detail page: Canvas not showing after click
6. Settings: remove "Providers" tab

**Why:** These are UI polish items for agents/workflow/settings that are orthogonal to CLI integration. Should be bundled into a separate "UX Polish" PRD in a future session.

**How to apply:** When the next aipa-pm session runs without specific strategic direction, prioritize these feedback items as a bundled PRD.
