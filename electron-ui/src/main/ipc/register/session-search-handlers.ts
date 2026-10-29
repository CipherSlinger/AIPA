/**
 * Conversation search: the paged search and the "related conversations" rows.
 * One scan per query; pages are slices of that one ordering.
 */
import { ipcMain } from 'electron'
import { createLogger } from '../../utils/logger'
import { searchPage } from '../../sessions/search-pager'
import { collectRelatedSessions } from '../../sessions/related-sessions'

const log = createLogger('ipc:session')

export function registerSessionSearchHandlers(): void {
  // The first page of a paged search. Kept as a bare row array because that is
  // what it has always returned; new callers should use `session:searchPage`,
  // which also says whether more rows exist.
  ipcMain.handle('session:search', async (_e: Electron.IpcMainInvokeEvent, { query, limit }: { query: string; limit?: number }) => {
    try {
      return (await searchPage({ query, limit })).results
    } catch (err) {
      log.warn('session:search error:', String(err))
      return []
    }
  })

  // One page of results, with the honest counts a paging UI needs: how many
  // hits this query's scan knows (`total`), whether more can be loaded
  // (`hasMore`), and whether the scan itself stopped at its ceiling
  // (`ceilingReached` — older matches exist but were never collected). The
  // scan runs once per query and pages are slices of that one ordering, so a
  // later page never re-reads the corpus.
  //
  // `origins` and `sessionIds` (both validated in the pager) narrow the scan
  // itself rather than the page it returned, so the ceiling counts hits the
  // caller asked for. A narrowed reply echoes `filteredBy`; an unsupported
  // origin is refused with `SEARCH_INVALID_ORIGINS` and never degrades to a
  // full scan.
  ipcMain.handle('session:searchPage', async (_e: Electron.IpcMainInvokeEvent, input: unknown) => {
    try {
      return await searchPage(input)
    } catch (err) {
      log.warn('session:searchPage error:', String(err))
      throw err
    }
  })

  // Other local conversations that share words with the open one. Lexical
  // retrieval, not semantic similarity: the caller sends its own prose, the
  // handler extracts terms and searches both transcript indexes. Every value
  // is validated here because an older or hand-written renderer must never be
  // able to make the handler throw across IPC.
  ipcMain.handle('session:related', async (_e: Electron.IpcMainInvokeEvent, input: unknown) => {
    try {
      const raw = input && typeof input === 'object' && !Array.isArray(input)
        ? input as { text?: unknown; excludeSessionId?: unknown; limit?: unknown }
        : {}
      const text = typeof raw.text === 'string' ? raw.text : ''
      const excludeSessionId = typeof raw.excludeSessionId === 'string'
        ? raw.excludeSessionId
        : undefined
      const requested = typeof raw.limit === 'number' ? Math.floor(raw.limit) : NaN
      const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 10) : 4
      return await collectRelatedSessions({ text, excludeSessionId, limit })
    } catch (err) {
      log.warn('session:related error:', String(err))
      return { rows: [], indexing: false, reason: 'failed', error: String(err) }
    }
  })
}
