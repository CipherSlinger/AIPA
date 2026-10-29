/**
 * MemdirTab — the structured-memory file console.
 *
 * Extracted from `MemoryPanel` so project identity, filtering and the create
 * form live together. A filter is a view toggle: filtered-out cards stay
 * mounted behind `display:none`, because unmounting one would discard an open
 * editor and its unsaved draft.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Brain, Plus, RefreshCw } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useSessionStore } from '../../store'
import { scrollToFirstHighlight } from './MemoryHighlight'
import MemoryFileCard, {
  MEMDIR_TYPE_COLORS,
  MEMDIR_TYPE_I18N_KEYS,
  type MemdirFile,
} from './MemoryFileCard'
import MemoryCreateForm from './MemoryCreateForm'
import UnreadableMemoryPanel from './UnreadableMemoryPanel'
import { assembleMemoryContextForTurn, type MemoryUnreadableEntry } from '../../hooks/promptMemory'
import {
  collectCreatableProjects,
  collectMemoryProjects,
  matchesProjectFilter,
  memdirEmptyReason,
  projectFilterLabel,
  projectHashFromFilter,
  widenProjectFilterForFocus,
  type MemoryProjectFilter,
} from './memoryProjects'

type MemdirTypeFilter = 'all' | 'user' | 'feedback' | 'project' | 'reference'

/** Per-tab focus handed down after a search result row is opened. */
export interface MemdirTabFocus {
  documentId?: string
  query?: string
  nonce?: number
}

