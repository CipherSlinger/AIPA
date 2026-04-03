import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { getPref, setPref, getAllPrefs } from '../config/config-manager'
import { createLogger } from '../utils/logger'
import fs from 'fs'

const log = createLogger('ipc:backup')

export function registerBackupHandlers(): void {
  // Export all user data as JSON
  ipcMain.handle('backup:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { error: 'No window' }

    // Collect all data from electron-store (excluding API keys for security)
    const allPrefs = getAllPrefs() as unknown as Record<string, unknown>
    const exportData: Record<string, unknown> = {
      _meta: {
        version: 1,
        exportDate: new Date().toISOString(),
        appVersion: app.getVersion(),
      },
      settings: {
        model: allPrefs.model,
        workingDir: allPrefs.workingDir,
        fontSize: allPrefs.fontSize,
        fontFamily: allPrefs.fontFamily,
        skipPermissions: allPrefs.skipPermissions,
        verbose: allPrefs.verbose,
        theme: allPrefs.theme,
        effortLevel: allPrefs.effortLevel,
        outputStyle: allPrefs.outputStyle,
        compactMode: allPrefs.compactMode,
        desktopNotifications: allPrefs.desktopNotifications,
        resumeLastSession: allPrefs.resumeLastSession,
        systemPrompt: allPrefs.systemPrompt,
        promptTemplate: allPrefs.promptTemplate,
        thinkingLevel: allPrefs.thinkingLevel,
        maxTurns: allPrefs.maxTurns,
        maxBudgetUsd: allPrefs.maxBudgetUsd,
        notifySound: allPrefs.notifySound,
        preventSleep: allPrefs.preventSleep,
        displayName: allPrefs.displayName,
        language: allPrefs.language,
      },
      personas: allPrefs.personas || [],
      workflows: allPrefs.workflows || [],
      notes: allPrefs.notes || [],
      memories: allPrefs.memories || [],
      textSnippets: allPrefs.textSnippets || [],
      quickReplies: allPrefs.quickReplies || [],
      customConvTemplates: allPrefs.customConvTemplates || [],
      tagNames: allPrefs.tagNames || [],
    }

    const result = await dialog.showSaveDialog(win, {
      defaultPath: `aipa-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'AIPA Backup', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      const json = JSON.stringify(exportData, null, 2)
      fs.writeFileSync(result.filePath, json, 'utf-8')
      const sizeKB = Math.round(json.length / 1024)
      ;(setPref as any)('lastBackupDate', Date.now())

      return {
        success: true,
        filePath: result.filePath,
        sizeKB,
        counts: {
          personas: ((exportData.personas as unknown[]) || []).length,
          workflows: ((exportData.workflows as unknown[]) || []).length,
          notes: ((exportData.notes as unknown[]) || []).length,
          memories: ((exportData.memories as unknown[]) || []).length,
          snippets: ((exportData.textSnippets as unknown[]) || []).length,
        },
      }
    } catch (err) {
      log.error('backup:export error:', String(err))
      return { error: String(err) }
    }
  })

  // Import user data from backup JSON
  ipcMain.handle('backup:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { error: 'No window' }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'AIPA Backup', extensions: ['json'] }],
      title: 'Select AIPA Backup File',
    })

    if (result.canceled || !result.filePaths[0]) return { canceled: true }

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8')
      const data = JSON.parse(content)

      if (!data._meta || !data._meta.version) {
        return { error: 'Invalid backup file format' }
      }

      const imported: Record<string, number> = {}

      const mergeArrays = (key: string, items: unknown[]) => {
        if (!Array.isArray(items) || items.length === 0) return
        const existing = ((getPref as any)(key) || []) as { id?: string }[]
        const existingIds = new Set(existing.map((e: { id?: string }) => e.id).filter(Boolean))
        const newItems = (items as { id?: string }[]).filter(item => !item.id || !existingIds.has(item.id))
        if (newItems.length > 0) {
          ;(setPref as any)(key, [...existing, ...newItems])
          imported[key] = newItems.length
        }
      }

      if (data.settings && typeof data.settings === 'object') {
        for (const [key, value] of Object.entries(data.settings)) {
          if (value !== undefined && value !== null && key !== 'apiKey' && key !== 'apiKeyEncrypted') {
            ;(setPref as any)(key, value)
          }
        }
        imported.settings = 1
      }

      mergeArrays('personas', data.personas)
      mergeArrays('workflows', data.workflows)
      mergeArrays('notes', data.notes)
      mergeArrays('memories', data.memories)
      mergeArrays('textSnippets', data.textSnippets)
      mergeArrays('quickReplies', data.quickReplies)
      mergeArrays('customConvTemplates', data.customConvTemplates)

      return {
        success: true,
        imported,
        backupDate: data._meta.exportDate,
      }
    } catch (err) {
      log.error('backup:import error:', String(err))
      return { error: String(err) }
    }
  })
}
