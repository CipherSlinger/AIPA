/**
 * MemoryFileCard — one structured-memory file in the Memory console.
 *
 * Extracted from `MemdirTab` so the list keeps owning loading/filtering and
 * each row owns its own read/write lifecycle. The row is still the element
 * the search-hit focus path scrolls to (`data-memdir-file`), and the expanded
 * read-only view is unchanged, including highlight rendering.
 *
 * Editing is raw-text, frontmatter and all: the file is the unit a user sees
 * on disk, and a field form would silently drop any key this app does not
 * know about. The SHA-256 captured when the file is opened is the
 * compare-and-swap token for the save, so an edit made outside AIPA is
 * reported instead of being overwritten.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useT } from '../../i18n'
import { HighlightedText } from './MemoryHighlight'
import { findHighlightRanges } from './memorySearch'
import { MAX_MEMORY_EDITOR_BYTES, memorySaveBlockReason, utf8ByteLength } from './memoryEditor'

export interface MemdirFile {
  filePath: string
  name: string
  description: string
  type: 'user' | 'feedback' | 'project' | 'reference' | 'unknown'
  content: string
  scope: 'global' | 'project'
  projectHash?: string
  mtime: number
}

export const MEMDIR_TYPE_COLORS: Record<string, string> = {
  user: '#6366f1',
  feedback: '#fbbf24',
  project: '#4ade80',
  reference: '#a78bfa',
  unknown: 'var(--text-muted)',
}

export const MEMDIR_TYPE_I18N_KEYS: Record<string, string> = {
  user: 'memory.filterUser',
  feedback: 'memory.filterFeedback',
  project: 'memory.filterProject',
  reference: 'memory.filterReference',
  unknown: 'memory.memdirTypeUnknown',
}

/** The parts of a failed `memory:read` the card needs to explain a refusal. */
interface MemoryReadFailureState {
  code: string
  message: string
}

interface MemoryFileCardProps {
  file: MemdirFile
  expanded: boolean
  query?: string
  onToggle: () => void
  /** Refetch the parsed list after a save so other visible fields follow disk. */
  onSaved: () => void
  /** Bumped when the console wants this exact file opened in edit mode. */
  editNonce?: number
}

