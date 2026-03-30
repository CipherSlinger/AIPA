/**
 * Shortcut Registry -- single source of truth for all keyboard shortcuts.
 *
 * This file serves two purposes:
 * 1. Documentation: A centralized map of all shortcuts preventing conflicts
 * 2. Validation: Can be used to detect collisions at compile time
 *
 * Shortcuts are grouped by the file/hook that owns the handler.
 * Each entry maps a key combo string to a description.
 *
 * When adding a new shortcut:
 * 1. Add the entry here FIRST
 * 2. Search this file for the key combo to verify no collision
 * 3. Then implement the handler in the appropriate file
 */

export interface ShortcutEntry {
  /** Human-readable key combo, e.g. "Ctrl+Shift+P" */
  keys: string
  /** What the shortcut does */
  description: string
  /** File that owns the handler */
  owner: string
  /** i18n key for cheatsheet label (if displayed) */
  cheatsheetKey?: string
}

/**
 * Master shortcut registry.
 * Grouped by owner file for readability.
 */
export const SHORTCUT_REGISTRY: ShortcutEntry[] = [
  // ===== App.tsx (global, always active) =====
  { keys: 'Ctrl+L', description: 'Focus chat input', owner: 'App.tsx', cheatsheetKey: 'focusChatInput' },
  { keys: 'Ctrl+,', description: 'Open settings', owner: 'App.tsx', cheatsheetKey: 'openSettings' },
  { keys: 'Ctrl+B', description: 'Toggle sidebar', owner: 'App.tsx', cheatsheetKey: 'toggleSidebar' },
  { keys: 'Ctrl+N', description: 'New conversation (double-press)', owner: 'App.tsx', cheatsheetKey: 'newConversation' },
  { keys: 'Ctrl+K', description: 'Clear conversation (double-press)', owner: 'App.tsx', cheatsheetKey: 'clearConversation' },
  { keys: 'Ctrl+`', description: 'Toggle terminal', owner: 'App.tsx', cheatsheetKey: 'toggleTerminal' },
  { keys: 'Ctrl+Shift+P', description: 'Command palette', owner: 'App.tsx', cheatsheetKey: 'commandPalette' },
  { keys: 'Ctrl+/', description: 'Shortcut cheatsheet', owner: 'App.tsx', cheatsheetKey: 'thisCheatsheet' },
  { keys: 'Ctrl+Shift+O', description: 'Focus mode', owner: 'App.tsx', cheatsheetKey: 'focusMode' },
  { keys: 'Ctrl+Shift+N', description: 'Toggle Notes panel', owner: 'App.tsx', cheatsheetKey: 'toggleNotes' },
  { keys: 'Ctrl+Shift+C', description: 'Collapse/expand all messages', owner: 'App.tsx', cheatsheetKey: 'collapseExpandAll' },
  { keys: 'Ctrl+Shift+D', description: 'Cycle theme (System/Dark/Light)', owner: 'App.tsx', cheatsheetKey: 'toggleTheme' },
  { keys: 'Ctrl+Shift+L', description: 'Toggle language (en/zh-CN)', owner: 'App.tsx', cheatsheetKey: 'toggleLanguage' },
  { keys: 'Ctrl+Shift+M', description: 'Cycle model (Sonnet/Opus/Haiku)', owner: 'App.tsx', cheatsheetKey: 'cycleModel' },
  { keys: 'Ctrl+Shift+T', description: 'Pin window on top', owner: 'App.tsx', cheatsheetKey: 'pinWindow' },
  { keys: 'Ctrl+1-9', description: 'Switch sidebar tab', owner: 'App.tsx', cheatsheetKey: 'switchSidebarTab' },
  { keys: '/', description: 'Focus session search (when not in input)', owner: 'App.tsx', cheatsheetKey: 'quickSearch' },
  { keys: 'Ctrl+[', description: 'Previous session', owner: 'App.tsx', cheatsheetKey: 'prevNextSession' },
  { keys: 'Ctrl+]', description: 'Next session', owner: 'App.tsx', cheatsheetKey: 'prevNextSession' },

  // ===== useChatPanelShortcuts.ts (chat panel, always active when ChatPanel mounted) =====
  { keys: 'Ctrl+Shift+E', description: 'Export conversation', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'exportConversation' },
  { keys: 'Ctrl+Shift+X', description: 'Copy conversation', owner: 'useChatPanelShortcuts.ts' },
  { keys: 'Ctrl+Shift+B', description: 'Toggle bookmarks panel', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'toggleBookmarks' },
  { keys: 'Ctrl+Shift+S', description: 'Toggle stats panel', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'toggleStats' },
  { keys: 'Ctrl+F', description: 'Search in conversation', owner: 'useChatPanelShortcuts.ts' },
  { keys: 'Ctrl+Shift+F', description: 'Global cross-session search', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'globalSearch' },
  { keys: 'Ctrl+Shift+K', description: 'Compact conversation context', owner: 'useChatPanelShortcuts.ts' },
  { keys: 'Ctrl+Shift+R', description: 'Regenerate response', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'regenerate' },
  { keys: 'Ctrl+Home', description: 'Jump to first message', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'jumpToFirstMessage' },
  { keys: 'Ctrl+End', description: 'Jump to last message', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'jumpToLastMessage' },
  { keys: 'Alt+Up', description: 'Jump to previous user message', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'jumpUserMessage' },
  { keys: 'Alt+Down', description: 'Jump to next user message', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'jumpUserMessage' },
  { keys: 'PageUp', description: 'Scroll up by page', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'pageUpDown' },
  { keys: 'PageDown', description: 'Scroll down by page', owner: 'useChatPanelShortcuts.ts', cheatsheetKey: 'pageUpDown' },
  { keys: 'Escape', description: 'Stop streaming (when not in input/modal)', owner: 'useChatPanelShortcuts.ts' },

  // ===== ChatInput.tsx (only when textarea is focused) =====
  { keys: 'Ctrl+Shift+Q', description: 'Toggle task queue', owner: 'ChatInput.tsx' },
  { keys: 'Ctrl+U', description: 'Clear input text', owner: 'ChatInput.tsx' },
  { keys: 'Ctrl+B (in textarea)', description: 'Bold selected text', owner: 'ChatInput.tsx' },
  { keys: 'Ctrl+I (in textarea)', description: 'Italic selected text', owner: 'ChatInput.tsx' },
  { keys: 'Ctrl+Shift+U', description: 'Cycle text case', owner: 'ChatInput.tsx' },

  // ===== useChatZoom.ts =====
  { keys: 'Ctrl+=', description: 'Zoom in chat', owner: 'useChatZoom.ts' },
  { keys: 'Ctrl+-', description: 'Zoom out chat', owner: 'useChatZoom.ts' },
  { keys: 'Ctrl+0', description: 'Reset chat zoom', owner: 'useChatZoom.ts' },

  // ===== SessionList.tsx (when session list is focused) =====
  { keys: 'F2', description: 'Rename session', owner: 'SessionList.tsx', cheatsheetKey: 'renameSession' },
  { keys: 'Delete', description: 'Delete session', owner: 'SessionList.tsx', cheatsheetKey: 'deleteSession' },
  { keys: 'Up/Down', description: 'Navigate sessions', owner: 'SessionList.tsx', cheatsheetKey: 'navigateSessions' },
  { keys: 'Enter', description: 'Open selected session', owner: 'SessionList.tsx', cheatsheetKey: 'openSession' },

  // ===== Electron main process menu accelerators =====
  { keys: 'Ctrl+Shift+Space', description: 'Toggle window (global)', owner: 'main/index.ts', cheatsheetKey: 'toggleWindow' },
  { keys: 'Ctrl+Shift+G', description: 'Clipboard quick action (global)', owner: 'main/index.ts', cheatsheetKey: 'clipboardQuickAction' },
]

/**
 * Validate the registry for duplicate key combos.
 * Call during development to catch conflicts early.
 * Returns array of conflict descriptions, empty if clean.
 */
export function validateShortcutRegistry(): string[] {
  const seen = new Map<string, ShortcutEntry>()
  const conflicts: string[] = []

  for (const entry of SHORTCUT_REGISTRY) {
    // Normalize: remove "(in textarea)" qualifiers for conflict checking
    const normalizedKey = entry.keys.replace(/\s*\(.*?\)\s*/, '')

    // Skip context-dependent shortcuts (F2, Delete, etc. only active in specific components)
    if (['F2', 'Delete', 'Up/Down', 'Enter'].includes(normalizedKey)) continue

    const existing = seen.get(normalizedKey)
    if (existing) {
      conflicts.push(
        `CONFLICT: "${normalizedKey}" registered in both ${existing.owner} (${existing.description}) and ${entry.owner} (${entry.description})`
      )
    } else {
      seen.set(normalizedKey, entry)
    }
  }

  return conflicts
}
