# AIPA 缺失功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 VS Code Claude Code 插件中尚未在 AIPA 中实现的 7 项核心功能，提升对话体验、输入能力与配置灵活性。

**Architecture:** 按影响面从小到大分 4 个阶段：先做纯显示增强（状态栏成本/上下文）→ 输入增强（图片粘贴、斜杠命令）→ 设置增强（自定义系统提示词、MCP 管理）→ 会话管理（自动生成标题、完成通知）。每阶段独立可构建验证。

**Tech Stack:** Electron 39 · React 18 · TypeScript · Zustand · Vite · node-pty · stream-json CLI protocol · Web Notifications API · Web Speech API (已有)

---

## 文件变更索引

| 文件 | 操作 | 所属阶段 |
|------|------|---------|
| `src/renderer/types/app.types.ts` | 修改 — 新增 cost/context 字段到 ClaudePrefs | 1 |
| `src/renderer/store/index.ts` | 修改 — 新增 lastCost / contextUsage state | 1 |
| `src/renderer/hooks/useStreamJson.ts` | 修改 — 解析 result 事件中 total_cost_usd / contextWindow | 1 |
| `src/renderer/components/layout/StatusBar.tsx` | 修改 — 显示成本 + 上下文用量进度条 | 1 |
| `src/renderer/components/chat/ChatPanel.tsx` | 修改 — 粘贴图片、斜杠命令集成 | 2 |
| `src/renderer/components/chat/SlashCommandPopup.tsx` | 新建 — 斜杠命令弹出菜单 | 2 |
| `src/renderer/hooks/useImagePaste.ts` | 新建 — 剪贴板/拖拽图片处理 hook | 2 |
| `src/renderer/types/app.types.ts` | 修改 — ClaudePrefs 加 systemPrompt / appendSystemPrompt | 3 |
| `src/renderer/store/index.ts` | 修改 — DEFAULT_PREFS 加新字段 | 3 |
| `src/renderer/components/settings/SettingsPanel.tsx` | 修改 — 新增系统提示词 textarea + MCP 列表 tab | 3 |
| `src/main/pty/stream-bridge.ts` | 修改 — sendMessage 加 --append-system-prompt 参数 | 3 |
| `src/main/sessions/session-reader.ts` | 修改 — 新增 getMcpServers / setMcpServerEnabled | 3 |
| `src/main/ipc/index.ts` | 修改 — 注册 mcp:list / mcp:setEnabled handler | 3 |
| `src/preload/index.ts` | 修改 — 暴露 mcpList / mcpSetEnabled | 3 |
| `src/main/sessions/session-reader.ts` | 修改 — 新增 generateSessionTitle via CLI | 4 |
| `src/main/ipc/index.ts` | 修改 — 注册 session:generateTitle handler | 4 |
| `src/preload/index.ts` | 修改 — 暴露 sessionGenerateTitle | 4 |
| `src/renderer/hooks/useStreamJson.ts` | 修改 — 对话结束时触发标题生成 + 桌面通知 | 4 |

---

## 阶段一：状态栏增强（成本 + 上下文窗口用量）

### Task 1：解析 CLI result 事件中的成本与上下文数据

**背景：** CLI 的 `result` 事件中包含 `total_cost_usd`（当次调用美元成本）和 usage 中的上下文信息。目前 AIPA 已解析 `usage.input_tokens` 等，但没有 cost 字段。

**Files:**
- Modify: `src/renderer/types/app.types.ts`
- Modify: `src/renderer/store/index.ts`
- Modify: `src/renderer/hooks/useStreamJson.ts`

- [ ] **Step 1: 在 app.types.ts 中扩展 ClaudePrefs（无需改，只改 store）**

在 `src/renderer/store/index.ts` 的 `ChatState` interface 中添加：

```typescript
lastCost: number | null           // 上次调用美元成本
lastContextUsage: { used: number; total: number } | null  // token 使用量
setLastCost: (cost: number | null) => void
setLastContextUsage: (usage: { used: number; total: number } | null) => void
```

完整修改 `src/renderer/store/index.ts`（在 `lastUsage` 下方添加）：

```typescript
// 在 interface ChatState 内：
lastCost: number | null
lastContextUsage: { used: number; total: number } | null
setLastCost: (cost: number | null) => void
setLastContextUsage: (usage: { used: number; total: number } | null) => void

// 在 create<ChatState> 初始值中：
lastCost: null,
lastContextUsage: null,

// 在 actions 中：
setLastCost: (cost) => set({ lastCost: cost }),
setLastContextUsage: (usage) => set({ lastContextUsage: usage }),
```

- [ ] **Step 2: 在 useStreamJson.ts 的 cli:result 处理中解析 cost 和 contextWindow**

在 `src/renderer/hooks/useStreamJson.ts` 中，找到 `case 'cli:result':` 块，在 `setLastUsage` 调用后添加：