export default function MemdirTab({ focus }: { focus?: MemdirTabFocus }) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  // The session list is the app's existing hash → folder join: Codex rows carry
  // a real cwd, Claude rows carry the decoded project path. No extra IPC.
  const sessions = useSessionStore(s => s.sessions)
  const [files, setFiles] = useState<MemdirFile[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<MemdirTypeFilter>('all')
  const [projectFilter, setProjectFilter] = useState<MemoryProjectFilter>('all')
  const [unreadable, setUnreadable] = useState<MemoryUnreadableEntry[]>([])
  const [homeDir, setHomeDir] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editRequest, setEditRequest] = useState<{ filePath: string; nonce: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /**
   * Refetch only the parsed list, without the whole-tab spinner. A successful
   * save or create has already changed one row; flashing every other row back
   * to a loading state would make the save look like a reload.
   */
  const refreshFiles = useCallback(async () => {
    try {
      const result = await window.electronAPI.memoryList('all')
      setFiles(result as MemdirFile[])
      setLoadError(null)
    } catch (err) {
      setLoadError(String(err))
    }
  }, [])

  const openFileInEditor = useCallback((filePath: string) => {
    setShowCreate(false)
    // A filter must never be the reason a named file does not open.
    setTypeFilter('all')
    setProjectFilter('all')
    setExpanded(filePath)
    setEditRequest(prev => ({ filePath, nonce: (prev?.nonce ?? 0) + 1 }))
    // A file that collided with a create can be newer than the last listing;
    // refetch so its card exists to open, rather than expanding nothing.
    if (!files.some(f => f.filePath === filePath)) void refreshFiles()
  }, [files, refreshFiles])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await window.electronAPI.memoryList('all')
      setFiles(result as MemdirFile[])
    } catch (err) {
      // A thrown list read is "could not read", not "no memories".
      setFiles([])
      setLoadError(String(err))
    }

    // `memory:list` cannot carry diagnosis, so the paths AIPA could not read
    // come from the same assembler the prompt uses.
    try {
      setHomeDir(await window.electronAPI.fsGetHome())
      const context = await assembleMemoryContextForTurn({ prefs, cwd: prefs.workingDir || '' })
      setUnreadable(context.unreadable)
    } catch {
      setUnreadable([])
    }
    setLoading(false)
  }, [prefs])

  useEffect(() => { load() }, [load])

  // A search hit names a file, so open exactly that file. Clearing the type
  // and project filters matters: either could hide the row we are opening.
  useEffect(() => {
    if (!focus?.documentId) return
    setTypeFilter('all')
    setProjectFilter(current => widenProjectFilterForFocus(current, true))
    setExpanded(focus.documentId)
  }, [focus?.documentId, focus?.nonce])

  useEffect(() => {
    if (!focus?.query || expanded !== focus.documentId) return
    const frame = requestAnimationFrame(() => {
      const selector = `[data-memdir-file="${encodeURIComponent(focus.documentId as string)}"]`
      const element = listRef.current?.querySelector<HTMLElement>(selector) ?? null
      element?.scrollIntoView({ block: 'center' })
      scrollToFirstHighlight(element)
    })
    return () => cancelAnimationFrame(frame)
  }, [focus?.nonce, focus?.query, focus?.documentId, expanded, files.length])

  const projectOptions = useMemo(() => collectMemoryProjects(files, sessions), [files, sessions])
  const creatableProjects = useMemo(() => collectCreatableProjects(files, sessions), [files, sessions])
  const projectLabels = useMemo(() => {
    const map = new Map<string, { label: string; known: boolean }>()
    for (const project of projectOptions) map.set(project.hash, project)
    return map
  }, [projectOptions])

  // The project a filtered card points at can disappear when the list is
  // refreshed. Falling back to All is the only filter that still shows the
  // remaining files; keeping a value no option carries would render blank.
  useEffect(() => {
    const hash = projectHashFromFilter(projectFilter)
    if (hash !== null && !projectOptions.some(project => project.hash === hash)) {
      setProjectFilter('all')
    }
  }, [projectFilter, projectOptions])

  const projectScopedFiles = files.filter(f => matchesProjectFilter(f, projectFilter))
  const filteredFiles = typeFilter === 'all'
    ? projectScopedFiles
    : projectScopedFiles.filter(f => f.type === typeFilter)
  const emptyReason = memdirEmptyReason(files, projectFilter, typeFilter)

  // Type counts follow the project filter. A count that includes files the
  // current view cannot show would promise rows that never appear.
  const typeCounts: Record<string, number> = { all: projectScopedFiles.length }
  for (const f of projectScopedFiles) {
    typeCounts[f.type] = (typeCounts[f.type] || 0) + 1
  }

  const handleCreated = useCallback((filePath: string) => {
    setShowCreate(false)
    // Land on the new file, open but not in edit mode: the form has just taken
    // the content, and reopening a raw editor over it would invite a second
    // edit of the same bytes. Reset both filters so the row is visible.
    setTypeFilter('all')
    setProjectFilter('all')
    setExpanded(filePath)
    void refreshFiles()
  }, [refreshFiles])

  const defaultProjectHash = projectHashFromFilter(projectFilter) ?? undefined
  const globalCount = files.filter(f => f.scope === 'global').length

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 12 }}>
        <RefreshCw size={14} style={{ marginRight: 6, animation: 'spin 1s linear infinite' }} />
        {t('common.loading')}
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>~/.claude/memory/</span>
          <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={12} />
          </button>
        </div>
        <UnreadableMemoryPanel entries={unreadable} homeDir={homeDir} />
        {loadError ? (
          // A failed read used to render the same empty state as a user with
          // no memories; name the failure instead.
          <div style={{
            padding: '6px 12px', fontSize: 11, color: 'var(--danger-text)',
            background: 'rgba(239,68,68,0.08)', flexShrink: 0,
          }}>
            {t('settingsMemory.loadingError', { error: loadError })}
          </div>
        ) : showCreate ? (
          <MemoryCreateForm
            projects={creatableProjects}
            defaultProjectHash={defaultProjectHash}
            onCreated={handleCreated}
            onOpenExisting={openFileInEditor}
            onCancel={() => setShowCreate(false)}
          />
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', gap: 8, textAlign: 'center', padding: '0 24px',
          }}>
            <Brain size={28} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 12 }}>{t('memory.memdirEmpty')}</span>
            <span style={{ fontSize: 10, opacity: 0.7 }}>{t('memory.memdirEmptyHint')}</span>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                marginTop: 4, display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.40)',
                borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 600,
                color: 'var(--accent-text)', cursor: 'pointer',
              }}
            >
              <Plus size={12} />
              {t('memory.editor.newButton')}
            </button>
          </div>
        )}
        <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', flex: 1, minWidth: 0 }}>
          {'~/.claude/memory/ · '}{files.length}{' '}{files.length === 1 ? 'file' : 'files'}
        </span>
        {/* One entry per project that actually has memory files, plus Global.
            Filtering only hides cards; it never unmounts one. */}
        <select
          aria-label={t('memory.projects.filterLabel')}
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value as MemoryProjectFilter)}
          style={{
            maxWidth: 220, minWidth: 90, background: 'var(--bg-hover)',
            border: '1px solid var(--border)', borderRadius: 6, padding: '2px 4px',
            fontSize: 10, color: 'var(--text-secondary)', outline: 'none',
          }}
        >
          <option value="all">{t('memory.projects.filterAll', { count: files.length })}</option>
          <option value="global">{t('memory.memdirGlobal')} ({globalCount})</option>
          {projectOptions.map(project => (
            <option key={project.hash} value={`project:${project.hash}`}>
              {t('memory.projects.filterEntry', { label: project.label, count: project.count })}
            </option>
          ))}
        </select>
        {/* Creating a file must not require first deleting every file: the
            form used to exist only in the empty state. */}
        <button onClick={() => setShowCreate(v => !v)} title={t('memory.editor.newButton')}
          aria-expanded={showCreate}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: showCreate ? 'var(--accent-text)' : 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
          <Plus size={13} />
        </button>
        <button onClick={load} title={t('memory.projectRefresh')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
          <RefreshCw size={12} />
        </button>
      </div>

      {showCreate && (
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          <MemoryCreateForm
            projects={creatableProjects}
            defaultProjectHash={defaultProjectHash}
            onCreated={handleCreated}
            onOpenExisting={openFileInEditor}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      <UnreadableMemoryPanel entries={unreadable} homeDir={homeDir} />

      {/* Type filter pills */}
      <div style={{
        display: 'flex', gap: 4, padding: '6px 10px', flexWrap: 'wrap',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        {/* All pill */}
        <button
          onClick={() => setTypeFilter('all')}
          style={{
            background: typeFilter === 'all' ? 'rgba(99,102,241,0.20)' : 'var(--bg-hover)',
            color: typeFilter === 'all' ? 'var(--accent-text)' : 'var(--text-muted)',
            border: typeFilter === 'all' ? '1px solid rgba(99,102,241,0.40)' : '1px solid var(--border)',
            borderRadius: 20, padding: '2px 10px', fontSize: 10, cursor: 'pointer',
            fontWeight: typeFilter === 'all' ? 600 : 400, transition: 'all 0.15s ease',
          }}
        >
          {t('memory.filterAll')} {typeCounts.all || 0}
        </button>
        {(['user', 'feedback', 'project', 'reference'] as const).map(type => {
          const color = MEMDIR_TYPE_COLORS[type]
          const isActive = typeFilter === type
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(isActive ? 'all' : type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: isActive ? `${color}22` : 'var(--bg-hover)',
                color: isActive ? color : 'var(--text-muted)',
                border: isActive ? `1px solid ${color}55` : '1px solid var(--border)',
                borderRadius: 20, padding: '2px 9px', fontSize: 10, cursor: 'pointer',
                fontWeight: isActive ? 600 : 400, transition: 'all 0.15s ease',
              }}
            >
              <span style={{
                display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                background: color, flexShrink: 0,
              }} />
              {t(MEMDIR_TYPE_I18N_KEYS[type] || 'memory.filterAll')}
              <span style={{ fontSize: 9, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                {typeCounts[type] || 0}
              </span>
            </button>
          )
        })}
      </div>

      {/* File list */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
        {filteredFiles.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: 'var(--text-muted)', gap: 8, textAlign: 'center' }}>
            <Brain size={24} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 12, maxWidth: 380, lineHeight: 1.5 }}>
              {emptyReason === 'project'
                ? projectFilter === 'global'
                  ? t('memory.memdirEmptyGlobal')
                  : t('memory.memdirEmptyProject', {
                      label: projectFilterLabel(projectFilter, projectOptions) ?? '',
                    })
                : t('memory.memdirEmptyType', {
                    type: t(MEMDIR_TYPE_I18N_KEYS[typeFilter] || 'memory.filterAll'),
                  })}
            </span>
          </div>
        )}
        {/* Filtered-out cards stay mounted behind display:none. Unmounting them
            would throw away an open editor and its draft, and a filter is a
            view toggle, not a decision to discard anything. */}
        {files.map(f => {
          const visible = matchesProjectFilter(f, projectFilter)
            && (typeFilter === 'all' || f.type === typeFilter)
          const project = f.scope === 'project' && f.projectHash
            ? projectLabels.get(f.projectHash)
            : undefined
          return (
            <div key={f.filePath} style={{ display: visible ? undefined : 'none' }}>
              <MemoryFileCard
                file={f}
                expanded={expanded === f.filePath}
                query={focus?.query}
                editNonce={editRequest?.filePath === f.filePath ? editRequest.nonce : undefined}
                projectLabel={project?.label}
                projectLabelKnown={project?.known}
                onToggle={() => setExpanded(expanded === f.filePath ? null : f.filePath)}
                onSaved={() => { void refreshFiles() }}
              />
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '4px 12px', fontSize: 9, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        {t('memory.memdirFooter')}
      </div>

      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}
