// Recent folders as palette rows — the store/React edge of wave 88B.
//
// The derivation is pure (`recentFolderPalette.ts`); this file adds only what
// a pure module cannot own: the active tab, the preference fallback, the home
// label and the icon. It lives outside `commandPaletteCommands.tsx` because
// that file is already past the decomposition line.
//
// Picking a row starts a new conversation in that folder through
// `applyFolderForView` — the same door the View menu and the folder dialog use.
// A resumed Codex thread runs in the cwd written in its rollout, so a pick
// cannot move it; starting over there is the only honest action.

import React from 'react'
import { FolderOpen } from 'lucide-react'
import { useChatStore, usePrefsStore, useSessionStore } from '../../store'
import { applyFolderForView } from '../../lib/folderPickAction'
import { resolveWorkingDir } from '../../lib/workingDir'
import type { SessionListItem } from '../../types/app.types'
import type { Translate } from '../automation/scheduleText'
import type { PaletteCommand } from './commandPaletteCommands'
import { recentFolderPaletteRows } from './recentFolderPalette'

export interface RecentFolderCommandBuilderArgs {
  t: Translate
  onClose: () => void
  sessions: SessionListItem[]
}

export function buildRecentFolderCommands(args: RecentFolderCommandBuilderArgs): PaletteCommand[] {
  const chat = useChatStore.getState()
  // The folder the open conversation uses, resolved the way the send path
  // resolves it: the active tab's override first, then the global default. The
  // file browser's `chat.workingDir` is deliberately not consulted — it can
  // point at a folder the assistant is not running in.
  const activeTabCwd = chat.tabs.find(tab => tab.id === chat.activeTabId)?.cwd ?? ''
  const currentDir = resolveWorkingDir({
    tabCwd: activeTabCwd,
    globalDir: usePrefsStore.getState().prefs.workingDir,
  }).dir

  const rows = recentFolderPaletteRows({
    sessions: args.sessions,
    homeDir: useSessionStore.getState().homeDir,
    currentDir,
    platform: window.electronAPI?.versions?.platform,
    t: args.t,
  })

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    icon: <FolderOpen size={14} />,
    category: 'action' as const,
    action: () => {
      // Close first, then act: the action reads live state, and the palette is
      // gone by the time the folder dialog (or the toast) would be seen.
      args.onClose()
      applyFolderForView(row.dir)
    },
  }))
}