```typescript
// cost
const costUsd = ev?.total_cost_usd as number | undefined
setLastCost(costUsd ?? null)

// context window usage
const contextWindow = ev?.usage?.context_window as number | undefined
const inputTokens = ev?.usage?.input_tokens as number | undefined
if (contextWindow && contextWindow > 0) {
  setLastContextUsage({ used: inputTokens ?? 0, total: contextWindow })
}
```

同时在 hook 顶部的解构中添加 `setLastCost, setLastContextUsage`：

```typescript
const {
  appendTextDelta, appendThinkingDelta, addToolUse, resolveToolUse, setStreaming, setSessionId,
  addPermissionRequest, resolvePermission, denyPendingPermissions, setLastUsage,
  addPlanMessage, setLastCost, setLastContextUsage,
} = useChatStore()
```

- [ ] **Step 3: 构建验证**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui && npm run build:main && npm run build:renderer
```

预期：0 错误。

---

### Task 2：StatusBar 显示成本 + 上下文进度条

**Files:**
- Modify: `src/renderer/components/layout/StatusBar.tsx`

- [ ] **Step 1: 更新 StatusBar.tsx**

完整替换 `src/renderer/components/layout/StatusBar.tsx`：

```tsx
import React from 'react'
import { PanelLeft, Terminal, DollarSign } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'

export default function StatusBar() {
  const { workingDir, lastUsage, lastCost, lastContextUsage } = useChatStore()
  const { prefs } = usePrefsStore()
  const { toggleSidebar, toggleTerminal, sidebarOpen, terminalOpen } = useUiStore()

  const dirLabel = workingDir || prefs.workingDir || '~'
  const modelLabel = prefs.model || 'claude-sonnet-4-6'
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  const contextPct = lastContextUsage && lastContextUsage.total > 0
    ? Math.min(100, Math.round(lastContextUsage.used / lastContextUsage.total * 100))
    : null

  // Context bar color: green < 60%, yellow < 85%, red >= 85%
  const ctxColor = contextPct == null ? '#4ade80'
    : contextPct >= 85 ? '#f87171'
    : contextPct >= 60 ? '#fbbf24'
    : '#4ade80'

  return (
    <div
      style={{
        height: 24,
        background: 'var(--accent)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        gap: 10,
        fontSize: 11,
        flexShrink: 0,
      }}
    >
      <button
        onClick={toggleSidebar}
        title="切换侧边栏 (Ctrl+B)"
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: sidebarOpen ? 1 : 0.6 }}
      >
        <PanelLeft size={12} />
      </button>

      <span style={{ opacity: 0.8 }}>📁</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
        {dirLabel}
      </span>

      {/* Context window usage bar */}
      {contextPct !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.9 }} title={`上下文已用 ${contextPct}%（${fmt(lastContextUsage!.used)} / ${fmt(lastContextUsage!.total)} tokens）`}>
          <div style={{ width: 48, height: 5, background: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${contextPct}%`, height: '100%', background: ctxColor, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 10, opacity: 0.8 }}>{contextPct}%</span>
        </div>
      )}

      {/* Token usage */}
      {lastUsage && (
        <span style={{ opacity: 0.85, whiteSpace: 'nowrap' }}>
          ↑{fmt(lastUsage.inputTokens)} ↓{fmt(lastUsage.outputTokens)}
          {lastUsage.cacheTokens > 0 && ` ♻️${fmt(lastUsage.cacheTokens)}`}
        </span>
      )}

      {/* Cost */}
      {lastCost != null && lastCost > 0 && (
        <span style={{ opacity: 0.85, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>
          <DollarSign size={10} />
          {lastCost < 0.001 ? '<$0.001' : `$${lastCost.toFixed(3)}`}
        </span>
      )}

      <span style={{ opacity: 0.9, whiteSpace: 'nowrap' }}>⚡ {modelLabel}</span>

      <button
        onClick={toggleTerminal}
        title="切换终端 (Ctrl+`)"
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: terminalOpen ? 1 : 0.6 }}
      >
        <Terminal size={12} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 构建验证**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui && npm run build:renderer
```

预期：0 错误，状态栏现在显示 `$0.012` 格式成本和上下文进度条。

---

## 阶段二：输入增强（图片粘贴 + 斜杠命令）

### Task 3：图片粘贴/拖拽支持

**背景：** VS Code 插件通过监听 `paste` 事件从剪贴板获取图片文件，转换为 base64 后作为多内容块放入用户消息。stream-json 协议支持 `content` 为数组（含 text + image_url 块）。

**Files:**
- Create: `src/renderer/hooks/useImagePaste.ts`
- Modify: `src/renderer/components/chat/ChatPanel.tsx`
- Modify: `src/renderer/hooks/useStreamJson.ts` — sendMessage 支持 attachments

- [ ] **Step 1: 创建 useImagePaste.ts hook**

新建 `src/renderer/hooks/useImagePaste.ts`：

```typescript
import { useState, useCallback } from 'react'

