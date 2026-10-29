// What the chat header's working-directory line should say, and what a click on
// it can honestly do.
//
// The header used to keep three half-answers to one question: a label from the
// resolver, a folder pick that moved the tab, and a menu item that wrote the
// global preference. A recorded Codex conversation cannot be moved by a pick —
// `thread/resume` runs the turn in the folder written in its rollout — so the
// line has to know which of the two things a pick means before it offers one.
//
// Pure: no React, no IPC, no i18n. The component owns the picker and the
// popover; this module owns the decisions the harness can drive.

import {
  folderChangeTarget,
  resolveWorkingDir,
  workingDirLabel,
  type FolderTarget,
  type WorkingDirSource,
} from '../../lib/workingDir'

/** Where the folder named on the line came from. `recorded` is the transcript's own record. */
export type WorkingDirChipSource = WorkingDirSource | 'recorded'

export interface WorkingDirChipInput {
  /** The open tab's override — picked here, or restored from the conversation. */
  tabCwd?: string | null
  /** The preference every new conversation starts from. */
  globalDir?: string | null
  /** Last resort, and the one folder that is not a working folder. */
  homeDir?: string | null
  /** The folder recorded in this conversation's transcript, when there is one. */
  recordedCwd?: string | null
  /** The recorded folder the open path proved missing for this conversation. */
  goneDir?: string | null
}

export interface WorkingDirChipView {
  /** false when no folder is known — the line is omitted rather than guessed. */
  visible: boolean
  /** `gone` marks a recorded folder the transcript names and the filesystem does not have. */
  state: 'normal' | 'gone'
  /** The full path the line stands for, and the tooltip's first line. */
  dir: string
  /** Last segment, or `~/child` — a chip cannot afford the whole path. */
  label: string
  source: WorkingDirChipSource
  /** What a pick can mean for the conversation on screen. */
  target: FolderTarget
}

function trimmed(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function workingDirChipModel(input: WorkingDirChipInput): WorkingDirChipView {
  const resolved = resolveWorkingDir({
    tabCwd: input.tabCwd,
    globalDir: input.globalDir,
    homeDir: input.homeDir,
  })
  const gone = trimmed(input.goneDir)

  // A folder the open path proved missing is the one fact worth showing even
  // though the tab has already fallen back to something that exists: the turn
  // will run in the missing folder anyway, so naming the fallback here would be
  // the lie. `recorded` also proves a record exists, so a pick there can only
  // start a new conversation even when the session list has not loaded.
  if (gone) {
    return {
      visible: true,
      state: 'gone',
      dir: gone,
      label: workingDirLabel(gone, input.homeDir),
      source: 'recorded',
      target: 'new_conversation',
    }
  }

  // A recorded conversation runs where its transcript says, full stop — a tab
  // override that disagrees (a worktree switch, or an older build's write) does
  // not move a resumed thread. Naming the override here would be the same lie
  // the chip exists to prevent, so the record wins even when the tab says
  // otherwise.
  const recorded = trimmed(input.recordedCwd)
  if (recorded) {
    return {
      visible: true,
      state: 'normal',
      dir: recorded,
      label: workingDirLabel(recorded, input.homeDir),
      source: 'recorded',
      target: 'new_conversation',
    }
  }

  if (!resolved.dir) {
    return {
      visible: false,
      state: 'normal',
      dir: '',
      label: '',
      source: 'none',
      // Nothing is shown in this state, but a pick's meaning does not depend on
      // whether the line is visible: a record still means "new conversation".
      target: folderChangeTarget(input.recordedCwd),
    }
  }

  return {
    visible: true,
    state: 'normal',
    dir: resolved.dir,
    label: workingDirLabel(resolved.dir, input.homeDir),
    source: resolved.source,
    target: folderChangeTarget(input.recordedCwd),
  }
}
