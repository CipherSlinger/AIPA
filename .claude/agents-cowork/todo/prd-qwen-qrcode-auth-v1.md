# PRD: Qwen QR Code Authentication & Provider Quick Setup

_Version: v1 | Date: 2026-04-03 | Author: aipa-pm_

## Background

User feedback requests a QR code scan feature for connecting to the Qwen (Tongyi Qianwen) model. Currently, Qwen is configured via manual API key entry in Settings > Providers, which requires users to:
1. Navigate to Alibaba Cloud DashScope console
2. Create an account and find the API key page
3. Copy the API key
4. Paste it into AIPA settings

This friction is especially high for Chinese users who are accustomed to scanning QR codes for authentication (Alipay, WeChat, DingTalk patterns).

## In Scope

### 1. Qwen Quick Setup Card in Provider Settings
- When the Qwen provider is expanded in Settings > Providers, show a prominent "Quick Setup" card above the manual API key input
- The card contains:
  - A button "Get API Key from DashScope" that opens the DashScope API key page in the system browser
  - A QR code image displaying the DashScope API key page URL, rendered client-side using a lightweight QR code generator (no external service dependency)
  - Helper text: "Scan with your phone to open the API key page, then copy and paste your key below"
- The QR code is generated purely from the URL string -- no authentication flow, no OAuth. It is a convenience feature to let mobile users quickly navigate to the right page.

### 2. One-Click Enable for Qwen Provider
- After the user pastes an API key and clicks Save, automatically enable the Qwen provider (set enabled: true) and trigger a health check
- Show a success toast with the detected model count: "Qwen connected! 4 models available"
- If health check fails, show error toast with the specific error message

### 3. Provider Setup Guide Links for All Providers
- Add a "Get API Key" link button for each built-in provider in the settings UI:
  - Claude CLI: link to https://console.anthropic.com/settings/keys
  - OpenAI: link to https://platform.openai.com/api-keys
  - DeepSeek: link to https://platform.deepseek.com/api_keys
  - Qwen: link to https://dashscope.console.aliyun.com/apiKey (same as QR code target)
  - Ollama: link to https://ollama.ai/download
- Each link opens in the system default browser via window.electronAPI.openExternal(url)

### 4. QR Code Display Component (Reusable)
- Create a reusable QRCodeDisplay component that accepts a URL string and renders a QR code using canvas
- Use a pure-JS QR code library (no native dependencies) -- inline a minimal QR encoder (avoid adding npm dependencies)
- Component props: url: string, size?: number (default 160px), label?: string
- Styled to match the app theme (dark background, light QR modules)

## Out of Scope
- OAuth/SSO authentication flow with DashScope (too complex, requires registered app)
- Automatic API key retrieval from QR code scan (requires server-side component)
- QR code for other providers (only Qwen for now, as per user request)
- Mobile companion app

## Acceptance Criteria
- [ ] Qwen provider card in Settings shows a QR code encoding the DashScope API key URL
- [ ] QR code is scannable with any phone camera/QR reader and opens the correct page
- [ ] "Get API Key" link buttons present for all 5 built-in providers (Claude, OpenAI, DeepSeek, Qwen, Ollama)
- [ ] Saving a valid Qwen API key auto-enables the provider and triggers health check
- [ ] All new UI text has i18n support (en.json + zh-CN.json)
- [ ] QRCodeDisplay component is reusable for future use cases

## Technical Notes
- QR code generation must be client-side only (no network requests to generate QR)
- Consider inlining a minimal QR code generator or using a small bundled library
- The QR code only encodes a static URL string -- no dynamic data, no secrets
- Provider setup links should use the existing openExternal IPC channel

## Priority
P1 -- User-requested feature, improves onboarding for Chinese user base
