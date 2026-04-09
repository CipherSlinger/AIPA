/**
 * Worktree Manager
 *
 * Wraps `git worktree` commands to create/list/remove git worktrees
 * in the .claude/worktrees/ subdirectory (matching Claude Code CLI convention).
 */
import { execFileSync, execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'

const log = createLogger('worktree-manager')

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
  isMain: boolean
}

function isGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function getWorktreesDir(cwd: string): string {
  // Find git root
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf-8' }).trim()
  return path.join(gitRoot, '.claude', 'worktrees')
}

export function checkIsGitRepo(cwd: string): boolean {
  return isGitRepo(cwd)
}

export function listWorktrees(cwd: string): WorktreeInfo[] {
  if (!isGitRepo(cwd)) return []
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf-8' })
    const worktrees: WorktreeInfo[] = []
    const blocks = out.trim().split('\n\n')
    for (const block of blocks) {
      const lines = block.trim().split('\n')
      const wtPath = lines.find(l => l.startsWith('worktree '))?.slice('worktree '.length) ?? ''
      const head = lines.find(l => l.startsWith('HEAD '))?.slice('HEAD '.length) ?? ''
      const branchLine = lines.find(l => l.startsWith('branch '))?.slice('branch '.length) ?? ''
      const branch = branchLine.replace('refs/heads/', '')
      const isMain = !wtPath.includes('.claude/worktrees')
      if (wtPath) worktrees.push({ path: wtPath, branch, head, isMain })
    }
    return worktrees
  } catch (err) {
    log.warn('listWorktrees failed:', String(err))
    return []
  }
}

export function createWorktree(cwd: string, name: string): { path: string; branch: string } {
  if (!isGitRepo(cwd)) throw new Error('Not a git repository')

  const dir = getWorktreesDir(cwd)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // Validate name: letters, digits, dots, underscores, dashes only
  if (!/^[a-zA-Z0-9._/-]+$/.test(name)) {
    throw new Error('Invalid worktree name: use letters, digits, dots, underscores, dashes, or slashes')
  }

  // Sanitize to path segment
  const slug = name.replace(/\//g, '-').replace(/[^a-zA-Z0-9._-]/g, '-')
  const wtPath = path.join(dir, slug)
  const branchName = name.startsWith('feature/') ? name : `worktree/${slug}`

  // Check if branch already exists
  let branchExists = false
  try {
    execFileSync('git', ['rev-parse', '--verify', branchName], { cwd, stdio: 'pipe' })
    branchExists = true
  } catch { /* branch doesn't exist */ }

  if (branchExists) {
    execFileSync('git', ['worktree', 'add', wtPath, branchName], { cwd, stdio: 'pipe' })
  } else {
    execFileSync('git', ['worktree', 'add', '-b', branchName, wtPath], { cwd, stdio: 'pipe' })
  }

  log.info('createWorktree:', wtPath, 'branch:', branchName)
  return { path: wtPath, branch: branchName }
}

export function removeWorktree(cwd: string, worktreePath: string, force: boolean): void {
  if (!isGitRepo(cwd)) throw new Error('Not a git repository')

  // Safety: only allow removal of worktrees in .claude/worktrees/
  const worktreesDir = getWorktreesDir(cwd)
  if (!path.resolve(worktreePath).startsWith(path.resolve(worktreesDir))) {
    throw new Error('Can only remove worktrees created by AIPA (in .claude/worktrees/)')
  }

  const args = ['worktree', 'remove', worktreePath]
  if (force) args.push('--force')
  execFileSync('git', args, { cwd, stdio: 'pipe' })
  log.info('removeWorktree:', worktreePath)
}

export function getCurrentBranch(cwd: string): string {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}
