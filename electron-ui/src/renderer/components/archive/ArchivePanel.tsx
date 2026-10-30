// ArchivePanel — 档案部: the company-wide ledger of finished work.
//
// Every department roster answers "who works here"; this answers "what has this
// company actually done, and who did it". A record is a session, because a
// session *is* an employee's run at a task, and it is attributed to the node
// whose folder it ran in — unless the user filed it by hand, which wins. That
// attribution is derived, not stored; see `resolveDeptForSession` in
// departments/sessionFiling for the one join between the two. Sessions in
// folders no node owns are not lost: they land in an explicit 未分派 group.
//
// Records are *grouped* by the top of their branch, not by the leaf that owns
// them. Once an org has three levels, grouping by leaf would shred one company's
// ledger into a row of 研发部 / 前端组 / 后端组 groups with no visible relation;
// the leaf is shown per record instead, and the group is the company.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Inbox,
  PenLine,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { useDepartmentStore, usePrefsStore, useSessionStore, useTaskStore, useUiStore, type Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { useT, useI18n } from '../../i18n'
import {
  deptDisplayName, deptEmoji, kindOf, rootOf,
} from '../departments/deptUtils'
import { buildDeptLookup, resolveDeptForSession } from '../departments/sessionFiling'
import { openSessionCore } from '../departments/openSessionCore'
import LegacyFolderImport from '../departments/LegacyFolderImport'
import { openTaskConversation } from '../../lib/taskDispatch'
import FileUnderDeptDialog from '../chat/FileUnderDeptDialog'
import { displayTitle } from '../../lib/sessionTitle'
import { workingDirLabel } from '../../lib/workingDir'
import { formatDateTimeShort } from '../../utils/formatDate'
import { CommandOnlyNotice, EmptyState, Pill } from './ArchiveChrome'
import ArchiveFolderSelect from './ArchiveFolderSelect'
import {
  ALL_FOLDER_FILTER, deriveArchiveFolderOptions, matchesFolderFilter,
  type ArchiveFolderFilter,
} from './archiveFolderFilter'
import ArchiveJobSummary from './ArchiveJobSummary'
import { filterByHandFiling, hasHandFiling } from './archiveFiling'
import {
  askScopeLabelKey, askScopeOmitted, collectAskScope,
  MAX_ARCHIVE_ASK_SCOPE,
} from './archiveAskScope'
import {
  deriveJobOptions, isFilteredEmpty, jobAfterOriginChange, resolveJobSelection,
  visibleJobOptions, type ArchiveOriginKind,
} from './archiveJobFilter'
import ArchiveRow, { ROW_H } from './ArchiveRow'
import ArchiveBulkBar from './ArchiveBulkBar'
import { ELLIPSIS, employeeTag, recordTitle, type ArchiveRecord } from './archiveRecord'
import {
  emptySelection, pruneSelection, selectAllInView, selectedInView,
  selectionMode, toggleSelected,
} from './archiveSelection'
import { useArchiveBulkActions } from './useArchiveBulkActions'

type TimeRange = 'all' | 'today' | 'week' | 'month'

/**
 * How a conversation began. 'user' is the absence of an origin, which keeps
 * the common case addressable by the filter without inventing a third kind.
 */
type OriginFilter = ArchiveOriginKind
const ORIGIN_FILTERS: OriginFilter[] = ['all', 'user', 'automation', 'plugin']

function originKind(session: SessionListItem): Exclude<OriginFilter, 'all'> {
  return session.origin?.kind ?? 'user'
}
/** Sentinel for the department filter's "not assigned to any department" option. */
const UNASSIGNED = '__unassigned__'
/** Stable empty fallback for an unset `archivedSessions` pref. */
const EMPTY_ARCHIVED: string[] = []

/**
 * A transcript that never contains a human-authored message still produces a
 * listing entry: slash commands, `/clear`, `/exit` and harness wrappers all
 * arrive as user entries, so the title resolves to the untitled fallback.
 * Such runs are command-bookkeeping, not work. The message count is what keeps
 * this honest — a long session whose title merely failed to resolve is real
 * work and must stay in the ledger.
 */
const COMMAND_ONLY_MAX_MESSAGES = 4
/** Remembers the "show command-only rows" choice between launches. */
const SHOW_COMMAND_ONLY_KEY = 'aipa:archive-showCommandOnly'

/** localStorage can be unavailable (privacy modes, locked profiles); default off. */
function readShowCommandOnly(): boolean {
  try {
    return window.localStorage.getItem(SHOW_COMMAND_ONLY_KEY) === '1'
  } catch {
    return false
  }
}

// ── Fixed geometry ───────────────────────────────────────────────────────────
// The ledger is windowed, so every block's size has to be known without
// measuring the DOM. These numbers mirror the styles below exactly: a row is
// 35px (including its 1px separator — `ROW_H` is shared with ArchiveRow so the
// two cannot drift), a group header is 25px, the card border contributes 2px,
// groups are separated by an 18px flex gap and the scroller has 12px of top
// padding.
const GROUP_HEADER_H = 25
const CARD_BORDER_H = 2
const GROUP_GAP = 18
const LEDGER_PAD_TOP = 12
/** Off-screen rows kept mounted on each side so fast scrolling stays blank-free. */
const OVERSCAN_ROWS = 8
/** Initial slice rendered before the scroller has been measured. */
const INITIAL_VIEWPORT_H = 900

interface ArchiveGroup {
  /** null for the 未分派 group. */
  root: Department | null
  records: ArchiveRecord[]
  /** Newest timestamp in the group — the ledger reads best newest-company-first. */
  latest: number
}

const TIME_WINDOWS: Record<Exclude<TimeRange, 'all'>, number> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
}

