---
name: Iteration 512+ Product Direction
description: Product state at I512 — 2 PRDs for structural features (conversation tabs, actionable code blocks). React #185 crash recurring in TasksPanel. Focus on cockpit differentiation.
type: project
---

**State at Iteration 512 (2026-04-06):**

Product at v1.1.140+, 511 iterations complete. Recent I488-509 focused on Claude Code sourcemap utility ports (low user-facing value). I510 fixed critical React #185 crash in WorkflowDetailPage. I511 did component decomposition + dead code cleanup.

**React #185 Crash -- Still Recurring (4th+ report):**

New feedback shows React #185 crashing in TWO components simultaneously: chat panel (Lg component) and TasksPanel.tsx (clearly in stack trace). Crash loops through ErrorBoundary 8+ times. IPC calls timeout at 3000ms. This is the same class of bug fixed in I444 (Zustand selectors) and I510 (missing state in WorkflowDetailPage). TasksPanel.tsx at 689 lines is a prime candidate for missing state declarations after decomposition.

**Product Direction -- "Cockpit Differentiation" pivot:**

With 200+ features and 15+ sidebar panels, feature breadth is maxed out. Two structural gaps identified vs. competitors:

1. **prd-conversation-tabs-v1.md** — Multi-tab conversations. Every competitor (Claude.ai, ChatGPT, Cursor, VS Code) supports this. AIPA's single-pane model is the biggest UX structural gap. Requires chatStore refactoring (single state -> Map<tabId, TabState>).

2. **prd-actionable-codeblocks-v1.md** — One-click Run for shell commands, Save to file for code blocks, clickable file paths in AI responses. Core differentiator: AIPA has PTY + full FS access that web-based competitors lack. This was identified in I462 direction memo but never implemented.

**Why these directions:**
- Tabs: Table-stakes for any multi-session desktop app. Users reported session switching friction.
- Actionable code: Leverages AIPA's unique desktop-native + CLI-engine advantage. Closes the gap between "AI suggests" and "user does" to zero clicks.

**Execution plan:**
- 4 PRDs in queue total (2 existing tech debt + 2 new features)
- Groups 1+2 (decomposition + workflow UX) serial, then Groups 3+4 (tabs + actionable blocks) parallel
- TasksPanel crash must be addressed during Group 1 decomposition

**How to apply:**
- Prioritize TasksPanel crash fix during decomposition (Group 1)
- Tabs PRD is the most structurally complex (chatStore refactoring) -- needs careful engineering
- Actionable code blocks needs 3 new IPC channels (fs:saveFile, fs:showSaveDialog, fs:pathExists)