export interface ImageAttachment {
  id: string
  name: string
  dataUrl: string   // base64 data URL
  mimeType: string
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function useImagePaste() {
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    const imageFiles = arr.filter(f => ALLOWED_TYPES.includes(f.type))
    if (imageFiles.length === 0) return

    imageFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        if (!dataUrl) return
        setAttachments(prev => [...prev, {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          dataUrl,
          mimeType: file.type,
        }])
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      addFiles(files)
    }
  }, [addFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const clearAttachments = useCallback(() => setAttachments([]), [])

  return { attachments, handlePaste, handleDrop, addFiles, removeAttachment, clearAttachments }
}
```

- [ ] **Step 2: 修改 useStreamJson.ts — sendMessage 支持 attachments**

在 `sendMessage` 函数签名改为接受可选的附件参数，并将图片编码进用户消息的 content 数组：

在 `src/renderer/hooks/useStreamJson.ts` 中，将：
```typescript
const sendMessage = async (prompt: string) => {
```
改为：
```typescript
const sendMessage = async (prompt: string, attachments?: import('./useImagePaste').ImageAttachment[]) => {
```

同时修改 `src/main/pty/stream-bridge.ts` 中的 `_writeUserMessage` 方法，使其能处理 JSON 数组格式的内容（图片附件时）：

```typescript
private _writeUserMessage(prompt: string, sessionId?: string): void {
  // If prompt is a JSON array string (image attachments), parse it back to array
  let content: unknown = prompt
  if (prompt.startsWith('[')) {
    try { content = JSON.parse(prompt) } catch { content = prompt }
  }
  const userMessage = JSON.stringify({
    type: 'user',
    message: { role: 'user', content },
    session_id: sessionId || '',
    parent_tool_use_id: null,
  }) + '\n'
  this.proc!.stdin!.write(userMessage)
}
```

将发送给 CLI 的 prompt 构建改为多内容块（当有图片时）：

在 `sendMessage` 函数内，替换 `addMessage` 调用和 `cliSendMessage` 调用部分：

```typescript
// Build display content (text only for message list)
const userMsg: StandardChatMessage = {
  id: `user-${Date.now()}`,
  role: 'user',
  content: prompt,
  timestamp: Date.now(),
  attachments: attachments?.map(a => ({ name: a.name, dataUrl: a.dataUrl })),
}
useChatStore.getState().addMessage(userMsg)
setStreaming(true)

const currentSessionId = useChatStore.getState().currentSessionId

const flags: string[] = []
if (prefs.thinkingLevel === 'adaptive') {
  flags.push('--thinking', 'adaptive')
}
if (prefs.systemPrompt?.trim()) {
  flags.push('--append-system-prompt', prefs.systemPrompt.trim())
}

// Build actual prompt — if images attached, encode as JSON content array
let actualPrompt: string
if (attachments && attachments.length > 0) {
  const contentBlocks: unknown[] = [{ type: 'text', text: prompt }]
  for (const img of attachments) {
    const base64 = img.dataUrl.split(',')[1] // strip data:image/png;base64,
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: base64 },
    })
  }
  actualPrompt = JSON.stringify(contentBlocks)  // stream-bridge will parse back to array
} else {
  actualPrompt = prompt
}

const result = await window.electronAPI.cliSendMessage({
  prompt: actualPrompt,
  cwd: prefs.workingDir || (await window.electronAPI.fsGetHome()),
  sessionId: currentSessionId,
  activeBridgeId: activeBridgeIdRef.current ?? undefined,
  model: prefs.model,
  env: {
    ...(prefs.apiKey ? { ANTHROPIC_API_KEY: prefs.apiKey } : {}),
  },
  flags,
})
```

同时在 `StandardChatMessage` 类型中添加可选的 attachments 字段（`src/renderer/types/app.types.ts`）：

```typescript
export interface StandardChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  toolUses?: ToolUseInfo[]
  timestamp: number
  isStreaming?: boolean
  attachments?: { name: string; dataUrl: string }[]  // 图片附件
}
```

- [ ] **Step 3: 修改 ChatPanel.tsx — 集成图片预览 + 粘贴处理**

在 `ChatPanel.tsx` 中导入 hook：

```typescript
import { useImagePaste } from '../../hooks/useImagePaste'
```

在组件内部添加：

```typescript
const { attachments, handlePaste, handleDrop, removeAttachment, clearAttachments } = useImagePaste()
```

修改 `handleSend`：

```typescript
const handleSend = async () => {
  const text = input.trim()
  if (!text && attachments.length === 0 || isStreaming) return
  setInput('')
  setAtQuery(null)
  clearAttachments()
  resizeTextarea()
  await sendMessage(text || '请描述这张图片', attachments.length > 0 ? attachments : undefined)
}
```

在 textarea 上添加 paste/drop 处理：

```tsx
<textarea
  ref={textareaRef}
  value={input}
  onChange={handleInputChange}
  onKeyDown={handleKeyDown}
  onPaste={handlePaste}
  onDrop={handleDrop}
  onDragOver={(e) => e.preventDefault()}
  placeholder="发送消息... (@ 引用文件，/ 命令，粘贴图片，Enter 发送)"
  ...
