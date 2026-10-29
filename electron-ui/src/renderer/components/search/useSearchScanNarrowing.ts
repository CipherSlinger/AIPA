// How a search's scan gets narrowed, and how that narrowing is named.
//
// Extracted from the coordinator when the folder facet pushed the file past the
// size ceiling that guards it. This is not a cosmetic cut: every one of these
// lines sits on the one path where a keystroke could become a scan, so it is
// worth being able to read the whole rule in one place.
//
// The rule:
//
//   - the scan is narrowed only by an explicit press. `scanWithCurrentNarrowing`
//     (department), `scanWithFolder` (folder) and `clearScanPins` (widen back to
//     the whole history) are the only writers of the three pins. Nothing here
//     reacts to a chip, a select or an order change, so a filter change can
//     never start a scan behind the user's back;
//
//   - the department pin and the folder pin are mutually exclusive. Both mean
//     "search only these conversations", so two would describe a corpus neither
//     of them owns; each press clears the other;
//
//   - a pin is a snapshot, not a live resolution. The session listing is rebuilt
//     whenever a conversation starts or a session is indexed, and a running
//     scan must keep slicing the corpus it announced — the first page and every
//     continuation page have to describe the same set of conversations;
//
//   - the copy reads the reply's echo (`filteredBy`), never the request. A scan
//     that failed or was refused must not be described as narrowed, and an empty
//     result must be attributed to the corpus main says it kept.
//
// Pure React state and derivations; no IPC, no DOM. The overlay passes the
// results to the bar and to its empty-state chain.

import { useCallback, useMemo, useState } from 'react'
import type { SessionSearchFilterEchoData } from '../../../preload/index'
import { workingDirLabel } from '../../lib/workingDir'
import {
  narrowingFromEcho,
  pinDeptScanScope,
  scanDeptState,
  type DeptScanPin,
  type DeptScopeSource,
  type ScanEcho,
  type ScannedDeptState,
} from './searchDeptScan'
import {
  folderScopeIds,
  pinFolderScanScope,
  scanFolderState,
  type FolderScanPin,
  type FolderScanScope,
  type ScannedFolderState,
} from './searchFolderScan'
import type { ScanOrigin, SearchMatchFilter } from './searchMatchFilter'
import type { SearchFolderFilter } from './searchFolderFilter'

/** The slice of a listed session the folder join is allowed to read. */
export interface SearchScanSession {
  sessionId: string
  /** The folder recorded for the conversation. Absence is never a folder. */
  cwd?: string | null
}

export interface SearchScanNarrowingArgs {
  sessions: ReadonlyArray<SearchScanSession>
  /** `undefined` outside a window; passed through so Windows paths fold. */
  platform: string | undefined
  homeDir: string | null
  matchFilter: SearchMatchFilter
  folderFilter: SearchFolderFilter
  deptFilter: string | null
  deptFilterLabel: string
  deptScope: DeptScopeSource | null
  /** The live org chart, so a deleted node's pin can be reported as gone. */
  departments: ReadonlyArray<{ id: string }>
}

export interface SearchScanNarrowing {
  scanOrigins: ScanOrigin[] | null
  scanDept: DeptScanPin | null
  scanFolder: FolderScanPin | null
  /** The query whose scan was widened back; empty when none was. */
  scanClearedFor: string
  /**
   * The chosen folder's conversations in this machine's listing, before the
   * cap. The strip uses it to announce a scan's size and to refuse a folder
   * that resolves to nothing; the scan reads the press-time pin, never this.
   */
  folderScope: FolderScanScope | null
  /** The folder the running scan was narrowed to, named from the pin. */
  scannedFolder: ScannedFolderState | null
  /** The department pin as the scan-active line needs it, live tree consulted. */
  scannedDept: ScannedDeptState | null
  scanWithCurrentNarrowing: () => void
  scanWithFolder: () => void
  /** Widen back to the whole history, remembering the query it was pressed for. */
  clearScanPins: (clearedFor: string) => void
}

