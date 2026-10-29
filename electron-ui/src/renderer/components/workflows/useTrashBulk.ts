// The selection and the two bulk actions of "Recently deleted", kept out of
// the view so the list stays a list.
//
// Scope is the filtered view and nothing else: `visibleKeys` is the view's own
// order, every action derives its rows from it, and an effect prunes the state
// the moment a filter change takes a row out of sight. The one-render window
// before that effect is covered by deriving rows from `visible`, not from the
// state set.
//
// Bulk work goes through `runTrashBatch`, i.e. through the same per-row callbacks
// the row buttons use. There is no separate "many" IPC route to drift from.
import { useCallback, useEffect, useState } from 'react'
import {
  emptySelection,
  pruneSelection,
  selectAllInView,
  selectedInView,
  selectionMode,
  toggleSelected,
} from '../../lib/rowSelection'
import { describeTrashBatch, runTrashBatch, tallyTrashBatch } from '../../lib/trashBatch'
import type { TrashBatchAction, TrashBatchReport } from '../../lib/trashBatch'
import { trashRowKey } from '../../lib/trashRows'
import type { TrashActionOutcome, TrashRow } from '../../lib/trashRows'

export interface TrashBulkController {
  mode: ReturnType<typeof selectionMode>
  selectedCount: number
  selectedRows: TrashRow[]
  /** For the row checkboxes; display only — actions read `selectedRows`. */
  selectedKeys: ReadonlySet<string>
  prunedCount: number
  busy: boolean
  confirming: boolean
  report: TrashBatchReport | null
  toggleRow: (key: string) => void
  toggleAll: () => void
  clear: () => void
  restoreSelected: () => void
  requestDelete: () => void
  cancelDelete: () => void
  deleteSelected: () => void
  dismissReport: () => void
}

export function useTrashBulk(
  visible: readonly TrashRow[],
  onRestore: (row: TrashRow) => Promise<TrashActionOutcome>,
  onDeleteForever: (row: TrashRow) => Promise<TrashActionOutcome>,
): TrashBulkController {
  const [selection, setSelection] = useState<ReadonlySet<string>>(emptySelection)
  const [prunedCount, setPrunedCount] = useState(0)
  // One bulk action at a time: a second click while the first is in flight
  // would interleave with it, and a permanent delete is not replayed.
  const [busy, setBusy] = useState(false)
  // Confirming is cancelled by any selection change: confirming a count that
  // has since changed would delete a set the user never saw.
  const [confirming, setConfirming] = useState(false)
  const [report, setReport] = useState<TrashBatchReport | null>(null)

  const visibleKeys = visible.map(trashRowKey)
  const mode = selectionMode(selection, visibleKeys)
  const rowsByKey = new Map(visible.map(row => [trashRowKey(row), row]))
  // Derived from the view, so a hidden row can never reach a batch even in the
  // one render before the prune effect below.
  const selectedRows = selectedInView(selection, visibleKeys)
    .map(key => rowsByKey.get(key))
    .filter((row): row is TrashRow => row !== undefined)

  useEffect(() => {
    const result = pruneSelection(selection, visibleKeys)
    if (result.dropped === 0) return
    setSelection(result.selected)
    setPrunedCount(result.dropped)
    setConfirming(false)
  }, [selection, visibleKeys])

  const toggleRow = useCallback((key: string) => {
    setPrunedCount(0)
    setConfirming(false)
    setSelection(current => toggleSelected(current, key))
  }, [])

  const toggleAll = useCallback(() => {
    setPrunedCount(0)
    setConfirming(false)
    // 'some' means the next press selects every shown row; only a full view
    // clears it.
    setSelection(current => selectAllInView(current, visibleKeys, mode !== 'all'))
  }, [visibleKeys, mode])

  const clear = useCallback(() => {
    setPrunedCount(0)
    setConfirming(false)
    setSelection(emptySelection())
  }, [])

  const runBulk = useCallback(async (
    action: TrashBatchAction,
    run: (row: TrashRow) => Promise<TrashActionOutcome>,
  ) => {
    if (busy || selectedRows.length === 0) return
    const rowsToAct = selectedRows
    // Empty the selection first: the rows are about to leave, and the bar must
    // not be able to offer the same batch twice while the lists refresh.
    setConfirming(false)
    setPrunedCount(0)
    setSelection(emptySelection())
    setBusy(true)
    try {
      const results = await runTrashBatch(rowsToAct, run)
      setReport(describeTrashBatch(action, tallyTrashBatch(results)))
    } catch {
      // runTrashBatch turns a per-row throw into a refusal; reaching here means
      // the batch could not run at all. Every row is reported as still there.
      const failed = rowsToAct.map(row => ({
        key: trashRowKey(row), kind: row.kind, name: row.name,
        ok: false as const, reason: null, listStale: false,
      }))
      setReport(describeTrashBatch(action, tallyTrashBatch(failed)))
    } finally {
      setBusy(false)
    }
  }, [busy, selectedRows])

  const restoreSelected = useCallback(() => { void runBulk('restore', onRestore) }, [runBulk, onRestore])
  const deleteSelected = useCallback(() => { void runBulk('delete', onDeleteForever) }, [runBulk, onDeleteForever])
  const requestDelete = useCallback(() => setConfirming(true), [])
  const cancelDelete = useCallback(() => setConfirming(false), [])
  const dismissReport = useCallback(() => setReport(null), [])

  return {
    mode,
    selectedCount: selectedRows.length,
    selectedRows,
    selectedKeys: new Set(selectedRows.map(trashRowKey)),
    prunedCount,
    busy,
    confirming,
    report,
    toggleRow,
    toggleAll,
    clear,
    restoreSelected,
    requestDelete,
    cancelDelete,
    deleteSelected,
    dismissReport,
  }
}
