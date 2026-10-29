import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { getPref, setPref, getAllPrefs } from '../config/config-manager'
import { createLogger } from '../utils/logger'
import fs from 'fs'
import {
  BACKUP_FORMAT_VERSION,
  buildBackupDocument,
  defaultBackupRoots,
  importBackup,
  type BackupImportReport,
  type BackupPrefs,
  type BuiltBackupDocument,
} from '../backup/backup-data'
import { createAutoBackupService, type AutoBackupService } from '../backup/auto-backup-service'
import {
  deleteBackupFile,
  listBackupFiles,
  readAutoBackupState,
  readBackupFile,
  setAutoBackupPolicy,
} from '../backup/auto-backup-writer'

const log = createLogger('ipc:backup')

/**
 * The preference store, narrowed to the two operations the backup needs.
 *
 * Passing an adapter (rather than letting the backup module import the store)
 * keeps the export/import logic free of Electron and lets its harness run on a
 * plain object. The handlers themselves are still the only place that decides
 * what "the store" is.
 */
function prefsAdapter(): BackupPrefs {
  return {
    all: () => getAllPrefs() as unknown as Record<string, unknown>,
    read: key => getRawPrefSafe(key),
    // Collections like personas are stored under keys outside StoreSchema, so
    // the typed setter is bypassed here exactly as the old importer did.
    write: (key, value) => (setPref as unknown as (k: string, v: unknown) => void)(key, value),
  }
}

function getRawPrefSafe(key: string): unknown {
  try {
    return (getAllPrefs() as unknown as Record<string, unknown>)[key]
  } catch (err) {
    log.warn(`backup: could not read pref ${key}:`, String(err))
    return undefined
  }
}

function userDataDir(): string {
  return app.getPath('userData')
}

/** The same document the Export button writes, with the current roots. */
function buildDocumentNow(): BuiltBackupDocument {
  return buildBackupDocument({
    roots: defaultBackupRoots(String(getPref('workingDir') || '')),
    // The whole store is handed over; buildBackupDocument reads only its fixed
    // allowlist, so apiKeyEncrypted, modelProviders and the rest never reach
    // the file.
    prefs: prefsAdapter().all(),
    appVersion: app.getVersion(),
  })
}

/** The per-section restore result, shared by both restore entry points. */
function importResponse(report: BackupImportReport): Record<string, unknown> {
  return {
    success: true,
    backupVersion: report.backupVersion,
    backupDate: report.backupDate ?? undefined,
    olderVersion: report.olderVersion,
    written: report.written,
    skippedExisting: report.skippedExisting,
    failed: report.failed,
    refused: report.refused,
    warnings: report.warnings,
    sectionsPresent: report.sectionsPresent,
  }
}

let service: AutoBackupService | null = null

