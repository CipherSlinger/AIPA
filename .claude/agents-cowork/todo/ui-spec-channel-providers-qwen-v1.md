# UI Spec: Channel Panel - Provider Migration & Qwen

_Author: aipa-ui (agent-leader acting) | Date: 2026-04-02_
_Source PRD: prd-channel-providers-qwen-v1.md_

## 1. Channel Panel Third Tab

### Visual Design

**Tab bar** in ChannelPanel:
- Three tabs: "Feishu" | "WeChat" | "Providers"
- Same tab style as existing two tabs (flex: 1, 2px bottom border when active)
- Providers tab icon: Settings/Sliders icon or CPU icon
- Tab label i18n: "Providers" / "提供商"

**Providers tab content**:
- Reuse existing SettingsProviders component directly (import and render)
- No visual changes to providers UI -- it already has full provider management
- Scroll independently within the tab content area

### Panel Header Update

- Title remains "Channels" with existing Radio icon
- Badge: show combined count = connected channels + enabled providers
- Badge color: same green (#10b981) as current

## 2. Qwen Built-in Provider

### Card Design

Same as existing provider cards (DeepSeek, OpenAI, etc.):
- Name: "Qwen (Alibaba Cloud)" / "通义千问（阿里云）"
- Icon/emoji: use cloud emoji or letter Q in accent circle
- Base URL pre-filled: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Default models list:
  - qwen-turbo (fast, economical)
  - qwen-plus (balanced)
  - qwen-max (most capable)
  - qwen-long (long context)
- API key field: same as other providers (password type with eye toggle)
- Type: 'openai-compat' (same protocol as DeepSeek)

## 3. Settings Panel Provider Removal

### Visual Design

- Remove SettingsProviders from SettingsPanel tab list
- Add a small info banner where Providers used to be: "Provider settings have moved to Channels panel" with a button "Open Channels"
- Button click triggers NavRail channel tab activation

## I18n Keys

```
channel.providers / channel.providersTab
channel.providersMoved / channel.openChannels
provider.qwen.name / provider.qwen.description
provider.qwen.models.turbo / provider.qwen.models.plus
provider.qwen.models.max / provider.qwen.models.long
```
