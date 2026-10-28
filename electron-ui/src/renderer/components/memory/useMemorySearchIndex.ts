/**
 * useMemorySearchIndex — the I/O half of cross-tier memory search.
 *
 * Personal facts already live in the prefs store, so they need no load.
 * The other four tiers are read from disk/IPC. They are fetched once, on the
 * first non-empty query, and then filtered locally on every keystroke: typing
 * must never fan out a new set of reads. A tier that cannot be read keeps an
 * `error` state so the results view can say "could not be searched" instead of
 * silently showing zero matches.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePrefsStore } from '../../store'
import type { MemoryItem } from '../../types/app.types'
import {
  memoryDocumentTitle,
  type MemorySearchDocument,
  type MemorySearchTier,
  type MemoryTierSource,
} from './memorySearch'

type LazyTier = Exclude<MemorySearchTier, 'personal'>

const LAZY_INITIAL: Record<LazyTier, MemoryTierSource> = {
  project: { tier: 'project', state: 'loading', documents: [] },
  memdir: { tier: 'memdir', state: 'loading', documents: [] },
  dream: { tier: 'dream', state: 'loading', documents: [] },
  config: { tier: 'config', state: 'loading', documents: [] },
}

interface MemdirRow {
  filePath?: string
  name?: string
  description?: string
  content?: string
}

interface DreamRow {
  id: string
  status: string
  createdAt: number
  sessionId: string
  filePath: string
  statements?: string[]
  note?: string
}

interface InstructionTarget {
  scope: 'global' | 'project' | 'local'
  title: string
  path: string
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Missing files are the normal empty state (no project memory yet), not a
 * failed read. fs:readFile surfaces both as an `error` string.
 */
function isMissingFile(error: string | undefined): boolean {
  return !!error && /ENOENT|no such file|not found/i.test(error)
}

function basename(filePath: string): string {
  if (!filePath) return ''
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] || filePath
}

/** Pinned first, then most recently edited: matches the personal tab's order. */
export function buildPersonalSearchDocuments(memories: readonly MemoryItem[]): MemorySearchDocument[] {
  return [...memories]
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    })
    .map(memory => ({
      tier: 'personal',
      id: memory.id,
      title: memoryDocumentTitle(memory.content) || memory.content.trim().slice(0, 120),
      body: memory.content,
    }))
}

