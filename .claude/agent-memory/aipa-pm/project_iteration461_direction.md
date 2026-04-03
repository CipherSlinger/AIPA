---
name: Iteration 461+ Product Direction
description: Product state at I461 — 3 PRDs for personal assistant direction (clipboard, scheduled tasks, rich content), competitive analysis updated, feature maturity high
type: project
---

**State at Iteration 461 (2026-04-03):**

Product at v1.1.136, 460+ iterations complete. All major component decomposition debt resolved (all < 500 lines). React #185 crash fixed in I444 (Zustand selectors). Feature coverage extremely broad: chat, sessions, memory, workflows, skills, channels, multi-model, branching, notes, bookmarks, stats, focus mode, etc.

**Product Direction — "Personal AI Assistant" pivot:**

With 200+ features already shipped, the product is feature-rich but still primarily reactive (waits for user input). Three PRDs target the transition from "reactive chatbot" to "proactive personal assistant":

1. **prd-clipboard-instant-actions-v1.md** — Smart clipboard pipeline with content-type detection (code/URL/image/long-text). Enhances existing ClipboardActionsMenu + PasteChips into unified type-aware action system. Addresses cross-app text processing without full conversation overhead.

2. **prd-rich-content-preview-v1.md** — File type icons in ToolUseBlock, image thumbnail preview with Lightbox, URL link preview cards with OG metadata. Requires new `url:fetchMeta` IPC channel for URL cards.

3. **prd-avatar-picker-fix-v1.md** — P1 bugfix: AvatarPicker popup occluded by Sidebar due to stacking context. Fix via React Portal rendering to document.body.

**Previous PRD (scheduled-proactive-assistant) not yet scheduled** — awaiting backend scheduler dependency.

**Why these directions:**
- Clipboard intelligence: Windows has no native "copy -> AI process" tool (macOS has Raycast AI)
- Rich content: Expected standard in 2026 AI tools, current pure-text experience feels dated
- Avatar fix: Direct user feedback, trust-critical (visible UI bug erodes confidence)

**How to apply:**
- Avatar fix is quickest (~30-50 lines), should execute first
- Rich content file icons + image preview are pure frontend, moderate effort
- Rich content URL cards need IPC backend work
- Clipboard actions build on existing hooks, moderate effort
- All 3 PRDs avoid file conflicts (different component trees) and can run in parallel

**Competitive Context Update (April 2026):**
- Claude Desktop: Computer Use mature, Dispatch for cross-device, Cowork for collaboration
- ChatGPT Desktop: Alt+Space, screen sharing, GPT-5.4, agents/tasks
- Cursor: Background agents, self-hosted cloud, BugBot
- AIPA differentiation: Windows-native, multi-model, full CLI power, but needs proactive + multi-modal to compete
