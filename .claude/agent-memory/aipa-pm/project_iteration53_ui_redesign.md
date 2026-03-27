---
name: Iteration 53 UI Redesign Decision
description: AIPA UI restructured to WeChat-style 3-column layout with bubble messages - key design decisions and rationale
type: project
---

Iteration 53 is a major UI redesign moving from 2-column (Sidebar + ChatPanel) to 3-column (NavRail 56px + SessionPanel 240px + ChatPanel flex).

**Why:** After 52 iterations of feature additions, AIPA's visual layer still looks like a developer terminal. The product positioning is "AI Personal Assistant" which demands a consumer-grade chat UX. WeChat desktop is the reference design because it's the most familiar paradigm for the target user base.

**How to apply:**
- P0 scope is strictly: 3-column layout, NavRail, message bubbles (AI left gray / User right blue), session list avatars
- Color scheme: deep dark refined (not pure black), using brand blue `#264f78` for user bubbles (not WeChat green)
- All 52 iterations of existing features MUST continue working in the new layout
- No new npm dependencies
- Light theme deferred to P2 (needs full dual-theme CSS variable system)
- PRD file: `todo/prd-ui-redesign-wechat-v1.md`
