import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { getPref, setPref, getAllPrefs } from '../config/config-manager'
import { createLogger } from '../utils/logger'
import fs from 'fs'
import {
  BACKUP_FORMAT_VERSION,
  collectBackup,
  defaultBackupRoots,
  importBackup,
  type BackupPrefs,
} from '../backup/backup-data'

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

export function registerBackupHandlers(): void {
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
      const roots = defaultBackupRoots(String(getPref('workingDir') || ''))
      const { document, counts } = collectBackup({
        roots,
        // The whole store is handed over; collectBackup reads only its fixed
        // allowlist, so apiKeyEncrypted, modelProviders and the rest never
        // reach the file.
        prefs: prefsAdapter().all(),
        appVersion: app.getVersion(),
      })
      const json = JSON.stringify(document, null, 2)
      fs.writeFileSync(result.filePath, json, 'utf-8')
      const sizeKB = Math.round(Buffer.byteLength(json, 'utf-8') / 1024)
      ;(setPref as unknown as (k: string, v: unknown) => void)('lastBackupDate', Date.now())

      return {
        success: true,
        filePath: result.filePath,
        sizeKB,
        backupVersion: BACKUP_FORMAT_VERSION,
        counts,
      }
    } catch (err) {
      log.error('backup:export error:', String(err))
      return { error: 'write_failed' }
    }
  })

  // Import a backup, merging into what is already here.
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
      const report = outcome.report
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
    } catch (err) {
      // A refusal is a result, not a thrown error: an IPC rejection reaches the
      // renderer as "Error invoking remote method …", which a user cannot act on.
      log.error('backup:import error:', String(err))
      return { error: 'read_failed', errorCode: 'read_failed' }
    }
  })
}
