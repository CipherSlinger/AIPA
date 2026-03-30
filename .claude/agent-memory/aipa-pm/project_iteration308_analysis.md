---
name: Iteration 308 Product Analysis
description: Product state at I308 - critical React #185 crash recurring despite 2 fix attempts, multi-model shipped, 200+ features, key competitive gaps identified
type: project
---

**State at Iteration 308 (2026-03-29):**

Product has 200+ features across chat, notes, memory, workflows, skills, scheduled prompts, multi-model providers. WeChat-style 3-column layout since I53. Multi-model support (OpenAI, DeepSeek, Ollama) shipped in I301-305.

**Critical Issue:** React error #185 ("Maximum update depth exceeded") is the #1 user complaint. Fixed in I291 (useMessageListScroll deps) and I301 (requestAnimationFrame throttle) but **still recurring**. User explicitly expressed loss of trust: "提过很多次这个bug，但一直修不好."

**Why:** The root cause is likely distributed across multiple code paths, not a single fix point. useMessageListScroll was the first identified path, but ChatPanel.tsx, Message.tsx, and useStreamJson.ts likely have additional setState loops that can trigger the same React safety threshold during streaming + scroll + resize scenarios.

**How to apply:** Before adding ANY new features, this crash must be fixed with a system-wide audit. PRD `prd-chat-stability-resilience-v1.md` covers 4 modules: root cause fix, message-level error isolation, crash state recovery, and diagnostics. P0 items should ship before any P1/P2 new features.

**Competitive Context (March 2026):**
- Claude Desktop: "Computer Use" (mouse/keyboard control), Cowork, Dispatch (cross-device)
- ChatGPT Desktop: Alt+Space quick access, screen sharing, GPT-5.4, "superapp" strategy
- Cursor: Background agents, self-hosted cloud agents, 272k context, BugBot code review
- AIPA gap: No computer automation, no background agents, client-side stability issues

**Tech debt:** ChatInput 720L, InputToolbar 750L, StatusBar 714L (all growing toward 800L threshold). I306-307 started decomposition work.
