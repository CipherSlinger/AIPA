import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { getPref } from '../config/config-manager'
import { safePath, getAllowedFsRoots } from '../utils/validate'
import { createLogger } from '../utils/logger'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import { readGitStatus, type GitStatusResult } from '../fs/git-status'
import {
  planGitDiff,
  classifyGitDiffError,
  GIT_DIFF_TIMEOUT_MS,
  GIT_DIFF_MAX_BUFFER,
} from '../fs/git-diff'

const log = createLogger('ipc:fs')

export function registerFsHandlers(): void {
  ipcMain.handle('fs:listDir', (_e, dirPath: string) => {
    try {
      const workingDir = getPref('workingDir')
      const allowedRoots = getAllowedFsRoots(workingDir)
      const safe = safePath(dirPath, allowedRoots)
      const entries = fs.readdirSync(safe, { withFileTypes: true })
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
        path: path.join(safe, e.name),
      })).sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
    } catch (err) {
      log.debug('fs:listDir error:', String(err))
      return []
    }
  })

  ipcMain.handle('fs:showSaveDialog', async (e, { defaultName, filters }: { defaultName: string; filters: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const result = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('fs:writeFile', (_e, { filePath, content }: { filePath: string; content: string }) => {
    try {
      const workingDir = getPref('workingDir')
      const allowedRoots = getAllowedFsRoots(workingDir)
      // For save dialog results, allow anywhere within home dir
      const safe = safePath(filePath, allowedRoots)
      fs.writeFileSync(safe, content, 'utf-8')
      return { success: true }
    } catch (err) {
      log.warn('fs:writeFile error:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('fs:showOpenDialog', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Working Directory',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('fs:showOpenFileDialog', async (e, { filters, multiSelections }: { filters?: { name: string; extensions: string[] }[]; multiSelections?: boolean }) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const properties: ('openFile' | 'multiSelections')[] = ['openFile']
    if (multiSelections) properties.push('multiSelections')
    const result = await dialog.showOpenDialog(win, {
      properties,
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
      title: 'Select Files',
    })
    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle('fs:readFile', (_e, filePath: string) => {
    try {
      const workingDir = getPref('workingDir')
      const allowedRoots = getAllowedFsRoots(workingDir)
      const safe = safePath(filePath, allowedRoots)
      const content = fs.readFileSync(safe, 'utf-8')
      return { content }
    } catch (err) {
      log.warn('fs:readFile error:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('fs:getHome', () => os.homedir())
  ipcMain.handle('fs:ensureDir', (_e, dirPath: string) => {
    try {
      const workingDir = getPref('workingDir')
      // ensureDir is limited to workingDir and ~/.claude only
      const allowedRoots = getAllowedFsRoots(workingDir)
      const safe = safePath(dirPath, allowedRoots)
      fs.mkdirSync(safe, { recursive: true })
      return safe
    } catch (err) {
      log.warn('fs:ensureDir error:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('fs:listCommands', (_e, workingDir: string) => {
    // Validate workingDir is within allowed roots before using it to build paths
    if (workingDir) {
      try {
        const allowedRoots = getAllowedFsRoots(getPref('workingDir'))
        safePath(workingDir, allowedRoots)
      } catch (err) {
        log.warn('fs:listCommands rejected unsafe workingDir:', String(err))
        // Ignore project-level commands from untrusted workingDir; fall through with empty list
        workingDir = ''
      }
    }
    const commandDirs = [
      path.join(os.homedir(), '.claude', 'commands'),
      ...(workingDir ? [path.join(workingDir, '.claude', 'commands')] : []),
    ]
    const commands: { name: string; description: string; source: 'user' | 'project' }[] = []
    for (const [i, dir] of commandDirs.entries()) {
      if (!fs.existsSync(dir)) continue
      try {
        const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.md'))
        for (const file of files) {
          const name = '/' + file.replace('.md', '')
          const content = fs.readFileSync(path.join(dir, file), 'utf-8')
          const firstLine = content.split('\n').find((l: string) => l.trim()) || ''
          const description = firstLine.replace(/^#+\s*/, '').slice(0, 80)
          commands.push({ name, description, source: i === 0 ? 'user' : 'project' })
        }
      } catch (err) {
        log.debug('fs:listCommands could not read directory:', String(err))
      }
    }
    return commands
  })

  // Check if a file/directory path exists (Iteration 510: actionable codeblocks)
  ipcMain.handle('fs:pathExists', (_e, { filePath }: { filePath: string }) => {
    try {
      // Deliberately not confined to the allowed roots: a transcript can
      // reference any path on the machine, and this call only answers
      // "does it exist" so the UI can show a truthful error instead of
      // opening an Explorer window on nothing.
      if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) return false
      return fs.existsSync(filePath)
    } catch {
      return false
    }
  })

  // Show item in system file manager (Iteration 510: clickable file paths)
  ipcMain.handle('shell:showItemInFolder', (_e, filePath: string) => {
    try {
      if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) {
        return { success: false, error: 'Invalid path' }
      }
      if (fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath)
        return { success: true }
      }
      return { success: false, error: 'Path does not exist' }
    } catch (err) {
      log.warn('shell:showItemInFolder error:', String(err))
      return { success: false, error: String(err) }
    }
  })

  // Git diff (Iteration 521: code changes view; wave 88A: per-conversation folder)
  //
  // The renderer may name the folder this diff belongs to. Both the folder and
  // the file path go through `planGitDiff`, which applies the same
  // `safePath`/allowed-roots gate as `fs:gitStatus` and refuses an unknown
  // folder instead of quietly running in the app-wide one — the wrong
  // checkout's diff is indistinguishable from the right one. Without `cwd`
  // the app-wide folder is still used, exactly as before.
  //
  // Paths reach git as argv entries (`execFileSync`, no shell). The 5 s timeout
  // and 100 KiB buffer are unchanged, and so is the rule that git's exit code 1
  // (differences exist) is an answer read from stdout, not an error. The exit
  // status has to be 1 for that, though: the old `if (err.stdout)` also caught
  // an empty Buffer, so `git diff` outside a repository (exit 129, stdout "")
  // came back as "no diff" instead of "not a repository".
  ipcMain.handle('fs:gitDiff', (_e, request: { filePath?: string; cwd?: string } = {}) => {
    const workingDir = (getPref('workingDir') as string) || os.homedir()
    const plan = planGitDiff(request, workingDir)
    if (!plan.ok) {
      log.debug('fs:gitDiff refused:', plan.code, plan.message)
      return plan
    }
    try {
      const output = execFileSync('git', plan.args, {
        cwd: plan.folder,
        timeout: GIT_DIFF_TIMEOUT_MS,
        maxBuffer: GIT_DIFF_MAX_BUFFER,
        // git's stderr is folded into the structured failure by
        // `classifyGitDiffError`; echoing it (a failing `git diff` prints its
        // whole usage) would be a second, untranslated copy on the console.
        // `windowsHide` keeps a console window from flashing, as in git-status.
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      return output.toString('utf-8')
    } catch (err: any) {
      if (err?.status === 1 && err.stdout != null) return err.stdout.toString('utf-8')
      log.debug('fs:gitDiff error:', String(err))
      return classifyGitDiffError(err)
    }
  })

  // Git status for the folder the conversation is using (wave 85B).
  //
  // The renderer supplies that folder; it is validated with the same
  // `safePath` gate as every other fs handler, so naming a path cannot widen
  // the roots. Without a folder the app-wide working directory is used, which
  // is what the old argument-less handler did. A rejection is reported as
  // `cwd_invalid`, never as an empty status: "I could not look" and "nothing
  // changed" must not read the same.
  ipcMain.handle('fs:gitStatus', (_e, { cwd }: { cwd?: string } = {}): GitStatusResult => {
    const workingDir = (getPref('workingDir') as string) || os.homedir()
    let folder: string
    if (typeof cwd === 'string' && cwd.trim()) {
      try {
        folder = safePath(cwd, getAllowedFsRoots(workingDir))
      } catch (err) {
        log.debug('fs:gitStatus rejected cwd:', String(err))
        return { ok: false, code: 'cwd_invalid', message: String(err) }
      }
    } else {
      folder = path.resolve(workingDir)
    }
    return readGitStatus(folder)
  })
}