export function useMemorySearchIndex(
  active: boolean,
  memories: readonly MemoryItem[],
): MemoryTierSource[] {
  const workingDirPref = usePrefsStore(s => s.prefs.workingDir)
  const startedRef = useRef(false)
  const mountedRef = useRef(true)
  const [lazy, setLazy] = useState<Record<LazyTier, MemoryTierSource>>(LAZY_INITIAL)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!active || startedRef.current) return
    startedRef.current = true

    const patch = (tier: LazyTier, next: MemoryTierSource) => {
      if (!mountedRef.current) return
      setLazy(current => ({ ...current, [tier]: next }))
    }

    const loadProject = async (
      workingDir: string,
    ): Promise<void> => {
      const filePath = `${workingDir}/.claude/MEMORY.md`
      try {
        const result = await window.electronAPI.fsReadFile(filePath)
        if (result && typeof result.content === 'string') {
          const content = result.content
          patch('project', {
            tier: 'project',
            state: 'ready',
            documents: content.trim()
              ? [{ tier: 'project', id: filePath, title: 'MEMORY.md', body: content, source: filePath }]
              : [],
          })
          return
        }
        if (isMissingFile(result?.error)) {
          patch('project', { tier: 'project', state: 'ready', documents: [] })
          return
        }
        patch('project', {
          tier: 'project',
          state: 'error',
          documents: [],
          error: result?.error || 'read failed',
        })
      } catch (err) {
        patch('project', { tier: 'project', state: 'error', documents: [], error: errorText(err) })
      }
    }

    const loadMemdir = async (): Promise<void> => {
      try {
        const rows = await window.electronAPI.memoryList('all')
        if (!Array.isArray(rows)) throw new Error('memory list did not return rows')
        const documents = (rows as MemdirRow[])
          .map(row => {
            const filePath = row.filePath || ''
            const body = [row.description || '', row.content || '']
              .filter(part => part.trim().length > 0)
              .join('\n\n')
            return {
              tier: 'memdir' as const,
              id: filePath,
              title: row.name || basename(filePath),
              body,
              source: filePath || undefined,
            }
          })
          .filter(document => document.title.trim().length > 0 || document.body.trim().length > 0)
        patch('memdir', { tier: 'memdir', state: 'ready', documents })
      } catch (err) {
        patch('memdir', { tier: 'memdir', state: 'error', documents: [], error: errorText(err) })
      }
    }

    const loadDream = async (): Promise<void> => {
      try {
        const rows = await window.electronAPI.memoryDreamList()
        if (!Array.isArray(rows)) throw new Error('dream list did not return rows')
        const documents = (rows as DreamRow[])
          .map(record => {
            // The pass's own statements are the remembered text; the note is
            // why it ran. Session ids are not facts, so they stay out.
            const body = [record.note || '', ...(record.statements || [])]
              .filter(part => part.trim().length > 0)
              .join('\n')
            const title = basename(record.filePath) ||
              `${record.status} · ${record.sessionId.slice(0, 8)}`
            return {
              tier: 'dream' as const,
              id: record.id,
              title,
              body,
              source: record.filePath || undefined,
            }
          })
        patch('dream', { tier: 'dream', state: 'ready', documents })
      } catch (err) {
        patch('dream', { tier: 'dream', state: 'error', documents: [], error: errorText(err) })
      }
    }

    const loadConfig = async (homeDir: string, workingDir: string): Promise<void> => {
      if (!homeDir) {
        patch('config', {
          tier: 'config',
          state: 'error',
          documents: [],
          error: 'home directory unavailable',
        })
        return
      }
      const targets: InstructionTarget[] = [
        { scope: 'global', title: '~/.claude/CLAUDE.md', path: `${homeDir}/.claude/CLAUDE.md` },
        { scope: 'project', title: 'CLAUDE.md', path: `${workingDir}/CLAUDE.md` },
        { scope: 'local', title: '.claude/CLAUDE.local.md', path: `${workingDir}/.claude/CLAUDE.local.md` },
      ]
      const reads = await Promise.all(targets.map(async target => {
        try {
          return { target, result: await window.electronAPI.fsReadFile(target.path) }
        } catch (err) {
          return { target, result: { error: errorText(err) } }
        }
      }))

      const documents: MemorySearchDocument[] = []
      const failures: string[] = []
      for (const { target, result } of reads) {
        if (result && typeof result.content === 'string') {
          if (result.content.trim()) {
            documents.push({
              tier: 'config',
              id: target.scope,
              title: target.title,
              body: result.content,
              source: target.path,
            })
          }
          continue
        }
        if (isMissingFile(result?.error)) continue
        failures.push(`${target.title}: ${result?.error || 'read failed'}`)
      }

      if (failures.length > 0) {
        patch('config', {
          tier: 'config',
          state: 'error',
          documents,
          error: failures.join('; '),
        })
      } else {
        patch('config', { tier: 'config', state: 'ready', documents })
      }
    }

    void (async () => {
      let homeDir = ''
      try {
        homeDir = await window.electronAPI.fsGetHome()
      } catch {
        // loadConfig reports this; the file tiers still use the prefs path.
      }
      const workingDir = workingDirPref || homeDir
      // Independent loads: each tier reports its own state as soon as it lands.
      void loadProject(workingDir)
      void loadMemdir()
      void loadDream()
      void loadConfig(homeDir, workingDir)
    })()
  }, [active, workingDirPref])

  const personal = useMemo<MemoryTierSource>(() => ({
    tier: 'personal',
    state: 'ready',
    documents: buildPersonalSearchDocuments(memories),
  }), [memories])

  return useMemo(() => [
    personal,
    lazy.project,
    lazy.memdir,
    lazy.dream,
    lazy.config,
  ], [personal, lazy])
}
