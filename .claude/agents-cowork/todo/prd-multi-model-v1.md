# PRD: Multi-Model Provider Support (AIPA 1.1.0)

_Version: v1 | Date: 2026-03-29 | Author: aipa-pm_

## Background

AIPA 1.0.x has been locked to Claude as the sole AI model provider. The competitive landscape (openclaw, ChatGPT Desktop, etc.) has moved to multi-model support. Users need the flexibility to use different models for different tasks, switch between providers when one is down, and leverage local models for privacy-sensitive work.

Additionally, a recurring critical bug (React error #185 - Maximum update depth exceeded) causes the chat panel to crash with infinite re-render loops, requiring immediate resolution.

## In Scope (4 功能点)

### P0 — Fix React #185 Chat Panel Crash
- **Problem**: Chat panel enters infinite re-render loop, showing "Something went wrong" error boundary. React error #185 = Maximum update depth exceeded. User reports this is the 2nd occurrence.
- **Root Cause Investigation**: Audit all `useEffect` hooks in chat-related components for missing/incorrect dependency arrays, unstable object references in deps, and state updates that trigger cascading re-renders.
- **Fix**: Stabilize all effect dependencies, add safeguards against infinite loops.
- **Acceptance Criteria**:
  - [ ] All `useEffect` hooks in MessageList, useMessageListScroll, ChatPanel, ChatHeader, ChatInput audited
  - [ ] Object/array references in useEffect deps replaced with stable primitives or memoized refs
  - [ ] No Maximum update depth exceeded errors under normal usage
  - [ ] Error boundary retry mechanism improved (exponential backoff, max 3 retries)

### P1 — Multi-Model Provider Architecture
- **What**: Extend the backend (main process) to support multiple AI model providers beyond Claude CLI's stream-json mode. Design a provider abstraction layer that can route requests to different model APIs.
- **Providers to support initially**:
  - Claude (existing, via CLI stream-json) — default
  - OpenAI-compatible API (GPT-4o, GPT-4-turbo, etc.) — via direct HTTP
  - Ollama (local models) — via local HTTP API
- **Architecture**:
  - `ModelProvider` interface: `sendMessage(messages, options) => AsyncIterable<StreamEvent>`
  - `ProviderRegistry`: manages available providers, their configs, and health status
  - Provider config stored in electron-store under `prefs.modelProviders`
  - Each provider has: id, name, baseUrl, apiKey, models[], enabled, healthStatus
- **Acceptance Criteria**:
  - [ ] `ModelProvider` TypeScript interface defined
  - [ ] `ClaudeCliProvider` wraps existing stream-bridge as a provider
  - [ ] `OpenAICompatProvider` supports any OpenAI-compatible API endpoint
  - [ ] `OllamaProvider` supports local Ollama instance
  - [ ] Provider config CRUD via IPC
  - [ ] Active provider selection stored in prefs

### P2 — Model Selector UI Enhancement
- **What**: Enhance the existing model selector (status bar quick-switcher from Iteration 280) to support multi-provider model selection.
- **Design**:
  - Group models by provider in the dropdown (Claude, OpenAI, Ollama sections)
  - Show provider health indicator (green/yellow/red dot)
  - Show model capabilities (vision, code, reasoning) as small tags
  - "Add Provider" button at bottom of dropdown → opens Settings > Providers tab
- **Acceptance Criteria**:
  - [ ] Model dropdown shows models grouped by provider
  - [ ] Provider health indicator visible
  - [ ] Model capabilities shown as tags
  - [ ] Can add new provider from dropdown

### P3 — Model Failover
- **What**: When the active model/provider fails (rate limit, API down, quota exhausted), automatically switch to the next available model in the failover chain.
- **Design**:
  - User configures failover priority order in Settings
  - On provider error (429, 500, 503, timeout), try next provider in chain
  - Show toast notification when failover occurs
  - Cooldown timer before retrying failed provider (default 60s)
  - Status bar shows failover indicator when not on primary model
- **Acceptance Criteria**:
  - [ ] Failover chain configurable in Settings
  - [ ] Automatic failover on provider error
  - [ ] Toast notification on failover
  - [ ] Cooldown timer for failed providers
  - [ ] Visual indicator in status bar

## Out of Scope
- Voice input/output (future 1.2.0)
- Browser control/automation (future 1.2.0)
- Plugin/skill marketplace (future 1.3.0)
- Canvas/visual workspace (future 1.3.0)
- Memory vector search (existing basic memory is sufficient for now)

## Technical Constraints
- electron-store must stay at v8 (CJS)
- Claude CLI mode must remain as primary provider (backward compatible)
- Provider API keys must be stored securely (same pattern as existing API key storage)
- All new UI must support i18n (en.json + zh-CN.json)
- All new UI must support dark/light theme

## Success Metrics
- Zero React #185 crashes after fix
- At least 3 model providers configurable
- Failover response time < 5 seconds
- No regression in existing Claude CLI functionality