/>
```

在 textarea 上方（输入框内部，textarea 之前）添加图片预览区：

```tsx
{attachments.length > 0 && (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0 8px' }}>
    {attachments.map(img => (
      <div key={img.id} style={{ position: 'relative', flexShrink: 0 }}>
        <img
          src={img.dataUrl}
          alt={img.name}
          style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
        />
        <button
          onClick={() => removeAttachment(img.id)}
          style={{
            position: 'absolute', top: -4, right: -4,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--error)', border: 'none',
            color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, lineHeight: 1,
          }}
        >×</button>
      </div>
    ))}
  </div>
)}
```

同时在 `Message.tsx` 中，当 message 有 `attachments` 时渲染缩略图：

```tsx
// 在 Message 组件内，content 渲染之后：
{!isUser && message.role !== 'permission' && (message as StandardChatMessage).attachments?.map(a => (
  <img key={a.dataUrl.slice(-20)} src={a.dataUrl} alt={a.name}
    style={{ maxWidth: 200, maxHeight: 150, borderRadius: 6, marginTop: 4, objectFit: 'contain' }} />
))}
```

- [ ] **Step 4: 构建验证**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui && npm run build
```

预期：0 错误。测试：在聊天框截图后 Ctrl+V 粘贴，应看到 60×60 缩略图预览；发送后消息应成功发出。

---

### Task 4：斜杠命令系统（/compact + /clear）

**背景：** VS Code 插件中 `/compact` 直接作为普通用户消息发送给 CLI（`J("/compact")`），CLI 会处理压缩历史上下文。`/clear` 等命令则在前端处理。

**Files:**
- Create: `src/renderer/components/chat/SlashCommandPopup.tsx`
- Modify: `src/renderer/components/chat/ChatPanel.tsx`

- [ ] **Step 1: 创建 SlashCommandPopup.tsx**

新建 `src/renderer/components/chat/SlashCommandPopup.tsx`：

```tsx
import React from 'react'
import { Zap, Trash2, Archive, HelpCircle } from 'lucide-react'

export interface SlashCommand {
  name: string
  description: string
  icon: React.ElementType
  clientOnly?: boolean  // true = 前端处理，不发给 CLI
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/compact', description: '压缩对话历史，减少 token 占用', icon: Archive },
  { name: '/clear', description: '清空当前对话（不发给 Claude）', icon: Trash2, clientOnly: true },
  { name: '/help', description: '显示可用命令', icon: HelpCircle, clientOnly: true },
]

interface Props {
  query: string   // 用户输入的 / 之后的内容
  onSelect: (cmd: SlashCommand) => void
  onDismiss: () => void
  selectedIndex: number
  onHover: (i: number) => void
}

export default function SlashCommandPopup({ query, onSelect, onDismiss, selectedIndex, onHover }: Props) {
  const filtered = SLASH_COMMANDS.filter(c =>
    !query || c.name.toLowerCase().includes(query.toLowerCase())
  )

  if (filtered.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        zIndex: 1001,
        marginBottom: 4,
        overflow: 'hidden',
      }}
    >
      {filtered.map((cmd, i) => {
        const Icon = cmd.icon
        return (
          <div
            key={cmd.name}
            onClick={() => onSelect(cmd)}
            onMouseEnter={() => onHover(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              cursor: 'pointer',
              background: i === selectedIndex ? 'var(--bg-active)' : 'transparent',
            }}
          >
            <Icon size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', minWidth: 80 }}>{cmd.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cmd.description}</span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: 集成到 ChatPanel.tsx**

在 `ChatPanel.tsx` 中：

1. 导入：
```typescript
import SlashCommandPopup, { SLASH_COMMANDS, SlashCommand } from './SlashCommandPopup'
```

2. 添加 state：
```typescript
const [slashQuery, setSlashQuery] = useState<string | null>(null)
const [slashIndex, setSlashIndex] = useState(0)
```

3. 在 `handleInputChange` 中，现有 `@` 检测之后添加 `/` 检测：
```typescript
// Detect / trigger (only at start of line or after space)
const slashMatch = textBefore.match(/(?:^|\s)(\/[^\s]*)$/)
if (slashMatch) {
  setSlashQuery(slashMatch[1].slice(1)) // strip leading /
  setSlashIndex(0)
  setAtQuery(null)
} else if (!atMatch) {
  setSlashQuery(null)
}
```

4. 在 `handleKeyDown` 中，在现有 AtMention 检测之后添加：
```typescript
if (slashQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) {
  return // SlashCommandPopup 处理这些键
}
```

5. 添加 slash 命令全局键处理（在 useEffect 中，或用 onKeyDown 传给 SlashCommandPopup）：

在 SlashCommandPopup 旁边添加逻辑处理 ArrowUp/Down/Enter：

```typescript
// 在组件内添加 useEffect 监听 slash popup 键盘
useEffect(() => {
  if (slashQuery === null) return
  const filtered = SLASH_COMMANDS.filter(c => !slashQuery || c.name.toLowerCase().includes(slashQuery.toLowerCase()))
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[slashIndex]) handleSlashSelect(filtered[slashIndex]) }
    else if (e.key === 'Escape') { setSlashQuery(null) }
  }
  window.addEventListener('keydown', handler, true)
  return () => window.removeEventListener('keydown', handler, true)
}, [slashQuery, slashIndex])
```

6. 添加 `handleSlashSelect` 函数：

```typescript
const handleSlashSelect = async (cmd: SlashCommand) => {
  setSlashQuery(null)
  setInput('')
  if (cmd.clientOnly) {
    if (cmd.name === '/clear') {
      newConversation()
    } else if (cmd.name === '/help') {
      // 显示帮助信息作为系统消息
      useChatStore.getState().addMessage({
        id: `help-${Date.now()}`,
        role: 'assistant',
        content: '**可用命令：**\n\n' + SLASH_COMMANDS.map(c => `- \`${c.name}\` — ${c.description}`).join('\n'),
        timestamp: Date.now(),
      } as any)
    }
    return
  }
  // 发给 CLI
  await sendMessage(cmd.name)
}
```

7. 在输入框 JSX 中，在 `AtMentionPopup` 之后添加：

```tsx
{slashQuery !== null && (
  <SlashCommandPopup
    query={slashQuery}
    onSelect={handleSlashSelect}
    onDismiss={() => setSlashQuery(null)}
    selectedIndex={slashIndex}
    onHover={setSlashIndex}
  />
)}
```

- [ ] **Step 3: 构建验证**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui && npm run build
```