export default function ArchivePanel() {
  const t = useT()
  const { resolvedLocale } = useI18n()
  const departments = useDepartmentStore(s => s.departments)
  const sessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const homeDir = useSessionStore(s => s.homeDir)
  const storedArchived = usePrefsStore(s => s.prefs.archivedSessions)
  // Module-level fallback keeps the identity stable when the pref is unset —
  // a fresh `[]` would invalidate every memo that depends on it.
  const archivedSessions = storedArchived ?? EMPTY_ARCHIVED
  const setPrefs = usePrefsStore(s => s.setPrefs)
  // `null` means the one-time probe has not answered yet; the palette keeps its
  // ask command in that case, and this button follows the same rule so a slow
  // probe never hides a capability that may well be working.
  const askAvailable = useUiStore(s => s.askHistoryAvailable)

  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all')
  // One scheduled job under the origin filter; null means "every job".
  const [jobFilter, setJobFilter] = useState<string | null>(null)
  // Which folder the work ran in. `all` is the absence of the facet, `none`
  // is the explicit "no folder recorded" choice.
  const [folderFilter, setFolderFilter] = useState<ArchiveFolderFilter>(ALL_FOLDER_FILTER)
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [opening, setOpening] = useState<string | null>(null)
  const [showCommandOnly, setShowCommandOnly] = useState<boolean>(readShowCommandOnly)
  // Client-side only: the hand-filed toggle narrows what is already loaded and
  // never starts an IPC call or re-reads the session list.
  const [onlyHandFiled, setOnlyHandFiled] = useState(false)
  // One dialog for the panel, opened for whichever row asked for it.
  const [filingSessionId, setFilingSessionId] = useState<string | null>(null)
  // ── Selection ──
  // Scoped to the current filtered view; the prune effect below is what keeps
  // that promise. `prunedCount` is the receipt for a filter change that dropped
  // selected rows, so the selection never shrinks silently.
  const [selection, setSelection] = useState<ReadonlySet<string>>(emptySelection)
  const [prunedCount, setPrunedCount] = useState(0)
  // A delete in flight: the bar stays mounted but cannot start a second batch.
  const [bulkBusy, setBulkBusy] = useState(false)
  const { deleteSessions, setArchived } = useArchiveBulkActions()

  // Remember the reveal choice; the toggle itself still works if storage throws.
  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_COMMAND_ONLY_KEY, showCommandOnly ? '1' : '0')
    } catch { /* the choice still applies for this session */ }
  }, [showCommandOnly])

  const archivedSet = useMemo(() => new Set(archivedSessions), [archivedSessions])
  // One index for the whole listing: the manual-filing precedence and the
  // folder join are answered by the same resolver every other surface uses.
  const tasks = useTaskStore(s => s.tasks)
  const lookup = useMemo(() => buildDeptLookup(departments, homeDir, tasks), [departments, homeDir, tasks])
  const filings = useDepartmentStore(s => s.filings)
  const byId = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])
  const tasksById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks])

  // Every session is a record. Attribution is a lookup, never stored.
  const untitled = t('session.untitled')
  const allRecords: ArchiveRecord[] = useMemo(
    () => sessions.map(session => {
      const resolution = resolveDeptForSession(session, lookup, filings)
      const dept = resolution.dept
      const taskId = lookup.taskBySession.get(session.sessionId)?.taskId
      return {
        session,
        dept,
        removedDeptName: resolution.source === 'removed' ? resolution.filing.deptName : null,
        root: dept ? rootOf(dept, byId) : null,
        task: taskId ? tasksById.get(taskId) ?? null : null,
        archived: archivedSet.has(session.sessionId),
        // An untitled label means no human message named the session; the
        // count then separates a command echo from a real run with a lost title.
        commandOnly: displayTitle(session, untitled) === untitled
          && (session.messageCount ?? 0) <= COMMAND_ONLY_MAX_MESSAGES,
        // The marker and the filter share this one question, so a removed
        // filing is "filed by hand" here even though it owns no live node.
        handFiled: hasHandFiling(filings, session.sessionId),
      }
    }),
    [sessions, lookup, filings, archivedSet, byId, tasksById, untitled],
  )

  const queryText = query.trim().toLowerCase()
  const searching = queryText.length > 0

  // Everything except the job filter, the search box and the command-only
  // suppression. These are applied separately because the job options must not
  // collapse to the job already selected, the hidden count must not depend on
  // the text being searched, and search must be able to see command-only rows.
  const originScopedRecords = useMemo(() => {
    const cutoff = timeRange === 'all' ? 0 : Date.now() - TIME_WINDOWS[timeRange]
    return allRecords.filter(r => {
      if (!showArchived && r.archived) return false
      if (timeRange !== 'all' && r.session.timestamp < cutoff) return false
      // The filter picks a branch, so anything anywhere under it matches.
      if (deptFilter === UNASSIGNED ? r.dept !== null : deptFilter !== 'all' && r.root?.id !== deptFilter) return false
      if (originFilter !== 'all' && originKind(r.session) !== originFilter) return false
      // The folder is a top-level facet like the department: applied here so
      // every downstream step (job, search, command-only, selection) sees the
      // same scoped set. A row another filter excluded cannot come back here.
      if (!matchesFolderFilter(r.session.cwd, folderFilter)) return false
      return true
    })
  }, [allRecords, timeRange, showArchived, deptFilter, originFilter, folderFilter])

  // The job choices describe the archive, not the current origin/time slice:
  // picking one must not change the choices or their counts, and a job should
  // not vanish merely because another filter is narrowing the ledger.
  const jobOptions = useMemo(
    () => deriveJobOptions(
      allRecords.filter(r => showArchived || !r.archived).map(r => r.session),
    ),
    [allRecords, showArchived],
  )
  const jobChoices = useMemo(() => visibleJobOptions(jobOptions), [jobOptions])

  // Folder choices describe the archive, not the current slice: picking one must
  // not make the others disappear. Archived rows follow the same visibility rule
  // as the job options, so a hidden row cannot add a folder to the selector.
  const folderOptions = useMemo(
    () => deriveArchiveFolderOptions(
      allRecords.filter(r => showArchived || !r.archived).map(r => r.session),
      { homeDir },
    ),
    [allRecords, showArchived, homeDir],
  )

  // A job can vanish from the loaded set (deleted, or all its runs archived
  // away), or stop being a choice when it becomes the only one left. Either
  // way the selection would outlive the control that can turn it off.
  useEffect(() => {
    const resolved = resolveJobSelection(jobChoices, jobFilter)
    if (resolved !== jobFilter) setJobFilter(resolved)
  }, [jobChoices, jobFilter])

  const scopedRecords = useMemo(() => {
    if (!jobFilter) return originScopedRecords
    return originScopedRecords.filter(r => {
      const origin = r.session.origin
      return origin?.kind === 'automation' && origin.jobId === jobFilter
    })
  }, [originScopedRecords, jobFilter])

  const commandOnlyCount = useMemo(
    () => scopedRecords.filter(r => r.commandOnly).length,
    [scopedRecords],
  )

  const records = useMemo(() => {
    const matched = searching
      ? scopedRecords.filter(r => {
          const haystack = `${r.session.title || ''}\n${r.session.lastPrompt || ''}\n${r.session.project || ''}`
          return haystack.toLowerCase().includes(queryText)
        })
      : scopedRecords
    // A search that hit a command-only transcript must report the hit; hiding
    // it behind the default filter would read as "nothing matches".
    return searching || showCommandOnly ? matched : matched.filter(r => !r.commandOnly)
  }, [scopedRecords, searching, queryText, showCommandOnly])

  // The hand-filed toggle composes last, over the fully filtered listing, so it
  // cannot resurrect a row another filter excluded. `hidden` is what the notice
  // below the ledger reports, and it never starts an IPC call.
  const handFiltered = useMemo(
    () => filterByHandFiling(records, filings, onlyHandFiled),
    [records, filings, onlyHandFiled],
  )
  const visibleRecords = handFiltered.visible
  const handHiddenCount = handFiltered.hidden

  // ── Selection, scoped to the view ──
  // All three derive from `visibleRecords`, the fully filtered listing. A bulk
  // action reads `selectedVisibleIds`, so even the one render between a filter
  // change and the prune effect cannot act on a row the user cannot see.
  const visibleIds = useMemo(
    () => visibleRecords.map(r => r.session.sessionId),
    [visibleRecords],
  )
  const selectedVisibleIds = useMemo(
    () => selectedInView(selection, visibleIds),
    [selection, visibleIds],
  )
  const selectionModeValue = useMemo(
    () => selectionMode(selection, visibleIds),
    [selection, visibleIds],
  )
  const selectedArchivedCount = useMemo(
    () => selectedVisibleIds.filter(id => archivedSet.has(id)).length,
    [selectedVisibleIds, archivedSet],
  )

  // A filter change (or a write action) can take selected rows out of the view.
  // Keep only visible-and-selected and report how many were dropped: shrinking
  // the number without a word is exactly the silent behaviour to avoid.
  useEffect(() => {
    const result = pruneSelection(selection, visibleIds)
    if (result.dropped === 0) return
    setSelection(result.selected)
    setPrunedCount(result.dropped)
  }, [selection, visibleIds])

  const toggleRowSelection = useCallback((id: string) => {
    setPrunedCount(0)
    setSelection(current => toggleSelected(current, id))
  }, [])

  const toggleAllSelection = useCallback(() => {
    setPrunedCount(0)
    // 'some' means the next press selects everything shown; only a full view
    // clears it.
    setSelection(current => selectAllInView(current, visibleIds, selectionModeValue !== 'all'))
  }, [visibleIds, selectionModeValue])

  const clearSelection = useCallback(() => {
    setPrunedCount(0)
    setSelection(emptySelection())
  }, [])

  const archiveSelected = useCallback((archive: boolean) => {
    const ids = selectedVisibleIds
    // Empty the selection before writing: the bar must not be able to offer the
    // same batch twice while the prefs change re-renders the ledger.
    setPrunedCount(0)
    setSelection(emptySelection())
    setArchived(ids, archive)
  }, [selectedVisibleIds, setArchived])

  const deleteSelected = useCallback(async () => {
    if (bulkBusy || selectedVisibleIds.length === 0) return
    const chosen = new Set(selectedVisibleIds)
    const items = visibleRecords
      .filter(r => chosen.has(r.session.sessionId))
      .map(r => ({ id: r.session.sessionId, title: recordTitle(r.session, t('session.untitled')) }))
    setPrunedCount(0)
    setSelection(emptySelection())
    setBulkBusy(true)
    try {
      await deleteSessions(items)
    } finally {
      setBulkBusy(false)
    }
  }, [bulkBusy, deleteSessions, selectedVisibleIds, visibleRecords, t])

  /** The row's own delete is the same batch path with one item in it. */
  const deleteOne = useCallback((record: ArchiveRecord) => {
    const sessionId = record.session.sessionId
    // Same as the row's archive toggle: the delete was asked for, so its row
    // must not show up later as "selected rows left the view".
    setSelection(currentSelection => {
      if (!currentSelection.has(sessionId)) return currentSelection
      const kept = new Set(currentSelection)
      kept.delete(sessionId)
      return kept
    })
    void deleteSessions([{
      id: sessionId,
      title: recordTitle(record.session, t('session.untitled')),
    }])
  }, [deleteSessions, t])

  // What "ask about these" would send, previewed on every listing change so the
  // number on the button is the count that will actually leave: distinct session
  // ids, capped. The click recollects from `visibleRecords` rather than trusting
  // this memo, so a filter changed in the same tick can never leak a stale scope.
  const askScopePreview = useMemo(() => collectAskScope(visibleRecords), [visibleRecords])
  const askCount = askScopePreview.sessionIds.length

  // Group by the top of each branch, newest-worked group first, 未分派 last.
  const groups: ArchiveGroup[] = useMemo(() => {
    const byRoot = new Map<string, ArchiveGroup>()
    for (const record of visibleRecords) {
      const key = record.root?.id ?? UNASSIGNED
      let group = byRoot.get(key)
      if (!group) {
        group = { root: record.root, records: [], latest: 0 }
        byRoot.set(key, group)
      }
      group.records.push(record)
      group.latest = Math.max(group.latest, record.session.timestamp)
    }
    return [...byRoot.values()].sort((a, b) => {
      if (!a.root) return 1
      if (!b.root) return -1
      return b.latest - a.latest
    })
  }, [visibleRecords])

  // Scroll window. The ledger only mounts rows near the viewport; everything
  // else is represented by two spacer divs inside the group card, so the card's
  // border and the group header stay in normal flow and keep their offsets.
  const ledgerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ top: 0, height: INITIAL_VIEWPORT_H })

  useLayoutEffect(() => {
    const el = ledgerRef.current
    if (!el) return
    let frame = 0
    const sync = () => {
      frame = 0
      const top = el.scrollTop
      const height = el.clientHeight
      setViewport(v => (v.top === top && v.height === height ? v : { top, height }))
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(sync)
    }
    sync()
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    observer?.observe(el)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
      observer?.disconnect()
    }
  }, [])

  /** Groups with their analytic offsets, so windowing never has to measure. */
  const layout = useMemo(() => {
    let y = LEDGER_PAD_TOP
    return groups.map(group => {
      const key = group.root?.id ?? UNASSIGNED
      const isCollapsed = !!collapsed[key]
      const cardHeight = isCollapsed ? 0 : group.records.length * ROW_H + CARD_BORDER_H
      const item = {
        key,
        group,
        isCollapsed,
        rowsTop: y + GROUP_HEADER_H + 1,
        cardHeight,
      }
      y += GROUP_HEADER_H + cardHeight + GROUP_GAP
      return item
    })
  }, [groups, collapsed])

  // The header counts what the ledger shows. When command-only rows are hidden,
  // the notice below the list accounts for the difference instead of the header
  // quietly reporting a total the user cannot see.
  const summary = useMemo(() => {
    const weekCutoff = Date.now() - TIME_WINDOWS.week
    const week = visibleRecords.filter(r => r.session.timestamp >= weekCutoff).length
    const rootIds = new Set(visibleRecords.map(r => r.root?.id).filter(Boolean) as string[])
    return { total: visibleRecords.length, roots: rootIds.size, week }
  }, [visibleRecords])

  /** The filter's options — one per branch that actually holds work. */
  const filterTargets = useMemo(() => {
    const seen = new Map<string, Department>()
    for (const r of allRecords) if (r.root) seen.set(r.root.id, r.root)
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [allRecords])

  // Keep the footer's number aligned with the visible ledger: hidden command
  // rows are still counted by `allRecords`, and reporting them here would
  // contradict the header directly above.
  const unassignedCount = useMemo(() => {
    const hidingCommandOnly = !searching && !showCommandOnly
    return allRecords.filter(r => r.dept === null && !(hidingCommandOnly && r.commandOnly)).length
  }, [allRecords, searching, showCommandOnly])

  const open = useCallback(async (record: ArchiveRecord) => {
    setOpening(record.session.sessionId)
    try {
      if (record.task) {
        // A task conversation opens through the task surface: its tab carries
        // the task's own folder, never the legacy department directory.
        const ref = record.task.sessions.find(item => item.sessionId === record.session.sessionId)
        if (ref) {
          await openTaskConversation(record.task, ref, record.session)
          return
        }
      }
      await openSessionCore(record.session, record.dept?.directory ?? '', 'archive')
    } finally {
      setOpening(null)
    }
  }, [])

  const toggleArchived = useCallback((sessionId: string) => {
    const current = usePrefsStore.getState().prefs.archivedSessions || []
    const next = current.includes(sessionId)
      ? current.filter(id => id !== sessionId)
      : [...current, sessionId]
    setPrefs({ archivedSessions: next })
    window.electronAPI.prefsSet('archivedSessions', next)
    // Archiving the only row that matched removes it from the view. Drop it
    // from the selection here so the user gets no "selected rows left the
    // view" notice for an action they just asked for.
    setSelection(currentSelection => {
      if (!currentSelection.has(sessionId)) return currentSelection
      const kept = new Set(currentSelection)
      kept.delete(sessionId)
      return kept
    })
  }, [setPrefs])

  const toggleCommandOnly = useCallback(() => {
    setShowCommandOnly(v => !v)
  }, [])

  /** Origin kinds are mutually exclusive; a job only survives an automation-capable one. */
  const selectOrigin = useCallback((kind: OriginFilter) => {
    setOriginFilter(kind)
    setJobFilter(current => jobAfterOriginChange(current, kind))
  }, [])

  const toggleJob = useCallback((jobId: string) => {
    const turningOn = jobFilter !== jobId
    setJobFilter(turningOn ? jobId : null)
    // A job is a scheduled run. Selecting one while "Started by me" is active
    // would match nothing, so the origin kind follows the job.
    if (turningOn) {
      setOriginFilter(kind => (kind === 'all' || kind === 'automation' ? kind : 'automation'))
    }
  }, [jobFilter])

  const exportLedger = useCallback(() => {
    // `groups` is built from the fully filtered ledger, so the export is exactly
    // what the user can see. Each row keeps its full origin, which carries the
    // job id/name.
    const data = groups.map(group => ({
      company: group.root?.name ?? t('archive.unassigned'),
      directory: group.root?.directory ?? null,
      tasks: group.records.map(r => ({
        title: recordTitle(r.session, t('session.untitled')),
        employee: employeeTag(r.session.sessionId),
        // Which desk inside that company the work happened at. A filing whose
        // node was deleted exports the remembered name and says it is no
        // longer live — silently dropping the name would lose the user's own
        // assertion, and substituting the folder would invent one.
        department: r.dept?.name ?? r.removedDeptName ?? null,
        departmentRemoved: r.removedDeptName !== null,
        sessionId: r.session.sessionId,
        project: r.session.project,
        lastPrompt: r.session.lastPrompt,
        messageCount: r.session.messageCount ?? 0,
        timestamp: new Date(r.session.timestamp).toISOString(),
        archived: r.archived,
        origin: r.session.origin ?? null,
      })),
    }))
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), companies: data }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aipa_archive_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [groups, t])

  /**
   * Hand the visible rows to the global ask overlay.
   *
   * The scope comes from `visibleRecords` — the fully filtered list, including
   * the hand-filed toggle applied last. Reading `records` or `allRecords` here
   * would quietly ask about rows the user cannot see. The archive's own filters
   * are deliberately left untouched: the overlay is a separate surface, and
   * clearing the ledger behind it would lose the user's place when they close it.
   */
  const askAboutVisible = useCallback(() => {
    const seed = collectAskScope(visibleRecords)
    const ui = useUiStore.getState()
    // One batch on the shared store: clear the text and department seeds, then
    // install the snapshot. Setting these one at a time across renders would let
    // the overlay mount with a stale seed from an earlier ask.
    ui.setGlobalSearchSeed('')
    ui.setGlobalSearchSeedDeptId(null)
    ui.setGlobalSearchSeedScope(seed)
    ui.setGlobalSearchOpen(true)
  }, [visibleRecords])

  const filtersActive = deptFilter !== 'all' || timeRange !== 'all' || originFilter !== 'all'
    || jobFilter !== null || folderFilter.kind !== 'all' || showArchived || onlyHandFiled
    || query.trim().length > 0
  const clearFilters = () => {
    setDeptFilter('all')
    setTimeRange('all')
    setOriginFilter('all')
    setJobFilter(null)
    setFolderFilter(ALL_FOLDER_FILTER)
    setShowArchived(false)
    setOnlyHandFiled(false)
    setQuery('')
  }

  const filteredEmpty = isFilteredEmpty({
    records: visibleRecords.length,
    scopedRecords: scopedRecords.length,
    allRecords: allRecords.length,
    filtersActive,
    searching,
    showCommandOnly,
    commandOnlyCount,
  })
  // Name the narrowing the user cannot see rows for, not just "filters".
  const activeFilterNames = [
    originFilter !== 'all' ? t(`archive.origin.${originFilter}`) : null,
    jobFilter !== null ? (jobOptions.find(option => option.jobId === jobFilter)?.jobName ?? null) : null,
    folderFilter.kind === 'none'
      ? t('archive.folderFilter.none')
      : folderFilter.kind === 'folder'
        ? workingDirLabel(folderFilter.dir, homeDir)
        : null,
    onlyHandFiled ? t('archive.onlyFiled') : null,
  ].filter((name): name is string => name !== null)
  const activeFilterDescription = activeFilterNames.join(' · ')

  // The i18n helper only substitutes {{params}} — no ICU plural machinery — so
  // each count picks its own singular/plural key. "N updated this week" gives
  // the week number a noun instead of trailing bare.
  const summaryText = [
    t(summary.total === 1 ? 'archive.summaryTaskOne' : 'archive.summaryTask', { count: summary.total }),
    t(summary.roots === 1 ? 'archive.summaryOrgOne' : 'archive.summaryOrg', { count: summary.roots }),
    t('archive.summaryWeek', { count: summary.week }),
  ].join(' · ')

  // The tooltip has to say the three things the label cannot: the scope is
  // exactly the rows on screen, it freezes at click time, and the cap may leave
  // some of them out. The omitted count and the cap itself are both named, so
  // the label never promises conversations the question will not read.
  let askTitle: string
  if (visibleRecords.length === 0) {
    askTitle = t('archive.askScope.buttonDisabled')
  } else {
    // The cap sentence is always present: even an untruncated list is one filter
    // change away from the cap, and the limit should not feel like a surprise.
    const parts = [t('archive.askScope.buttonTip')]
    if (askScopePreview.truncated) {
      parts.push(t('archive.askScope.buttonTipCapped', {
        count: askCount,
        total: askScopePreview.total,
        omitted: askScopeOmitted(askScopePreview),
      }))
    }
    parts.push(t('archive.askScope.cappedNote', { cap: MAX_ARCHIVE_ASK_SCOPE }))
    askTitle = parts.join(' ')
  }

  const timeOptions: TimeRange[] = ['all', 'today', 'week', 'month']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--popup-bg)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
        }}>
          <Archive size={14} color="var(--accent-text)" />
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('nav.archive')}
        </span>
        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', ...ELLIPSIS }} title={summaryText}>
          {summaryText}
        </span>
        {/* A quiet header action: neutral surface, semantic colour on the
            label only. The old green tinted fill competed with the archive
            badge and the summary on the same 44px line. */}
        <button
          onClick={exportLedger}
          disabled={visibleRecords.length === 0}
          className="archive-hover-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            height: 26, padding: '0 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            border: '1px solid var(--border)', background: 'transparent',
            color: visibleRecords.length === 0 ? 'var(--text-faint)' : 'var(--success-text)',
            cursor: visibleRecords.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s ease',
          }}
        >
          <ArrowUpDown size={11} />{t('archive.export')}
        </button>
        {/* Ask about the ledger as it stands. Same quiet header idiom as Export:
            neutral surface, one border, no fill. The label carries the number of
            rows that will actually be sent, not the number listed — those differ
            once the cap bites, and that difference belongs on the button. Hidden
            only when the overlay has answered that asking is impossible
            (`false`); an unanswered probe (`null`) keeps it. */}
        {askAvailable !== false && (
          <button
            onClick={askAboutVisible}
            disabled={visibleRecords.length === 0}
            className="archive-hover-btn"
            title={askTitle}
            aria-label={askTitle}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              height: 26, padding: '0 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              border: '1px solid var(--border)', background: 'transparent',
              color: visibleRecords.length === 0 ? 'var(--text-faint)' : 'var(--text-secondary)',
              cursor: visibleRecords.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <Sparkles size={11} />
            {t(askScopeLabelKey(askCount), { count: askCount })}
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{
        flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
      }}>
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          onFocus={e => {
            e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent-bg)'
            e.currentTarget.style.borderColor = 'var(--accent-border)'
          }}
          onBlur={e => {
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
          style={{
            // 24px is the filter row's common height (fields and chips).
            height: 24, boxSizing: 'border-box', padding: '0 8px',
            borderRadius: 8, fontSize: 11, maxWidth: 180,
            border: '1px solid var(--border)', background: 'var(--bg-hover)',
            color: 'var(--text-secondary)', cursor: 'pointer',
            transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
          }}
        >
          <option value="all">{t('archive.allDepartments')}</option>
          {filterTargets.map(d => (
            <option key={d.id} value={d.id}>{deptDisplayName(d, resolvedLocale)}</option>
          ))}
          <option value={UNASSIGNED}>{t('archive.unassigned')}</option>
        </select>

        <ArchiveFolderSelect
          filter={folderFilter}
          options={folderOptions}
          homeDir={homeDir}
          onChange={setFolderFilter}
        />

        {timeOptions.map(range => (
          <Pill key={range} active={timeRange === range} onClick={() => setTimeRange(range)}>
            {t(`archive.time.${range}`)}
          </Pill>
        ))}

        <span aria-hidden="true" style={{ width: 1, height: 14, flexShrink: 0, background: 'var(--border)' }} />

        {ORIGIN_FILTERS.map(origin => (
          <Pill key={origin} active={originFilter === origin} onClick={() => selectOrigin(origin)}>
            {t(`archive.origin.${origin}`)}
          </Pill>
        ))}

        {/* Job-level narrowing lives with the origin kinds it refines. It only
            appears once there is a real choice — one job is the whole set. */}
        {jobChoices.length > 0 && (
          <>
            <span aria-hidden="true" style={{ width: 1, height: 14, flexShrink: 0, background: 'var(--border)' }} />
            <span
              role="group"
              aria-label={t('archive.jobFilterGroup')}
              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}
            >
              <span style={{ fontSize: 10, color: 'var(--text-subtle)', flexShrink: 0 }}>
                {t('archive.jobFilterGroup')}
              </span>
              {jobChoices.map(job => (
                <Pill
                  key={job.jobId}
                  active={jobFilter === job.jobId}
                  ariaPressed={jobFilter === job.jobId}
                  title={t(job.count === 1 ? 'archive.jobSessionCountOne' : 'archive.jobSessionCount', { count: job.count })}
                  onClick={() => toggleJob(job.jobId)}
                >
                  <span style={{ ...ELLIPSIS, maxWidth: 140 }}>{job.jobName}</span>
                  <span style={{ opacity: 0.65, fontVariantNumeric: 'tabular-nums' }}>{job.count}</span>
                </Pill>
              ))}
            </span>
          </>
        )}

        <Pill active={showArchived} onClick={() => setShowArchived(v => !v)}>
          {t('archive.showArchived')}
        </Pill>

        {/* The archive's own review filter: the rows the user filed by hand,
            including filings whose department no longer exists. It narrows the
            loaded listing only — no IPC, no re-read. */}
        <Pill
          active={onlyHandFiled}
          ariaPressed={onlyHandFiled}
          title={t('archive.onlyFiledTip')}
          onClick={() => setOnlyHandFiled(v => !v)}
        >
          <PenLine size={10} />{t('archive.onlyFiled')}
        </Pill>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 140,
          height: 24, boxSizing: 'border-box', padding: '0 9px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-hover)',
          transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
        }}>
          <Search size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('archive.searchPlaceholder')}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onFocus={e => {
              const bar = e.currentTarget.parentElement
              if (bar) {
                bar.style.boxShadow = '0 0 0 2px var(--accent-bg)'
                bar.style.borderColor = 'var(--accent-border)'
              }
            }}
            onBlur={e => {
              const bar = e.currentTarget.parentElement
              if (bar) {
                bar.style.boxShadow = 'none'
                bar.style.borderColor = 'var(--border)'
              }
            }}
            style={{
              flex: 1, minWidth: 0, background: 'none', border: 'none',
              color: 'var(--text-primary)', fontSize: 11,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
            >
              <X size={10} />
            </button>
          )}
        </div>

        {filtersActive && (
          <button
            onClick={clearFilters}
            className="archive-hover-link"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            {t('archive.clearFilters')}
          </button>
        )}
      </div>

      {/* Job health sits between the filters and the ledger. It stays outside
          the scroller so its presence can never shift the analytic row offsets
          the windowed ledger relies on. */}
      {jobFilter !== null && <ArchiveJobSummary jobId={jobFilter} />}

      {/* Selection bar. Outside the scroller, like the job summary, so its
          height can never move the analytic row offsets. It stays mounted when
          a filter emptied the view after a prune, because that notice is the
          only account of what happened to the selection. */}
      {(visibleRecords.length > 0 || selection.size > 0 || prunedCount > 0) && (
        <ArchiveBulkBar
          mode={selectionModeValue}
          visibleCount={visibleIds.length}
          selectedCount={selectedVisibleIds.length}
          archiveCount={selectedVisibleIds.length - selectedArchivedCount}
          unarchiveCount={selectedArchivedCount}
          prunedCount={prunedCount}
          busy={bulkBusy}
          onToggleAll={toggleAllSelection}
          onArchive={() => archiveSelected(true)}
          onUnarchive={() => archiveSelected(false)}
          onDelete={() => void deleteSelected()}
          onClear={clearSelection}
        />
      )}

      {/* Ledger */}
      <div ref={ledgerRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px' }}>
        {sessionsLoading && sessions.length === 0 ? (
          // A spinner and a muted sentence, matching the panel fallbacks
          // elsewhere — not a bare line of 12px text.
          <div style={{
            padding: '56px 20px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-muted)',
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
              animation: 'spin 0.8s linear infinite',
            }} />
            {t('archive.loading')}
          </div>
        ) : allRecords.length === 0 ? (
          <EmptyState
            icon={<Inbox size={30} style={{ color: 'var(--accent)', opacity: 0.5 }} />}
            title={t('archive.emptyTitle')}
            hint={t('archive.emptyHint')}
          />
        ) : filteredEmpty ? (
          <EmptyState
            icon={<Search size={30} style={{ color: 'var(--accent)', opacity: 0.5 }} />}
            title={t('archive.noMatchTitle')}
            hint={onlyHandFiled
              ? t('archive.onlyFiledEmpty')
              : activeFilterDescription
                ? t('archive.noMatchFilteredHint', { filter: activeFilterDescription })
                : t('archive.noMatchHint')}
            onClear={clearFilters}
            clearLabel={t('archive.clearFilters')}
          />
        ) : visibleRecords.length === 0 && (searching || showCommandOnly || commandOnlyCount === 0) ? (
          <EmptyState
            icon={<Search size={30} style={{ color: 'var(--accent)', opacity: 0.5 }} />}
            title={t('archive.noMatchTitle')}
            hint={t('archive.noMatchHint')}
            onClear={clearFilters}
            clearLabel={t('archive.clearFilters')}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: GROUP_GAP }}>
            {layout.map(item => {
              const { key, group, isCollapsed } = item
              const count = group.records.length
              // Only the rows intersecting the viewport (plus an overscan band)
              // mount. Two spacers keep the card at its full analytic height.
              const visStart = viewport.top - OVERSCAN_ROWS * ROW_H
              const visEnd = viewport.top + viewport.height + OVERSCAN_ROWS * ROW_H
              const start = Math.max(0, Math.min(count, Math.floor((visStart - item.rowsTop) / ROW_H)))
              const end = Math.max(start, Math.min(count, Math.ceil((visEnd - item.rowsTop) / ROW_H)))
              return (
                <div key={key}>
                  {/* Group header — the company (or a legacy top-level department).
                      The toggle and the legacy-folder import are siblings because a
                      button cannot contain another button. */}
                  <div
                    className="archive-group-header"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                      height: GROUP_HEADER_H, boxSizing: 'border-box', padding: '0 0 8px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <button
                      onClick={() => setCollapsed(c => ({ ...c, [key]: !c[key] }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0,
                        height: '100%', background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, color: 'inherit', textAlign: 'left',
                      }}
                    >
                      {isCollapsed ? <ChevronRight size={12} style={{ flexShrink: 0 }} /> : <ChevronDown size={12} style={{ flexShrink: 0 }} />}
                      <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{group.root ? deptEmoji(group.root.id) : '📭'}</span>
                      <span
                        title={group.root?.name ?? t('archive.unassigned')}
                        style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {group.root?.name ?? t('archive.unassigned')}
                      </span>
                      {group.root && kindOf(group.root) === 'company' && (
                        <span style={{
                          fontSize: 9, padding: '1px 6px', borderRadius: 999, flexShrink: 0,
                          border: '1px solid var(--accent-border)', background: 'var(--accent-bg)',
                          color: 'var(--accent-text)',
                        }}>
                          {t('dept.companyTag')}
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, padding: '1px 7px', borderRadius: 999, flexShrink: 0,
                        background: 'var(--bg-hover)', border: '1px solid var(--border)',
                        color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums',
                      }}>
                        {group.records.length}
                      </span>
                      {group.root?.directory && (
                        <span title={group.root.directory} style={{ fontSize: 10, color: 'var(--text-subtle)', ...ELLIPSIS, maxWidth: 260 }}>
                          {group.root.directory}
                        </span>
                      )}
                    </button>
                    {group.root?.directory && (
                      <LegacyFolderImport
                        directory={group.root.directory}
                        departmentId={group.root.id}
                        compact
                        style={{ flexShrink: 0 }}
                      />
                    )}
                  </div>

                  {!isCollapsed && (
                    <div style={{
                      border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
                      background: 'var(--bg-hover)',
                      height: item.cardHeight, boxSizing: 'border-box',
                    }}>
                      {start > 0 && <div style={{ height: start * ROW_H }} aria-hidden="true" />}
                      {group.records.slice(start, end).map((record, i) => (
                        <ArchiveRow
                          key={record.session.sessionId}
                          record={record}
                          index={start + i}
                          first={start + i === 0}
                          opening={opening === record.session.sessionId}
                          selected={selection.has(record.session.sessionId)}
                          onOpen={() => void open(record)}
                          onToggleArchived={() => toggleArchived(record.session.sessionId)}
                          onFile={() => setFilingSessionId(record.session.sessionId)}
                          onDelete={() => deleteOne(record)}
                          onToggleSelected={() => toggleRowSelection(record.session.sessionId)}
                          t={t}
                          locale={resolvedLocale}
                        />
                      ))}
                      {end < count && <div style={{ height: (count - end) * ROW_H }} aria-hidden="true" />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pinned just above the footer hint: the count has to be readable next
          to the header it explains, not buried after thousands of rows. */}
      {!searching && commandOnlyCount > 0 && (
        <CommandOnlyNotice
          count={commandOnlyCount}
          shown={showCommandOnly}
          onToggle={toggleCommandOnly}
          t={t}
        />
      )}

      {/* The filter never hides rows silently. When it leaves something on
          screen, say how many it removed; when it leaves nothing, the empty
          state above already names the filter. */}
      {onlyHandFiled && handHiddenCount > 0 && visibleRecords.length > 0 && (
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 16px', borderTop: '1px solid var(--border)',
          fontSize: 10, color: 'var(--text-subtle)',
        }}>
          <span>{t('archive.onlyFiledHidden', { count: String(handHiddenCount) })}</span>
          <button
            onClick={() => setOnlyHandFiled(false)}
            className="archive-hover-link"
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 10,
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            {t('archive.show')}
          </button>
        </div>
      )}

      {unassignedCount > 0 && deptFilter === 'all' && (
        <div style={{
          flexShrink: 0, padding: '7px 16px', borderTop: '1px solid var(--border)',
          fontSize: 10, color: 'var(--text-subtle)',
        }}>
          {t('archive.unassignedHint', { count: String(unassignedCount) })}
        </div>
      )}

      {/* One dialog per panel, not per row. The row only names the session; the
          store subscription refreshes the listing and the filter's count once
          the dialog writes or clears the filing. */}
      {filingSessionId !== null && (
        <FileUnderDeptDialog
          sessionId={filingSessionId}
          onClose={() => setFilingSessionId(null)}
        />
      )}
    </div>
  )
}

