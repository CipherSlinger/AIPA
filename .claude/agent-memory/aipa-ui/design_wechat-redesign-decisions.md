---
name: WeChat Redesign Design Decisions (Iteration 53)
description: Key visual choices for the three-column bubble-chat redesign -- color values, avatar sizing, bubble radius conventions, and rationale.
type: project
---

Iteration 53 redesigns AIPA's layout from 2-column to 3-column WeChat-style with message bubbles.

**Key decisions:**
- Background depth gradient: NavRail `#1a1a1a` -> SessionPanel `#212121` -> ChatPanel `#2a2a2a`
- User bubble: brand blue `#264f78` (not WeChat green), AI bubble: `#333333`
- Bubble tail direction via asymmetric radius: AI `2px 12px 12px 12px`, User `12px 2px 12px 12px`
- Avatar 36px (up from 28px) to balance against bubbles; compact mode 28px
- Timestamps inside bubbles (right-aligned, reduced opacity), not external
- Session list avatars: 36px rounded squares (`border-radius: 8px`), color from 8-item deterministic palette
- NavRail: 56px fixed width, 6 items (chat/history/files/terminal + spacer + settings/avatar)
- Selected nav indicator: 3px left bar using `--nav-indicator` (brand blue)

**Why:** Structural inspiration from WeChat, but chromatically staying dark to match existing 3-theme system and developer audience preferences.

**How to apply:** All future UI specs for features that touch layout, messaging, or navigation should reference these conventions. New bubble types (e.g., system notifications) should follow the same radius/shadow/padding patterns.
