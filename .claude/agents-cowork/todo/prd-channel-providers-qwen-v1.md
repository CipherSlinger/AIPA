# PRD: Channel Panel - Provider Migration & Qwen Support

_Author: aipa-pm (agent-leader acting) | Date: 2026-04-02_

## Context

The Channel panel (sidebar NavRail entry) currently only has Feishu and WeChat integrations. The Settings panel has a separate "Providers" section for model provider configuration (Claude CLI, OpenAI, Ollama, DeepSeek). User feedback requests migrating providers from Settings into the Channel panel and adding Qwen (Alibaba Cloud Bailian) as a new provider.

## In Scope

### 1. Migrate Providers Tab to Channel Panel

**Problem**: Provider configuration is buried in Settings modal. Users want quick access from the sidebar Channel entry.

**Solution**:
- Add a third tab "Providers" in the ChannelPanel (tabs become: "Feishu" | "WeChat" | "Providers")
- Move the entire `SettingsProviders` component content into this new tab
- Remove the "Providers" section from `SettingsPanel` (keep a link/redirect to Channel panel)
- The Channel panel header should reflect it now includes providers
- NavRail badge for Channel should show count of connected channels + enabled providers

**Impact**: ChannelPanel.tsx (add tab), SettingsPanel.tsx (remove providers section), SettingsProviders.tsx (reusable, no changes needed), NavRail.tsx (badge logic)

### 2. Add Qwen (Alibaba Cloud Bailian) Provider

**Problem**: Qwen is a popular LLM provider in China but not available in AIPA's provider list.

**Solution**:
- Add "Qwen" as a new built-in provider entry (alongside claude-cli, openai, ollama, deepseek)
- Qwen uses OpenAI-compatible API format (base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`)
- Default models: qwen-turbo, qwen-plus, qwen-max, qwen-long
- Requires API key from Alibaba Cloud (dashscope)
- Add to BUILT_IN_IDS in SettingsProviders.tsx
- Add i18n labels for Qwen provider name and model names

**Impact**: SettingsProviders.tsx (new built-in), main process provider defaults (if exists), en.json + zh-CN.json

### 3. Channel Panel Rename to Reflect Broader Scope

**Problem**: "Channel" only conveys messaging integrations, not model providers.

**Solution**:
- Keep NavRail label "Channels" but update panel header to include subtitle
- Add subtitle explaining it includes messaging integrations and AI model providers
- i18n key updates for renamed labels

**Impact**: ChannelPanel.tsx (header), en.json + zh-CN.json

## Out of Scope

- Actual Qwen API calling implementation (backend concern for later)
- Provider health check real implementation
- Channel message routing (Feishu/WeChat message handling)

## Success Criteria

- Channel panel has 3 tabs: Feishu | WeChat | Providers
- Qwen appears as a built-in provider with correct base URL and model list
- Settings panel no longer has Providers section (or shows a redirect)
- Build succeeds
- All i18n keys added (en + zh-CN)
