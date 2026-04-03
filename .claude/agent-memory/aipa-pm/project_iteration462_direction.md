---
name: Iteration 462+ Product Direction
description: Product state at I462 — 3 PRDs for actionable responses, input efficiency, project workspaces. Focus shifts from feature breadth to interaction depth and workflow productivity.
type: project
---

**State at Iteration 462 (2026-04-03):**

Product at v1.1.136+, 460+ iterations complete. React #185 fixed (I444). Feature coverage extremely broad. feedback.md was empty — direction driven by product gap analysis and competitive positioning.

**Product Direction — "Interaction Depth & Productivity" pivot:**

Previous cycle (I461) focused on "personal assistant" features (clipboard, scheduling, rich content). This cycle pivots to **making existing interactions more powerful** rather than adding new surface area:

1. **prd-actionable-response-blocks-v1.md** — Code block action bar (Run/Save), inline shell command execution buttons, file path auto-linking. Turns AI output from read-only text into executable actions. Key differentiator vs ChatGPT/Claude.ai.

2. **prd-input-efficiency-conversation-flow-v1.md** — Input history recall (Alt+Up/Down), smart paste detection (auto code block wrapping), pin message to context. Reduces repetitive input friction for power users.

3. **prd-project-workspace-management-v1.md** — Project profiles (bind workDir + persona + system prompt), project switcher in StatusBar, session grouping by project. Biggest structural addition — introduces "Project" as first-class entity. Leverages CLI's existing per-project session storage.

**Why these directions:**
- Actionable responses: Cursor/VS Code have Apply buttons; AIPA's desktop-native advantage (full FS + terminal access) makes this a natural fit
- Input efficiency: Terminal users expect history recall; paste intelligence is table-stakes UX
- Project workspaces: VS Code/Cursor/JetBrains all center on workspace concept; AIPA is flat — this is the biggest structural gap

**File conflict avoidance (parallel execution safe):**
- PRD 1: CodeBlock.tsx, MessageContent.tsx, new components
- PRD 2: ChatInput.tsx, MessageActionToolbar.tsx, chatStore.ts (minor), owns i18n for this batch
- PRD 3: StatusBar.tsx, SessionList.tsx, settings/* new components
- No overlap on store/index.ts, ipc/index.ts, or preload/index.ts

**How to apply:**
- All 3 PRDs can run in parallel (no file conflicts)
- PRD 1 P0 (code block actions) is the quickest win, 1-2 iterations
- PRD 3 P0 (project profiles) is the most structurally impactful, 2-3 iterations
- PRD 2 P0 (input history) is pure frontend, 1 iteration