预期：0 错误。测试：输入 `/`，应弹出 3 条命令；选择 `/compact` 后，该文字发送给 Claude，Claude 会压缩历史。

---

## 阶段三：设置增强（系统提示词 + MCP 管理）

### Task 5：自定义系统提示词

**背景：** CLI 支持 `--append-system-prompt <text>` 参数，在每次调用时追加到系统提示词末尾。这是最简洁的实现方式，不需要改 stream-bridge 架构。

**Files:**
- Modify: `src/renderer/types/app.types.ts`
- Modify: `src/renderer/store/index.ts`
- Modify: `src/renderer/components/settings/SettingsPanel.tsx`
- Modify: `src/renderer/hooks/useStreamJson.ts` (已在 Task 3 Step 2 中添加)

- [ ] **Step 1: 在 ClaudePrefs 添加 systemPrompt 字段**

在 `src/renderer/types/app.types.ts` 的 `ClaudePrefs` interface 中添加：

```typescript
systemPrompt?: string    // 附加系统提示词（通过 --append-system-prompt 传递）
```

- [ ] **Step 2: 在 DEFAULT_PREFS 添加默认值**

在 `src/renderer/store/index.ts` 的 `DEFAULT_PREFS` 中添加：

```typescript
systemPrompt: '',
```

- [ ] **Step 3: 在 SettingsPanel.tsx 添加系统提示词 textarea**

在 `SettingsPanel.tsx` 中，在模型选择 `{field('模型', ...)}` 之后添加：

```tsx
{/* System prompt */}
{field(
  '附加系统提示词',
  <textarea
    value={local.systemPrompt ?? ''}
    onChange={(e) => setLocal({ ...local, systemPrompt: e.target.value })}
    placeholder="在此输入自定义指令，每次对话都会附加到系统提示词末尾..."
    rows={4}
    style={{
      ...inputStyle,
      resize: 'vertical',
      fontFamily: 'inherit',
      lineHeight: 1.5,
      minHeight: 80,
    }}
  />,
  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
    通过 --append-system-prompt 传入 CLI，新对话生效
  </span>
)}
```

- [ ] **Step 4: 验证 flag 传递（已在 useStreamJson Task 3 中实现）**

确认 `src/renderer/hooks/useStreamJson.ts` 的 `sendMessage` 中有：

```typescript
if (prefs.systemPrompt?.trim()) {
  flags.push('--append-system-prompt', prefs.systemPrompt.trim())
}
```

- [ ] **Step 5: 构建验证**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui && npm run build
```

预期：0 错误。

---

### Task 6：MCP 服务器管理

**背景：** MCP 服务器配置存储在 `~/.claude/settings.json` 的 `mcpServers` 字段（对象，key 为服务器名，value 含 `command`/`args`/`disabled` 等）。UI 读取列表并允许切换 `disabled` 字段。

**Files:**
- Modify: `src/main/sessions/session-reader.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/components/settings/SettingsPanel.tsx`

- [ ] **Step 1: 在 session-reader.ts 添加 getMcpServers / setMcpServerEnabled**

在 `src/main/sessions/session-reader.ts` 末尾添加：

```typescript
export interface McpServerEntry {
  name: string
  command?: string
  args?: string[]
  disabled?: boolean
  type?: string
}