export default function MemoryFileCard({
  file,
  expanded,
  query,
  onToggle,
  onSaved,
  editNonce,
}: MemoryFileCardProps) {
  const t = useT()
  const [raw, setRaw] = useState<string | null>(null)
  const [sha, setSha] = useState<string | null>(null)
  const [readLoading, setReadLoading] = useState(false)
  const [readError, setReadError] = useState<MemoryReadFailureState | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [baseline, setBaseline] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ sha256?: string; mtime?: number } | null>(null)
  const [wantEdit, setWantEdit] = useState(false)

  // Monotonic id: a read that finishes after the row collapsed (or after a
  // second read started) must not overwrite the newer state.
  const readIdRef = useRef(0)

  type ReadOutcome =
    | { ok: true; content: string; sha256: string }
    | { ok: false; code: string; message: string }
    | null

  const loadRaw = useCallback(async (): Promise<ReadOutcome> => {
    const id = ++readIdRef.current
    setReadLoading(true)
    setReadError(null)
    try {
      const res = await window.electronAPI.memoryRead(file.filePath)
      if (id !== readIdRef.current) return null
      if (res.ok) {
        setRaw(res.content)
        setSha(res.sha256)
        return { ok: true, content: res.content, sha256: res.sha256 }
      }
      setRaw(null)
      setSha(null)
      setReadError({ code: res.code, message: res.message })
      return { ok: false, code: res.code, message: res.message }
    } catch (err) {
      if (id === readIdRef.current) {
        setRaw(null)
        setSha(null)
        const failure = { code: 'read_failed', message: String(err) }
        setReadError(failure)
        return { ok: false, ...failure }
      }
      return null
    } finally {
      if (id === readIdRef.current) setReadLoading(false)
    }
  }, [file.filePath])

  useEffect(() => {
    if (!expanded) {
      // Abandon any in-flight read; a collapsed row does not need its bytes.
      readIdRef.current += 1
      setReadLoading(false)
      return
    }
    // A listing refresh can report a new mtime, but never adopt a fresh sha
    // while a draft is open: the stale sha is exactly what lets the next Save
    // notice an outside edit instead of overwriting it.
    if (editing) return
    void loadRaw()
  }, [expanded, loadRaw, file.mtime, editing])

  // "Open it" on a create collision lands here: wait for the raw bytes, then
  // enter edit mode on top of them rather than on the parsed body.
  useEffect(() => {
    if (editNonce === undefined) return
    if (!expanded) return
    setWantEdit(true)
  }, [editNonce, expanded])

  useEffect(() => {
    if (!wantEdit || !expanded || raw === null) return
    setWantEdit(false)
    setDraft(raw)
    setBaseline(raw)
    setEditing(true)
    setSaveError(null)
    setConflict(null)
  }, [wantEdit, expanded, raw])

  const dirty = editing && draft !== baseline

  const beginEdit = useCallback(() => {
    if (raw === null) return
    setDraft(raw)
    setBaseline(raw)
    setEditing(true)
    setSaveError(null)
    setConflict(null)
  }, [raw])

  const cancelEdit = useCallback(() => {
    // Cancel is never allowed to throw a draft away silently. The ask is the
    // only confirmation in this card, because it discards user input.
    if (draft !== baseline && !window.confirm(t('memory.editor.discardConfirm'))) return
    setEditing(false)
    setDraft(baseline)
    setSaveError(null)
    setConflict(null)
  }, [draft, baseline, t])

  const handleToggle = useCallback(() => {
    if (expanded && editing) {
      if (draft !== baseline && !window.confirm(t('memory.editor.discardConfirm'))) return
      setEditing(false)
      setDraft(baseline)
      setSaveError(null)
      setConflict(null)
      setWantEdit(false)
    }
    onToggle()
  }, [expanded, editing, draft, baseline, t, onToggle])

  const save = useCallback(async (expectedSha256: string | undefined) => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await window.electronAPI.memoryWrite(file.filePath, draft, expectedSha256)
      if (res.ok) {
        setRaw(draft)
        setSha(res.sha256)
        setBaseline(draft)
        setEditing(false)
        setConflict(null)
        onSaved()
      } else if (res.code === 'changed_on_disk') {
        // Keep the draft and the original sha: the next decision is the
        // user's, not ours. Nothing was written.
        setConflict({ sha256: res.sha256, mtime: res.mtime })
      } else {
        setSaveError(res.message)
      }
    } catch (err) {
      setSaveError(String(err))
    } finally {
      setSaving(false)
    }
  }, [draft, file.filePath, onSaved])

  const reloadFromDisk = useCallback(async () => {
    // Discarding the draft is the whole point of this button, so say so first.
    if (!window.confirm(t('memory.editor.reloadConfirm'))) return
    const outcome = await loadRaw()
    if (!outcome || !outcome.ok) return
    // loadRaw stored the new bytes; adopt them as the draft so the editor
    // continues from what is actually on disk.
    setDraft(outcome.content)
    setBaseline(outcome.content)
    setConflict(null)
    setSaveError(null)
    setEditing(true)
  }, [loadRaw, t])

  const typeColor = MEMDIR_TYPE_COLORS[file.type] || MEMDIR_TYPE_COLORS.unknown
  const ageDays = file.mtime > 0 ? (Date.now() - file.mtime) / 86400000 : 0
  const decayDot =
    ageDays < 7  ? '#4ade80' :
    ageDays < 30 ? '#fbbf24' :
    ageDays < 90 ? '#fb923c' : '#f87171'
  const decayLabelKey =
    ageDays < 7  ? 'memory.fresh' :
    ageDays < 30 ? 'memory.aging' :
    ageDays < 90 ? 'memory.old'  : 'memory.stale'
  const ageDaysRounded = Math.floor(ageDays)
  const ageLabel = file.mtime > 0
    ? (ageDaysRounded < 1 ? t('memory.justNow') : `${ageDaysRounded}d ago`)
    : ''

  const blockReason = memorySaveBlockReason(draft, baseline, saving)
  const draftBytes = utf8ByteLength(draft)
  const saveDisabled = !!blockReason || !!conflict
  // A conflict disables Save too, but its own box below already says why;
  // repeating the sentence here would read as two different problems.
  const saveBlockedText =
    blockReason === 'saving' ? t('memory.editor.saveBlocked.saving')
    : blockReason === 'unchanged' ? t('memory.editor.saveBlocked.unchanged')
    : blockReason === 'too_large'
      ? t('memory.editor.saveBlocked.tooLarge', { size: draftBytes, max: MAX_MEMORY_EDITOR_BYTES })
    : null

  const readFailureText =
    readError?.code === 'not_found' ? t('memory.editor.notFound')
    : readError?.code === 'too_large' ? t('memory.editor.tooLargeRead')
    : readError?.code === 'outside_roots' ? t('memory.editor.outsideRoots')
    : readError ? t('memory.editor.readFailed', { message: readError.message })
    : null

  return (
    <div data-memdir-file={encodeURIComponent(file.filePath)} style={{
      background: 'var(--bg-primary)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)', borderLeft: `3px solid ${typeColor}`, borderRadius: 10, marginBottom: 6,
      overflow: 'hidden', transition: 'all 0.15s ease',
    }}>
      {/* File header row */}
      <div
        onClick={handleToggle}
        style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: typeColor, flexShrink: 0, boxShadow: `0 0 6px ${typeColor}80` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </div>
          {file.description && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.description}
            </div>
          )}
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-primary)', background: `${typeColor}1e`, borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>
          {file.type}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--border)', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>
          {file.scope === 'global' ? t('memory.memdirGlobal') : t('memory.memdirProject')}
        </span>
        {file.mtime > 0 && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 9, fontWeight: 600,
            color: 'var(--text-primary)',
            background: `${decayDot}18`,
            border: `1px solid ${decayDot}44`,
            borderRadius: 8, padding: '1px 5px', flexShrink: 0,
          }}
          title={ageLabel}
          >
            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: decayDot, flexShrink: 0 }} />
            {t(decayLabelKey)}
          </span>
        )}
        {dirty && !expanded && (
          <span style={{ fontSize: 9, color: 'var(--warning-text)', flexShrink: 0 }}>{t('memory.editor.dirty')}</span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>{'▾'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '0 12px 10px', borderTop: '1px solid var(--border)' }}>
          {editing ? (
            <div style={{ marginTop: 8 }}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                spellCheck={false}
                style={{
                  width: '100%', minHeight: 180, padding: '8px 10px',
                  background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6,
                  fontSize: 11, lineHeight: 1.6, color: 'var(--text-primary)',
                  fontFamily: 'monospace', resize: 'vertical', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {t(draft.length === 1 ? 'memory.editor.charCount_one' : 'memory.editor.charCount_other', { count: draft.length })}
                  {' · '}
                  {draftBytes}{' / '}{MAX_MEMORY_EDITOR_BYTES} B
                </span>
                {dirty && (
                  <span style={{ fontSize: 10, color: 'var(--warning-text)' }}>{t('memory.editor.dirty')}</span>
                )}
                <span style={{ flex: 1 }} />
                <button
                  onClick={cancelEdit}
                  style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8,
                    padding: '5px 12px', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  {t('memory.cancel')}
                </button>
                <button
                  onClick={() => { void save(sha ?? undefined) }}
                  disabled={saveDisabled}
                  style={{
                    background: saveDisabled ? 'var(--bg-hover)' : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                    border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 600,
                    color: saveDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
                    cursor: saveDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {t('memory.save')}
                </button>
              </div>
              {saveBlockedText && (
                <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-muted)' }}>{saveBlockedText}</div>
              )}
              {saveError && (
                <div style={{ marginTop: 5, fontSize: 10, color: 'var(--danger-text)' }}>
                  {t('memory.editor.saveFailed', { message: saveError })}
                </div>
              )}
              {conflict && (
                <div style={{
                  marginTop: 8, padding: '8px 10px', borderRadius: 6,
                  border: '1px solid rgba(251,191,36,0.45)', background: 'rgba(251,191,36,0.08)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                    {t('memory.editor.changedOnDisk')}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {conflict.sha256
                      ? t('memory.editor.currentSha', { sha: conflict.sha256.slice(0, 12) })
                      : t('memory.editor.goneOnDisk')}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button
                      onClick={() => { void reloadFromDisk() }}
                      style={{
                        background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '5px 12px', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer',
                      }}
                    >
                      {t('memory.editor.reload')}
                    </button>
                    <button
                      onClick={() => { void save(undefined) }}
                      disabled={saving}
                      style={{
                        background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.45)',
                        borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 600,
                        color: 'var(--danger-text)', cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {t('memory.editor.overwrite')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <pre style={{
                margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.6,
                color: 'var(--text-secondary)', fontFamily: 'monospace',
                background: 'var(--bg-hover)', borderRadius: 6, padding: '8px 10px',
                border: '1px solid var(--border)',
              }}>
                {query && file.content
                  ? <HighlightedText text={file.content} ranges={findHighlightRanges(file.content, query)} />
                  : (file.content || <span style={{ color: 'var(--text-muted)' }}>(empty)</span>)}
              </pre>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {file.filePath}
                </span>
                {readLoading && (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />
                    {t('memory.editor.loading')}
                  </span>
                )}
                <button
                  onClick={beginEdit}
                  disabled={readLoading || !!readError}
                  style={{
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    padding: '4px 10px', fontSize: 10,
                    color: readLoading || readError ? 'var(--text-muted)' : 'var(--text-secondary)',
                    cursor: readLoading || readError ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {t('memory.edit')}
                </button>
              </div>
              {readFailureText && (
                <div style={{ marginTop: 4, fontSize: 10, color: 'var(--danger-text)' }}>{readFailureText}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
