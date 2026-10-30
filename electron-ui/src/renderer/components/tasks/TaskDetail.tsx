// The task detail view: header (title/status/department/folder/archive),
// materials rail, a conversation area reserved for increment 2, and the
// append-only history timeline.
//
// This file never starts a conversation and never writes `prefs.workingDir`.
// "Dispatch" is increment 2; the centre pane says so instead of pretending a
// button exists.
import React, { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Building2,
  Clock,
  FileText,
  FolderOpen,
  History,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type { TaskRecordData, TaskStatusData } from '../../../preload'
import { useTaskStore, useUiStore } from '../../store'
import { useI18n, useT } from '../../i18n'
import { pushEscapeHandler } from '../ui/escapeStack'
import {
  EDITABLE_STATUSES,
  formatBytes,
  formatTaskTime,
  statusColor,
  statusLabelKey,
} from './taskUi'

interface TaskDetailProps {
  task: TaskRecordData
  onBack: () => void
  onRequestDelete: (task: TaskRecordData) => void
}

const ICON_BUTTON: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 4, height: 26, padding: '0 8px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-hover)',
  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500,
  cursor: 'pointer', flexShrink: 0,
}

const RAIL_HEADING: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
}

export default function TaskDetail({ task, onBack, onRequestDelete }: TaskDetailProps) {
  const t = useT()
  const { resolvedLocale } = useI18n()
  const addToast = useUiStore(s => s.addToast)
  const updateTask = useTaskStore(s => s.updateTask)
  const archiveTask = useTaskStore(s => s.archiveTask)
  const restoreTask = useTaskStore(s => s.restoreTask)
  const addMaterials = useTaskStore(s => s.addMaterials)
  const removeMaterial = useTaskStore(s => s.removeMaterial)
  const revealTask = useTaskStore(s => s.revealTask)

  const [titleDraft, setTitleDraft] = useState(task.title)
  const [titleFocused, setTitleFocused] = useState(false)
  const [savingTitle, setSavingTitle] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const pasteRef = useRef<HTMLInputElement>(null)

  // A store refresh (another window, or our own mutation) is authoritative.
  useEffect(() => { setTitleDraft(task.title) }, [task.id, task.title])

  useEffect(() => {
    if (!pasteOpen) return
    pasteRef.current?.focus()
  }, [pasteOpen])

  // The view-level Escape handler in AppShell runs first (capture phase); a
  // focused inline editor registers itself as the innermost layer so Escape
  // reverts the edit instead of leaving the task list.
  useEffect(() => {
    if (!titleFocused) return
    return pushEscapeHandler(() => {
      setTitleDraft(task.title)
      setTitleFocused(false)
      titleRef.current?.blur()
    })
  }, [titleFocused, task.title])

  useEffect(() => {
    if (!pasteOpen) return
    return pushEscapeHandler(() => {
      setPasteOpen(false)
      setPasteText('')
    })
  }, [pasteOpen])

  const commitTitle = async () => {
    const next = titleDraft.trim()
    if (!next || next === task.title) {
      setTitleDraft(task.title)
      return
    }
    setSavingTitle(true)
    const result = await updateTask(task.id, { title: next })
    setSavingTitle(false)
    if (!result.ok) {
      addToast('error', t('tasks.error.update'))
      setTitleDraft(task.title)
    }
  }

  const setStatus = async (status: TaskStatusData) => {
    if (status === task.status) return
    const result = await updateTask(task.id, { status })
    if (!result.ok) addToast('error', t('tasks.error.update'))
  }

  const importPaths = async (paths: string[], source: 'picker' | 'drop' | 'paste') => {
    if (paths.length === 0) return
    setImporting(true)
    const result = await addMaterials(task.id, paths, source)
    setImporting(false)
    if (!result.ok) {
      addToast('error', result.error || t('tasks.error.materials'))
      return
    }
    if (result.added && result.added.length > 0) {
      addToast('success', t('tasks.materialsAdded', { count: result.added.length }))
    }
    if (result.errors && result.errors.length > 0) {
      const first = result.errors[0]
      addToast('warning', t('tasks.materialFailed', {
        name: first.path.split(/[\\/]/).pop() || first.path,
        error: first.error,
      }))
    }
    if (source === 'paste' && result.added && result.added.length > 0) {
      setPasteText('')
      setPasteOpen(false)
    }
  }

  const pickFiles = async () => {
    try {
      const paths = await window.electronAPI.fsShowOpenFileDialog(undefined, true)
      await importPaths(Array.isArray(paths) ? paths : [], 'picker')
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : t('tasks.error.materials'))
    }
  }

  const submitPaste = async () => {
    const paths = pasteText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    if (paths.length === 0) return
    await importPaths(paths, 'paste')
  }

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)
    const paths = Array.from(event.dataTransfer.files)
      .map(file => {
        // Electron 32 removed `File.path`; the preload exposes webUtils.
        try {
          return window.electronAPI.getPathForFile(file)
        } catch {
          return (file as File & { path?: string }).path ?? ''
        }
      })
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
    if (paths.length === 0) {
      addToast('warning', t('tasks.dropNoPaths'))
      return
    }
    await importPaths(paths, 'drop')
  }

  const archive = async () => {
    const result = await archiveTask(task.id)
    if (!result.ok) addToast('error', t('tasks.error.archive'))
  }

  const restore = async () => {
    const result = await restoreTask(task.id)
    if (!result.ok) addToast('error', t('tasks.error.restore'))
  }

  const reveal = async () => {
    const result = await revealTask(task.id)
    if (!result.ok) addToast('error', t('tasks.error.reveal'))
  }

  const confirmRemove = async (materialId: string) => {
    const result = await removeMaterial(task.id, materialId)
    setPendingRemove(null)
    if (!result.ok) addToast('error', t('tasks.error.removeMaterial'))
  }

  const archived = task.status === 'archived'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        minHeight: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--popup-bg)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      }}>
        <button
          type="button"
          onClick={onBack}
          title={t('tasks.back')}
          aria-label={t('tasks.back')}
          style={{ ...ICON_BUTTON, width: 28, padding: 0 }}
        >
          <ArrowLeft size={14} />
        </button>

        <input
          ref={titleRef}
          value={titleDraft}
          onChange={e => setTitleDraft(e.target.value)}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => { setTitleFocused(false); void commitTitle() }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); titleRef.current?.blur() }
          }}
          aria-label={t('tasks.titleLabel')}
          disabled={savingTitle}
          style={{
            minWidth: 120, flex: '1 1 220px', maxWidth: 520, height: 28,
            border: '1px solid transparent',
            borderRadius: 7, padding: '0 6px', boxSizing: 'border-box',
            color: 'var(--text-primary)', fontSize: 14, fontWeight: 700,
            outline: 'none',
            borderColor: titleFocused ? 'var(--accent-border)' : 'transparent',
            background: titleFocused ? 'var(--bg-input)' : 'transparent',
          }}
        />

        <select
          value={archived ? 'archived' : task.status}
          onChange={e => { void setStatus(e.target.value as TaskStatusData) }}
          disabled={archived}
          aria-label={t('tasks.status')}
          style={{
            height: 26, borderRadius: 8, padding: '0 8px', fontSize: 11, fontWeight: 600,
            color: statusColor(task.status),
            border: '1px solid var(--border)', background: 'var(--bg-hover)',
            cursor: archived ? 'default' : 'pointer', flexShrink: 0,
          }}
        >
          {archived && <option value="archived">{t('tasks.statusLabel.archived')}</option>}
          {EDITABLE_STATUSES.map(status => (
            <option key={status} value={status}>{t(statusLabelKey(status))}</option>
          ))}
        </select>

        {/* Department is a processor choice, not part of increment 1. The chip
            is present so the header has its final shape, and disabled so it
            cannot imply routing that does not exist yet. */}
        <span
          title={t('tasks.departmentLater')}
          aria-disabled="true"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, height: 26,
            padding: '0 8px', borderRadius: 8, flexShrink: 0,
            border: '1px dashed var(--border)', background: 'transparent',
            color: 'var(--text-muted)', fontSize: 11, opacity: 0.8,
          }}
        >
          <Building2 size={12} />
          {task.departmentId
            ? task.departmentId
            : t('tasks.departmentUnassigned')}
        </span>

        <span style={{ flex: 1 }} />

        <button
          type="button"
          onClick={reveal}
          title={t('tasks.reveal')}
          aria-label={t('tasks.reveal')}
          style={ICON_BUTTON}
        >
          <FolderOpen size={13} />
          {t('tasks.reveal')}
        </button>

        {archived ? (
          <button type="button" onClick={restore} title={t('tasks.restore')} aria-label={t('tasks.restore')} style={ICON_BUTTON}>
            <RotateCcw size={13} />
            {t('tasks.restore')}
          </button>
        ) : (
          <button type="button" onClick={archive} title={t('tasks.archive')} aria-label={t('tasks.archive')} style={ICON_BUTTON}>
            <Archive size={13} />
            {t('tasks.archive')}
          </button>
        )}

        <button
          type="button"
          onClick={() => onRequestDelete(task)}
          title={t('tasks.delete')}
          aria-label={t('tasks.delete')}
          style={{ ...ICON_BUTTON, color: 'var(--error)' }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {task.missing && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          padding: '8px 16px', background: 'rgba(251,191,36,0.08)',
          borderBottom: '1px solid rgba(251,191,36,0.25)', color: 'var(--warning)',
          fontSize: 11,
        }}>
          <AlertTriangle size={13} />
          <span>{t('tasks.missingHint', { path: task.directory })}</span>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Materials rail */}
        <aside
          onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
          onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
          onDragLeave={e => {
            e.preventDefault()
            e.stopPropagation()
            if (e.currentTarget === e.target) setDragOver(false)
          }}
          onDrop={handleDrop}
          style={{
            width: 272, flexShrink: 0, display: 'flex', flexDirection: 'column',
            background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)',
            position: 'relative', minHeight: 0,
          }}
        >
          <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={RAIL_HEADING}>
              <Paperclip size={12} />
              {t('tasks.materials')}
              <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>
                {task.materials.length}
              </span>
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={pickFiles}
              disabled={importing || task.missing}
              title={t('tasks.addMaterials')}
              aria-label={t('tasks.addMaterials')}
              style={{ ...ICON_BUTTON, height: 24, padding: '0 7px', opacity: importing || task.missing ? 0.5 : 1 }}
            >
              <Plus size={12} />
            </button>
            <button
              type="button"
              onClick={() => setPasteOpen(open => !open)}
              disabled={task.missing}
              title={t('tasks.pastePath')}
              aria-label={t('tasks.pastePath')}
              style={{ ...ICON_BUTTON, height: 24, padding: '0 7px', opacity: task.missing ? 0.5 : 1 }}
            >
              <Upload size={12} />
            </button>
          </div>

          {pasteOpen && (
            <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <input
                ref={pasteRef}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); void submitPaste() }
                }}
                placeholder={t('tasks.pastePathPlaceholder')}
                aria-label={t('tasks.pastePath')}
                style={{
                  height: 26, boxSizing: 'border-box', padding: '0 8px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg-input)',
                  color: 'var(--text-primary)', fontSize: 11, outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)' }}>
                  {t('tasks.pastePathHint')}
                </span>
                <button
                  type="button"
                  onClick={submitPaste}
                  disabled={importing || pasteText.trim().length === 0}
                  style={{ ...ICON_BUTTON, height: 22, padding: '0 8px', opacity: importing || !pasteText.trim() ? 0.5 : 1 }}
                >
                  {t('tasks.add')}
                </button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 10px' }}>
            {task.materials.length === 0 ? (
              <div style={{
                margin: '6px 4px', padding: '14px 10px', borderRadius: 9,
                border: '1px dashed var(--border)', color: 'var(--text-muted)',
                fontSize: 11, lineHeight: 1.5, textAlign: 'center',
              }}>
                {task.missing ? t('tasks.error.missing') : t('tasks.materialsEmpty')}
              </div>
            ) : (
              task.materials.map(material => (
                <div
                  key={material.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 6px', borderRadius: 7, minWidth: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <FileText size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div title={material.name} style={{
                      fontSize: 11, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {material.name}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-subtle)' }}>
                      {formatBytes(material.size)}
                    </div>
                  </div>
                  {pendingRemove === material.id ? (
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => { void confirmRemove(material.id) }}
                        title={t('tasks.remove')}
                        style={{ ...ICON_BUTTON, height: 20, padding: '0 5px', color: 'var(--error)' }}
                      >
                        {t('tasks.remove')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingRemove(null)}
                        title={t('tasks.cancel')}
                        style={{ ...ICON_BUTTON, height: 20, padding: '0 5px' }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingRemove(material.id)}
                      disabled={task.missing}
                      title={t('tasks.removeMaterial')}
                      aria-label={t('tasks.removeMaterial')}
                      style={{
                        ...ICON_BUTTON, width: 20, height: 20, padding: 0,
                        border: 'none', background: 'transparent',
                        opacity: task.missing ? 0.4 : 1,
                      }}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {dragOver && (
            <div style={{
              position: 'absolute', inset: 6, borderRadius: 10,
              border: '1px dashed var(--accent)', background: 'var(--accent-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: 16, color: 'var(--accent-text)',
              fontSize: 11, fontWeight: 600, pointerEvents: 'none',
            }}>
              {t('tasks.dropHere')}
            </div>
          )}
        </aside>

        {/* Conversation area — intentionally empty in increment 1. */}
        <section style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 24,
          background: 'var(--bg-chat)',
        }}>
          <div style={{
            width: '100%', maxWidth: 460, padding: '26px 24px', borderRadius: 14,
            border: '1px dashed var(--border)', background: 'var(--bg-secondary)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
            textAlign: 'center',
          }}>
            <span style={{
              width: 34, height: 34, borderRadius: 10, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
            }}>
              <MessageSquare size={16} color="var(--accent-text)" />
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('tasks.conversation')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {t('tasks.conversationEmpty')}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--text-subtle)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '2px 6px',
            }}>
              {t('tasks.conversationReserved')}
            </span>
            <span title={task.directory} style={{
              marginTop: 2, fontSize: 10, color: 'var(--text-subtle)',
              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', direction: 'rtl',
            }}>
              {task.directory}
            </span>
          </div>
        </section>

        {/* History timeline */}
        <aside style={{
          width: 236, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-sidebar)', borderLeft: '1px solid var(--border)',
          minHeight: 0,
        }}>
          <div style={{ padding: '12px 12px 8px' }}>
            <span style={RAIL_HEADING}>
              <History size={12} />
              {t('tasks.history')}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
            {task.history.length === 0 ? (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 2px' }}>
                {t('tasks.historyEmpty')}
              </div>
            ) : (
              task.history.slice().reverse().map((event, index) => (
                <div key={`${event.at}-${index}`} style={{
                  display: 'flex', gap: 7, padding: '5px 0',
                  borderBottom: index === task.history.length - 1 ? 'none' : '1px solid var(--border)',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                    background: event.kind === 'folder_missing' ? 'var(--warning)' : 'var(--accent)',
                  }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      {t(`tasks.event.${event.kind}`)}
                    </div>
                    {event.detail && (
                      <div title={event.detail} style={{
                        fontSize: 9, color: 'var(--text-subtle)', marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {event.detail}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2, fontSize: 9, color: 'var(--text-subtle)' }}>
                      <Clock size={8} />
                      {formatTaskTime(event.at, resolvedLocale)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
