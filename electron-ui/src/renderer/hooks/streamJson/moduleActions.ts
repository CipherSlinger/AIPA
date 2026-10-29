// Store-level actions the stream hook and its listeners call from outside
// render: prompt history, the "fix this error" actions, and permission rule
// persistence. Moved verbatim (wave 75C) from useStreamJson.ts.
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import type { PromptHistoryItem } from '../../types/app.types'
import { getT } from '../../i18n'
import type { CodexErrorAction } from '../../components/chat/codexErrorText'

// Track prompt sends for analytics (deduped, max 200 items).
// Module-level: touches only store state via getState(), so it needs no hook deps.
export function trackPromptHistory(prompt: string) {
  const text = prompt.trim().slice(0, 500)
  if (!text) return
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  const hash = `ph-${Array.from(normalized).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(36)}`
  const existing: PromptHistoryItem[] = usePrefsStore.getState().prefs.promptHistory || []
  const idx = existing.findIndex(item => item.id === hash)
  const now = Date.now()
  let updated: PromptHistoryItem[]
  if (idx >= 0) {
    updated = [...existing]
    updated[idx] = { ...updated[idx], count: updated[idx].count + 1, lastUsedAt: now }
  } else {
    const newItem: PromptHistoryItem = { id: hash, text, count: 1, lastUsedAt: now, firstUsedAt: now }
    updated = [newItem, ...existing].slice(0, 200)
  }
  usePrefsStore.getState().setPrefs({ promptHistory: updated })
  window.electronAPI?.prefsSet('promptHistory', updated)
}

/**
 * Run the existing app action that a typed Codex error points at. Kept
 * module-level so the event listener can call it without stale closures.
 */
export function runCodexErrorAction(action: CodexErrorAction): void {
  if (action === 'compact') {
    const sessionId = useChatStore.getState().currentSessionId
    if (!sessionId) return
    const chatState = useChatStore.getState()
    if (chatState.lastContextUsage) {
      chatState.setContextBeforeCompact({
        used: chatState.lastContextUsage.used,
        total: chatState.lastContextUsage.total,
      })
    }
    chatState.setCompacting(true)
    window.electronAPI.cliSendMessage({ prompt: '/compact', sessionId }).catch(() => {
      const failed = useChatStore.getState()
      failed.setCompacting(false)
      failed.setContextBeforeCompact(null)
      useUiStore.getState().addToast('error', getT()('compact.failed'))
    })
    return
  }
  if (action === 'account') {
    useUiStore.getState().openSettingsAt('ai-engine')
    return
  }
  useUiStore.getState().openSettingsAt('permissions')
}

// Build a CLI permission rule string from tool name + input
function buildPermissionRule(toolName: string, toolInput: Record<string, unknown>): string {
  if ((toolName === 'Bash' || toolName === 'computer') && toolInput.command) {
    const cmd = String(toolInput.command).trim()
    const firstWord = cmd.split(/\s+/)[0]
    if (firstWord) return `Bash(${firstWord} *)`
  }
  return toolName
}

// Write a permanent allow/deny rule to ~/.claude/settings.json
export async function writePermissionRule(type: 'allow' | 'deny', toolName: string, toolInput: Record<string, unknown>) {
  const rule = buildPermissionRule(toolName, toolInput)
  try {
    const settings = await window.electronAPI.configReadCLISettings()
    const perms = (settings.permissions || {}) as { allow?: string[]; deny?: string[] }
    const list = Array.isArray(perms[type]) ? perms[type]! : []
    if (!list.includes(rule)) {
      list.push(rule)
    }
    await window.electronAPI.configWriteCLISettings({
      permissions: { ...perms, [type]: list },
    })
    const t = getT()
    const toastMsg = type === 'allow'
      ? t('permission.ruleAddedAllow', { rule })
      : t('permission.ruleAddedDeny', { rule })
    useUiStore.getState().addToast('success', toastMsg)
  } catch {
    useUiStore.getState().addToast('warning', getT()('permissions.saveFailed'))
  }
}