export function getMcpServers(): McpServerEntry[] {
  const settings = readSettings() as Record<string, unknown>
  const mcpServers = settings.mcpServers as Record<string, Record<string, unknown>> | undefined
  if (!mcpServers) return []
  return Object.entries(mcpServers).map(([name, cfg]) => ({
    name,
    command: cfg.command as string | undefined,
    args: cfg.args as string[] | undefined,
    disabled: cfg.disabled as boolean | undefined,
    type: cfg.type as string | undefined,
  }))
}

export function setMcpServerEnabled(serverName: string, enabled: boolean): void {
  const settings = readSettings() as Record<string, unknown>
  const mcpServers = { ...(settings.mcpServers as Record<string, unknown> || {}) }
  if (mcpServers[serverName]) {
    mcpServers[serverName] = { ...(mcpServers[serverName] as Record<string, unknown>), disabled: !enabled }
  }
  if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ ...settings, mcpServers }, null, 2), 'utf-8')
}
```

- [ ] **Step 2: 在 ipc/index.ts 注册 MCP handlers**

在 `registerConfigHandlers()` 内添加：

```typescript
import { getMcpServers, setMcpServerEnabled } from '../sessions/session-reader'

// 在 registerConfigHandlers 内：
ipcMain.handle('mcp:list', () => getMcpServers())
ipcMain.handle('mcp:setEnabled', (_e, { serverName, enabled }) => setMcpServerEnabled(serverName, enabled))
```

- [ ] **Step 3: 在 preload/index.ts 暴露 MCP API**

在 preload 的 electronAPI 对象中添加：

```typescript
// ── MCP ──────────────────────────────────
mcpList: () => ipcRenderer.invoke('mcp:list'),
mcpSetEnabled: (serverName: string, enabled: boolean) => ipcRenderer.invoke('mcp:setEnabled', { serverName, enabled }),
```

- [ ] **Step 4: 在 SettingsPanel.tsx 添加 MCP tab**

在 `SettingsPanel.tsx` 中：

1. 添加 tab state 和 MCP 数据 state：

```typescript
const [settingsTab, setSettingsTab] = useState<'general' | 'mcp'>('general')
const [mcpServers, setMcpServers] = useState<{ name: string; command?: string; disabled?: boolean }[]>([])

useEffect(() => {
  if (settingsTab === 'mcp') {
    window.electronAPI.mcpList().then(setMcpServers)
  }
}, [settingsTab])
```

2. 在顶部标题下方添加 tab 切换按钮，然后根据 tab 渲染不同内容。

完整结构变为：

```tsx
<div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>设置</div>

  {/* Tab bar */}
  <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
    {(['general', 'mcp'] as const).map(tab => (
      <button
        key={tab}
        onClick={() => setSettingsTab(tab)}
        style={{
          background: settingsTab === tab ? 'var(--accent)' : 'none',
          border: '1px solid ' + (settingsTab === tab ? 'var(--accent)' : 'var(--border)'),
          borderRadius: 4,
          padding: '3px 10px',
          color: settingsTab === tab ? '#fff' : 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 11,
        }}
      >
        {tab === 'general' ? '通用' : 'MCP 服务器'}
      </button>
    ))}
  </div>

  {settingsTab === 'general' ? (
    /* 现有所有设置内容 */
    <>
      {/* ... 现有字段 ... */}
    </>
  ) : (
    /* MCP tab */
    <div>
      {mcpServers.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
          未配置 MCP 服务器<br />
          <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>在 ~/.claude/settings.json 中添加 mcpServers 配置</span>
        </div>
      ) : (
        mcpServers.map(srv => (
          <div key={srv.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{srv.name}</div>
              {srv.command && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{srv.command}</div>}
            </div>
            <Toggle
              value={!srv.disabled}
              onChange={async (v) => {
                await window.electronAPI.mcpSetEnabled(srv.name, v)
                setMcpServers(prev => prev.map(s => s.name === srv.name ? { ...s, disabled: !v } : s))
              }}
            />
          </div>
        ))
      )}
    </div>
  )}
</div>
```

- [ ] **Step 5: 构建验证**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui && npm run build
```

预期：0 错误。打开设置面板，点击"MCP 服务器"tab，应显示 ~/.claude/settings.json 中的 MCP 服务器列表。

---

## 阶段四：会话体验（自动标题 + 完成通知 + 消息评分）

### Task 7：自动生成会话标题

**背景：** VS Code 插件在对话后调用 `generateSessionTitle(channelId, description)` → CLI 返回 title。CLI 的 stream-json 协议有一个 `generate-session-title` 子命令，接收 `--description` 参数。AIPA 中可通过 spawn 独立子进程调用 CLI 实现。

**Files:**
- Modify: `src/main/sessions/session-reader.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/hooks/useStreamJson.ts`

- [ ] **Step 1: 在 session-reader.ts 添加 generateSessionTitle**

**注意：** `session-reader.ts` 顶部现有 `import { execSync } from 'child_process'`，需要将其改为：
`import { execSync, spawn } from 'child_process'`