export function registerBackupHandlers(
  send?: (channel: string, ...args: unknown[]) => void,
): void {
  const notifyChanged = () => {
    try { send?.('backup:changed') } catch (err) { log.warn('backup: could not notify renderer:', String(err)) }
  }

  // Export all user data as one versioned JSON document.
  ipcMain.handle('backup:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { error: 'No window' }

    const result = await dialog.showSaveDialog(win, {
      defaultPath: `aipa-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'AIPA Backup', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      const built = buildDocumentNow()
      fs.writeFileSync(result.filePath, built.json, 'utf-8')
      const sizeKB = Math.round(built.sizeBytes / 1024)
      ;(setPref as unknown as (k: string, v: unknown) => void)('lastBackupDate', Date.now())

      return {
        success: true,
        filePath: result.filePath,
        sizeKB,
        backupVersion: BACKUP_FORMAT_VERSION,
        counts: built.counts,
      }
    } catch (err) {
      log.error('backup:export error:', String(err))
      return { error: 'write_failed' }
    }
  })

  // Import a backup from anywhere on disk, merging into what is already here.
  ipcMain.handle('backup:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { error: 'No window' }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'AIPA Backup', extensions: ['json'] }],
      title: 'Select AIPA Backup File',
    })

    if (result.canceled || !result.filePaths[0]) return { canceled: true }

    let data: unknown
    try {
      data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'))
    } catch (err) {
      log.warn('backup:import could not read the file:', String(err))
      return { error: 'invalid_format', errorCode: 'invalid_format' }
    }

    try {
      const outcome = importBackup({
        roots: defaultBackupRoots(String(getPref('workingDir') || '')),
        prefs: prefsAdapter(),
        data,
      })
      if (!outcome.ok) {
        return { error: outcome.code, errorCode: outcome.code }
      }
      return importResponse(outcome.report)
    } catch (err) {
      // A refusal is a result, not a thrown error: an IPC rejection reaches the
      // renderer as "Error invoking remote method …", which a user cannot act on.
      log.error('backup:import error:', String(err))
      return { error: 'read_failed', errorCode: 'read_failed' }
    }
  })

  // ── Automatic backups (wave 77A) ────────────────────────────────────
  //
  // The timer starts here, after the window exists, and never during startup
  // work. It reads the same preference store and the same builder as Export.

  if (!service) {
    service = createAutoBackupService({
      userDataDir: userDataDir(),
      build: buildDocumentNow,
      onChange: notifyChanged,
    })
    service.start()
  }
  const autoBackup = service

  // List the backups on disk plus the policy and what the last attempt did.
  ipcMain.handle('backup:list', async () => {
    try {
      const dir = userDataDir()
      const state = readAutoBackupState(dir)
      const listing = listBackupFiles(dir)
      return {
        success: true,
        dir: listing.dir,
        policy: state.policy,
        lastAttemptAt: state.lastAttemptAt,
        lastSuccessAt: state.lastSuccessAt,
        lastResult: state.lastResult,
        backups: listing.backups,
        foreignCount: listing.foreignCount,
      }
    } catch (err) {
      log.error('backup:list error:', String(err))
      return { success: false, error: 'read_failed' }
    }
  })

  // "Back up now": forces a run (the automatic toggle does not gate a manual one).
  ipcMain.handle('backup:runNow', async () => {
    try {
      return autoBackup.runNow()
    } catch (err) {
      log.error('backup:runNow error:', String(err))
      return { ok: false, error: 'write_failed', pruned: 0, leftAlone: 0, pruneFailures: 0 }
    }
  })

  ipcMain.handle('backup:setPolicy', async (_e, patch: unknown) => {
    try {
      const policy = setAutoBackupPolicy(userDataDir(), patch)
      notifyChanged()
      // Enabling automatic backups should not wait for the next 15-minute tick;
      // let the handler answer first, then run the gated attempt if it is due.
      if (policy.enabled) setTimeout(() => { try { autoBackup.tick() } catch { /* logged in tick */ } }, 250)
      return { success: true, policy }
    } catch (err) {
      log.error('backup:setPolicy error:', String(err))
      return { success: false, error: 'state_failed' }
    }
  })

  // Delete one listed backup by name. Never a path, never a pattern.
  ipcMain.handle('backup:delete', async (_e, params: { name?: unknown }) => {
    const name = typeof params?.name === 'string' ? params.name : ''
    const outcome = deleteBackupFile(userDataDir(), name)
    if (!outcome.ok) return { success: false, error: outcome.error }
    notifyChanged()
    return { success: true }
  })

  // Restore one listed backup: the same merge import, from a file main itself
  // named. The renderer never supplies a path, so the traversal gates still hold.
  ipcMain.handle('backup:restore', async (_e, params: { name?: unknown }) => {
    const name = typeof params?.name === 'string' ? params.name : ''
    const read = readBackupFile(userDataDir(), name)
    if (!read.ok) return { error: read.error, errorCode: read.error }
    try {
      const outcome = importBackup({
        roots: defaultBackupRoots(String(getPref('workingDir') || '')),
        prefs: prefsAdapter(),
        data: read.data,
      })
      if (!outcome.ok) return { error: outcome.code, errorCode: outcome.code }
      notifyChanged()
      return importResponse(outcome.report)
    } catch (err) {
      log.error('backup:restore error:', String(err))
      return { error: 'read_failed', errorCode: 'read_failed' }
    }
  })
}