export function useSearchScanNarrowing({
  sessions,
  platform,
  homeDir,
  matchFilter,
  folderFilter,
  deptFilter,
  deptFilterLabel,
  deptScope,
  departments,
}: SearchScanNarrowingArgs): SearchScanNarrowing {
  // Origins the scan itself is narrowed to, or null for the whole history.
  const [scanOrigins, setScanOrigins] = useState<ScanOrigin[] | null>(null)
  // The department the scan is narrowed to, frozen at the press: the exact
  // session ids, plus the name and totals the bar announced.
  const [scanDept, setScanDept] = useState<DeptScanPin | null>(null)
  // The folder the scan is narrowed to, frozen the same way. At most one of
  // these two pins is ever set; the presses below clear each other.
  const [scanFolder, setScanFolder] = useState<FolderScanPin | null>(null)
  // The query for which the scan was last widened back to the whole history.
  // Keyed by the query so the note disappears as soon as the user searches for
  // something else instead of lingering over unrelated rows.
  const [scanClearedFor, setScanClearedFor] = useState('')

  const folderScope = useMemo(
    () => (folderFilter.kind === 'folder'
      ? folderScopeIds(sessions, folderFilter.key, { platform })
      : null),
    [sessions, folderFilter, platform],
  )
  // The pinned folder named exactly as it was at the press. It deliberately
  // does not consult the live option list: a folder that has left the recent
  // list still names the corpus this scan is reading.
  const scannedFolder = useMemo(() => scanFolderState(scanFolder), [scanFolder])
  // The department pin named the way the scan-active line needs it. `gone` is
  // computed from the live tree, so a node deleted while its narrowed scan is on
  // screen is reported instead of being presented as current.
  const liveDeptIds = useMemo(() => new Set(departments.map(dept => dept.id)), [departments])
  const scannedDept = useMemo(
    () => scanDeptState(scanDept, liveDeptIds),
    [scanDept, liveDeptIds],
  )

  // The department action pushes the origin chip (if one is active) and the
  // department's sessions, using the same resolution a scoped ask uses. It
  // clears the folder pin: the department is what this press named.
  const scanWithCurrentNarrowing = useCallback(() => {
    setScanClearedFor('')
    setScanOrigins(matchFilter === 'all' ? null : [matchFilter])
    setScanFolder(null)
    setScanDept(
      deptFilter && deptScope
        ? pinDeptScanScope(deptFilter, deptFilterLabel, deptScope)
        : null,
    )
  }, [matchFilter, deptFilter, deptScope, deptFilterLabel])

  // "Search only in this folder": freeze the chosen folder's sessions at the
  // press and push them into the scan. The origin chip is carried exactly as
  // the department action carries it, and the department pin is cleared for the
  // same reason. The folder's name is frozen too, so the active line can still
  // name it after the folder leaves the option list.
  const scanWithFolder = useCallback(() => {
    if (folderFilter.kind !== 'folder' || !folderScope) return
    setScanClearedFor('')
    setScanOrigins(matchFilter === 'all' ? null : [matchFilter])
    setScanDept(null)
    setScanFolder(pinFolderScanScope(
      {
        dir: folderFilter.dir,
        key: folderFilter.key,
        label: workingDirLabel(folderFilter.dir, homeDir) || folderFilter.dir,
      },
      folderScope,
    ))
  }, [folderFilter, folderScope, matchFilter, homeDir])

  // Widening also clears the chips on the caller's side: the rows that follow
  // are the whole history, and a department or folder selection left over them
  // would describe a scan that is no longer narrowed. Both pins are dropped
  // here so no later page can slice an old corpus.
  const clearScanPins = useCallback((clearedFor: string) => {
    setScanOrigins(null)
    setScanDept(null)
    setScanFolder(null)
    setScanClearedFor(clearedFor)
  }, [])

  return {
    scanOrigins,
    scanDept,
    scanFolder,
    scanClearedFor,
    folderScope,
    scannedFolder,
    scannedDept,
    scanWithCurrentNarrowing,
    scanWithFolder,
    clearScanPins,
  }
}

/**
 * How the live reply describes its own narrowing.
 *
 * Separate from the hook because it reads the reply, which only exists after
 * the scan the pins configure has run — the hook is called before that search,
 * this after it. The scoped-empty copy names these narrowings and nothing else:
 * "no matches anywhere in the history" is a claim a department- or
 * folder-scoped scan never earned.
 */
export interface ScanNarrowingCopyArgs {
  filteredBy: SessionSearchFilterEchoData | null
  scanDept: DeptScanPin | null
  scannedFolder: ScannedFolderState | null
  /** Translates an origin-chip key; the copy names chips by their label. */
  translate: (key: string) => string
}

export interface ScanNarrowingCopy {
  scopedEcho: ScanEcho | null
  scopedOriginLabels: string
  /** True when the reply says the corpus was a folder rather than a department. */
  scopedFolder: boolean
}

export function describeScanNarrowing({
  filteredBy,
  scanDept,
  scannedFolder,
  translate,
}: ScanNarrowingCopyArgs): ScanNarrowingCopy {
  const scopedEcho = narrowingFromEcho(filteredBy)
  const scopedOriginLabels = (scopedEcho?.origins ?? [])
    .map(origin => translate(`globalSearch.match.${origin}`))
    .join(' + ')
  // The reply says the corpus was a folder, not a department. Read from the
  // echo first, then from the pin that names it; a request alone never decides
  // how an empty result is described.
  const scopedFolder = scopedEcho?.sessionCount != null
    && scanDept === null
    && scannedFolder !== null
  return { scopedEcho, scopedOriginLabels, scopedFolder }
}