然后在文件末尾添加（不要重复 import）：

```typescript
export function generateSessionTitle(description: string, cliPath: string): Promise<string> {
  return new Promise((resolve) => {
    const nodePath = process.env.CLAUDE_NODE_PATH || 'node'
    const proc = spawn(nodePath, [
      cliPath,
      'generate-session-title',
      '--description', description.slice(0, 200),
    ], { stdio: ['ignore', 'pipe', 'ignore'] })

    let output = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.on('close', () => {
      try {
        const parsed = JSON.parse(output.trim())
        resolve(parsed.title || parsed.result || output.trim().slice(0, 80))
      } catch {
        resolve(output.trim().slice(0, 80) || description.slice(0, 40))
      }
    })
    // Timeout after 8 seconds
    setTimeout(() => { try { proc.kill() } catch {} resolve(description.slice(0, 40)) }, 8000)
  })
}
```

- [ ] **Step 2: 在 ipc/index.ts 注册 session:generateTitle**

在 `registerSessionHandlers()` 内添加：

```typescript
import { generateSessionTitle } from '../sessions/session-reader'
import path from 'path'
import fs from 'fs'

// 在 registerSessionHandlers 内：
ipcMain.handle('session:generateTitle', async (_e, { description }) => {
  // Find CLI path (same logic as stream-bridge)
  const candidates = [
    path.resolve(__dirname, '../../../../package/cli.js'),
    path.resolve(__dirname, '../../../package/cli.js'),
    path.resolve(process.cwd(), '../package/cli.js'),
  ]
  const cliPath = process.env.CLAUDE_CLI_PATH || candidates.find(p => fs.existsSync(p)) || candidates[0]
  return generateSessionTitle(description, cliPath)
})
```

- [ ] **Step 3: 在 preload/index.ts 暴露**

```typescript
sessionGenerateTitle: (description: string) => ipcRenderer.invoke('session:generateTitle', { description }),
```

- [ ] **Step 4: 在 useStreamJson.ts 对话首轮结束后触发标题生成**

在 `case 'cli:result':` 块的末尾添加（在 setSessionId 之后）：

```typescript
// Auto-generate session title after first assistant response
const msgs = useChatStore.getState().messages
const userMsgs = msgs.filter(m => m.role === 'user')
const firstUserPrompt = (userMsgs[0] as StandardChatMessage)?.content || ''
if (userMsgs.length === 1 && firstUserPrompt && claudeSessionId) {
  window.electronAPI.sessionGenerateTitle(firstUserPrompt).then((title: string) => {
    if (title) {
      window.electronAPI.sessionRename(claudeSessionId, title)
    }
  }).catch(() => {})
}
```

- [ ] **Step 5: 构建验证**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui && npm run build
```

预期：0 错误。

---

### Task 8：完成通知

**背景：** 当 Claude 完成回答（`cli:result` 或 `cli:processExit` 事件），若窗口不在前台，通过 Web Notifications API 推送系统通知。

**Files:**
- Modify: `src/renderer/hooks/useStreamJson.ts`

- [ ] **Step 1: 在 useStreamJson.ts 添加通知逻辑**

在文件顶部添加工具函数：

```typescript
function sendCompletionNotification(summary: string) {
  if (document.hasFocus()) return  // 窗口在前台不通知
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification('Claude 已完成', { body: summary.slice(0, 100), icon: '' })
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        new Notification('Claude 已完成', { body: summary.slice(0, 100) })
      }
    })
  }
}
```

在 `case 'cli:result':` 块中，在 setStreaming 前调用：

```typescript
// Completion notification
const resultText = (ev?.result as string) || ''
sendCompletionNotification(resultText || '对话已完成')
```

在 `useEffect` 的开头（组件挂载时）请求权限：

```typescript
useEffect(() => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
  // ... 现有 onCliEvent 订阅
}, [])
```

- [ ] **Step 2: 构建验证**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui && npm run build
```

预期：0 错误。

---

### Task 9：消息评分（本地存储）

**背景：** 给 assistant 消息添加 👍/👎 按钮，评分存储在 Electron Store 中（不上传）。可在未来用于筛选好/坏回复。

**Files:**
- Modify: `src/renderer/types/app.types.ts`
- Modify: `src/renderer/components/chat/Message.tsx`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 添加 rating 到 StandardChatMessage**

在 `src/renderer/types/app.types.ts` 的 `StandardChatMessage` 中添加：

```typescript
rating?: 'up' | 'down' | null
```

- [ ] **Step 2: 添加 IPC handler 存储评分（用 electron-store）**

在 `src/main/ipc/index.ts` 的 `registerConfigHandlers` 内添加：

```typescript
ipcMain.handle('feedback:rate', (_e, { messageId, rating }) => {
  // Store in prefs store (reuse existing config-manager)
  const key = `feedback.${messageId}`
  setPref(key, rating)
})
```

- [ ] **Step 3: 暴露到 preload**

```typescript
feedbackRate: (messageId: string, rating: 'up' | 'down' | null) =>
  ipcRenderer.invoke('feedback:rate', { messageId, rating }),
```

- [ ] **Step 4: �� Message.tsx 添加评分按钮**

在 Message 组件中添加 `onRate` prop，MessageList 负责调用 store + IPC。

**MessageList.tsx** 中传入 onRate 回调：

```tsx
// 在 MessageList 顶部引入 useChatStore：
const { rateMessage } = useChatStore()

// 渲染 Message 时传入 onRate：
<Message
  key={msg.id}
  message={msg}
  onPermission={onPermission}
  onGrantPermission={onGrantPermission}
  onRate={(msgId, rating) => {
    rateMessage(msgId, rating)
    window.electronAPI.feedbackRate(msgId, rating)
  }}
/>
```

**Message.tsx** 中接受 `onRate` prop 并在按钮中调用：

```tsx
// Props 接口添加：
onRate?: (msgId: string, rating: 'up' | 'down' | null) => void

// 在组件签名中解构：
export default function Message({ message, onPermission, onGrantPermission, onRate }) {

// 在 hover 控件区（Copy 按钮旁边），对 assistant 消息添加：
{isAssistant && hovered && onRate && (
  <div style={{ display: 'flex', gap: 4 }}>
    <button
      onClick={() => {
        const cur = (message as StandardChatMessage).rating
        onRate(message.id, cur === 'up' ? null : 'up')
      }}
      title="有用"
      style={{
        background: (message as StandardChatMessage).rating === 'up' ? 'var(--success)' : 'none',
        border: '1px solid var(--border)',
        borderRadius: 4, padding: '2px 6px',
        color: (message as StandardChatMessage).rating === 'up' ? '#fff' : 'var(--text-muted)',
        cursor: 'pointer', fontSize: 12,
      }}
    >👍</button>
    <button
      onClick={() => {
        const cur = (message as StandardChatMessage).rating
        onRate(message.id, cur === 'down' ? null : 'down')
      }}
      title="无用"
      style={{
        background: (message as StandardChatMessage).rating === 'down' ? 'var(--error)' : 'none',
        border: '1px solid var(--border)',
        borderRadius: 4, padding: '2px 6px',
        color: (message as StandardChatMessage).rating === 'down' ? '#fff' : 'var(--text-muted)',
        cursor: 'pointer', fontSize: 12,
      }}
    >👎</button>
  </div>
)}
```

**store/index.ts** 中 rateMessage（已在 Task 9 Step 1 中添加，确认存在）：

```typescript
// 在 ChatState interface:
rateMessage: (msgId: string, rating: 'up' | 'down' | null) => void

// 在 create<ChatState>:
rateMessage: (msgId, rating) => set((s) => ({
  messages: s.messages.map(m => m.id === msgId ? { ...m, rating } as StandardChatMessage : m)
})),
```

- [ ] **Step 5: 最终全量构建验证**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui && npm run build
```

预期：0 错误，所有 3 个 target 编译通过。

- [ ] **Step 6: 启动验证**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui && node_modules/.bin/electron dist/main/index.js
```

验证清单：
- [ ] StatusBar 显示 `$0.0xx` 成本（发一条消息后）
- [ ] StatusBar 显示上下文进度条（发一条消息后）
- [ ] 在聊天框粘贴截图（Ctrl+V），出现缩略图预览
- [ ] 输入 `/` 弹出斜杠命令菜单，选 `/compact` 后发送
- [ ] 设置面板有"系统提示词"文本框，保存后新对话生效
- [ ] 设置面板有"MCP 服务器"tab
- [ ] 对话首轮完成后，会话在历史列表中显示自动生成的标题
- [ ] 窗口最小化时 Claude 回复完成，出现系统通知
- [ ] assistant 消息 hover 时出现 👍👎 按钮

---

## 构建命令参考

```bash
# 全量构建
cd C:/Users/osr/Desktop/AIPA/electron-ui && npm run build

# 单独构建（更快）
npm run build:main      # 主进程 TypeScript
npm run build:preload   # preload TypeScript
npm run build:renderer  # Vite renderer

# 启动
node_modules/.bin/electron dist/main/index.js
```

## 注意事项

1. **无自动化测试** — 项目没有测试套件，每个 task 的验证步骤是手动构建 + 运行检查。
2. **electron-store 保持 v8** — 不要升级到 v10+（ESM 不兼容 CJS main process）。
3. **CLI path 查找** — `generateSessionTitle` 需要找到 `package/cli.js`，使用和 `stream-bridge.ts` 相同的路径候选列表。
4. **image content 格式** — 若 CLI 不支持 JSON 数组格式的 prompt，图片粘贴的 base64 传递需要验证；备选方案是用 `--image` CLI flag（如果 CLI 支���）。
5. **MCP import** — `session-reader.ts` 已经 import 了 `fs`，无需重复；但 `generateSessionTitle` 需要额外 import `spawn from 'child_process'`，注意与顶部现有的 import 合并。
