// DeptTemplatePicker — the dialog that turns "I have an empty org chart" into a
// whole company in one step.
//
// It is deliberately the *only* place that seeds an org tree: the empty org
// chart, the "new department" panel and the sidebar form all open this same
// dialog, so there is one code path that writes folders and one place to explain
// what is about to happen on disk.
//
// A template creates the company → department → team folders and hangs ghost
// positions on them. Nothing is sent to a model here: a position is a title plus
// a brief, and it only costs anything when the user hires it.

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Building2,
  Check,
  Code,
  FlaskConical,
  FolderInput,
  FolderOpen,
  Loader2,
  PenLine,
  ShoppingCart,
  SquareDashed,
  type LucideIcon,
} from 'lucide-react'
import { useSessionStore } from '../../store'
import { useI18n } from '../../i18n'
import { joinPath } from './deptUtils'
import {
  COMPANY_TEMPLATES,
  PRESET_BASE_DIR_NAME,
  applyTemplate,
  existingDirsPreview,
  importExistingDirs,
  markDeptSetupChosen,
  previewTemplate,
  type PreviewNode,
} from './deptPresets'

const DOMAIN_ICONS: Record<string, LucideIcon> = {
  software: Code,
  content: PenLine,
  ecommerce: ShoppingCart,
  research: FlaskConical,
}

type Choice = { kind: 'preset'; id: string } | { kind: 'import' } | { kind: 'blank' }

interface DeptTemplatePickerProps {
  onClose: () => void
  /** Fired once folders are on disk; `created` is how many departments landed. */
  onApplied: (created: number) => void
  /** Pre-select a company type — lets a card in the empty state open straight onto it. */
  initialPresetId?: string
}

export default function DeptTemplatePicker({ onClose, onApplied, initialPresetId }: DeptTemplatePickerProps) {
  const { t, resolvedLocale } = useI18n()
  const sessions = useSessionStore(s => s.sessions)
  const homeDir = useSessionStore(s => s.homeDir)

  const [choice, setChoice] = useState<Choice>(() => ({
    kind: 'preset',
    id: COMPANY_TEMPLATES.some(p => p.id === initialPresetId) ? initialPresetId! : COMPANY_TEMPLATES[0].id,
  }))
  const [baseDir, setBaseDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Default the root folder to ~/AIPA, where ensureDir is definitely allowed.
  useEffect(() => {
    let alive = true
    window.electronAPI.fsGetHome().then((home: string) => {
      if (!alive) return
      setBaseDir(home ? joinPath(home, PRESET_BASE_DIR_NAME) : '')
    }).catch(() => { /* no home dir — user picks one */ })
    return () => { alive = false }
  }, [])

  const tpl = choice.kind === 'preset' ? COMPANY_TEMPLATES.find(p => p.id === choice.id) ?? null : null
  const existingDirs = useMemo(() => existingDirsPreview(sessions, homeDir), [sessions, homeDir])

  // What the primary button is about to create. Nodes whose folder already
  // exists are kept but not counted, so the preview never promises work that
  // will be skipped.
  const preview = useMemo(
    () => (tpl ? previewTemplate(tpl, resolvedLocale, baseDir) : null),
    [tpl, resolvedLocale, baseDir],
  )
  const counts = preview?.counts
  const willCreate = counts ? counts.departments + counts.teams : 0
  /** How many departments the primary button is promising to register. */
  const createCount = choice.kind === 'import' ? existingDirs.length : willCreate
  const disabled = busy
    || (choice.kind === 'preset' && willCreate === 0)
    || (choice.kind === 'import' && existingDirs.length === 0)

  const browse = async () => {
    const picked = await window.electronAPI.fsShowOpenDialog()
    if (picked) setBaseDir(picked)
  }

  const apply = async () => {
    if (busy) return
    setFailed([])
    setError(null)

    if (choice.kind === 'blank') {
      // Nothing to create; the flag just stops the picker reappearing.
      markDeptSetupChosen()
      onApplied(0)
      return
    }

    if (choice.kind === 'import') {
      onApplied(importExistingDirs(sessions, homeDir))
      return
    }

    if (!tpl) return
    if (!baseDir.trim()) { setError(t('dept.presets.baseDirRequired')); return }

    setBusy(true)
    try {
      const result = await applyTemplate(tpl, baseDir.trim(), resolvedLocale)
      // Zero created with failures means nothing landed; zero created with no
      // failures means every folder was already a node — nothing went wrong.
      if (result.departments === 0 && result.teams === 0 && result.failed.length > 0) {
        setFailed(result.failed)
        setError(t('dept.presets.allFailed'))
        setBusy(false)
        return
      }
      onApplied(result.departments)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const card = (active: boolean, onClick: () => void, key: string, icon: React.ReactNode, title: string, desc: string) => (
    <button
      key={key}
      onClick={onClick}
      style={{
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '9px 11px',
        borderRadius: 10,
        border: `1px solid ${active ? 'rgba(99,102,241,0.55)' : 'var(--border)'}`,
        background: active ? 'rgba(99,102,241,0.1)' : 'var(--bg-hover)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: active ? '#818cf8' : 'var(--text-secondary)' }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 700 }}>{title}</span>
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</span>
      {active && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          width: 14, height: 14, borderRadius: '50%',
          background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check size={9} color="#fff" />
        </span>
      )}
    </button>
  )

  // One row of the structure preview. Existing nodes stay visible but dimmed —
  // the user needs to see that the tree is understood, not that it is missing.
  const previewRow = (node: PreviewNode, depth: number): React.ReactNode => (
    <React.Fragment key={`${depth}-${node.name}`}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        paddingLeft: depth * 14,
        opacity: node.exists ? 0.42 : 1,
        fontSize: 11.5,
        color: node.kind === 'company' ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: node.kind === 'company' ? 700 : 500,
        lineHeight: 1.9,
      }}>
        {node.kind === 'team'
          ? <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>└</span>
          : <span style={{ width: 6, height: 6, borderRadius: '50%', background: node.color, flexShrink: 0 }} />}
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        {node.positionCount > 0 && (
          <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-muted)' }}>
            {t('dept.presets.positionsSuffix', { count: String(node.positionCount) })}
          </span>
        )}
        {node.exists && (
          <span style={{ flexShrink: 0, fontSize: 9.5, color: 'var(--text-faint)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 5px' }}>
            {t('dept.presets.existsTag')}
          </span>
        )}
      </div>
      {node.children.map(child => previewRow(child, depth + 1))}
    </React.Fragment>
  )

  const dialog = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--glass-overlay)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.15s ease',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div style={{
        background: 'var(--popup-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
        width: 580, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 64px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'slideUp 0.15s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--bg-hover)', flexShrink: 0 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.28)',
          }}>
            <Building2 size={15} color="#818cf8" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {t('dept.presets.title')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('dept.presets.subtitle')}</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {COMPANY_TEMPLATES.map(p => {
              const Icon = DOMAIN_ICONS[p.id] || Building2
              const active = choice.kind === 'preset' && choice.id === p.id
              return card(
                active,
                () => { setChoice({ kind: 'preset', id: p.id }); setFailed([]); setError(null) },
                p.id,
                <Icon size={13} />,
                t(p.labelKey),
                t(p.descKey),
              )
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: existingDirs.length > 0 ? 'repeat(2, 1fr)' : '1fr', gap: 8 }}>
            {existingDirs.length > 0 && card(
              choice.kind === 'import',
              () => { setChoice({ kind: 'import' }); setFailed([]); setError(null) },
              'import',
              <FolderInput size={13} />,
              t('dept.presets.importExisting'),
              t('dept.presets.importExistingDesc', { count: String(existingDirs.length) }),
            )}
            {card(
              choice.kind === 'blank',
              () => { setChoice({ kind: 'blank' }); setFailed([]); setError(null) },
              'blank',
              <SquareDashed size={13} />,
              t('dept.presets.blank'),
              t('dept.presets.blankDesc'),
            )}
          </div>

          {/* What is about to be created */}
          {preview && (
            <div style={{
              border: '1px solid var(--border)', borderRadius: 10,
              background: 'var(--bg-hover)', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                color: 'var(--text-muted)', padding: '9px 12px 6px',
              }}>
                {t('dept.presets.previewTitle')}
              </span>
              {/* Only the tree scrolls. The title and the totals stay pinned: a
                  nine-department company is far taller than this box, and the
                  totals are the one line the dialog exists to communicate. */}
              <div style={{
                maxHeight: 196, overflowY: 'auto', padding: '0 12px',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                {previewRow(preview.root, 0)}
              </div>
              <span style={{
                fontSize: 10.5, color: 'var(--text-muted)',
                padding: '7px 12px 9px', borderTop: '1px solid var(--border)',
              }}>
                {counts && (counts.departments + counts.teams > 0
                  ? t('dept.presets.totals', {
                    depts: String(counts.departments),
                    teams: String(counts.teams),
                    positions: String(counts.positions),
                  })
                  : t('dept.presets.allExist'))}
              </span>
            </div>
          )}

          {/* Import preview — no tree, just the folders that would be adopted */}
          {choice.kind === 'import' && existingDirs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {existingDirs.map(d => (
                <span key={d.directory} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px', borderRadius: 999,
                  border: '1px solid var(--border)', background: 'var(--bg-primary)',
                  fontSize: 11, color: 'var(--text-secondary)',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                  {d.name}
                </span>
              ))}
            </div>
          )}

          {/* Root folder — only meaningful when we are the ones creating folders */}
          {choice.kind === 'preset' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {t('dept.presets.baseDirLabel')}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={baseDir}
                  onChange={e => setBaseDir(e.target.value)}
                  placeholder={t('dept.presets.baseDirPlaceholder')}
                  style={{
                    flex: 1, minWidth: 0, boxSizing: 'border-box',
                    padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                  }}
                />
                <button
                  onClick={browse}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  <FolderOpen size={12} />
                  {t('dept.presets.browse')}
                </button>
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
                {t('dept.presets.baseDirHint')}
              </span>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: '#f87171', lineHeight: 1.5 }}>
              <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </div>
          )}
          {failed.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {t('dept.presets.failed', { names: failed.join(resolvedLocale === 'zh-CN' ? '、' : ', ') })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          padding: '12px 20px', borderTop: '1px solid var(--bg-hover)',
        }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'var(--bg-hover)', border: '1px solid var(--bg-active)', borderRadius: 8,
              padding: '7px 16px', fontSize: 13, color: 'var(--text-secondary)',
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => void apply()}
            disabled={busy || disabled}
            title={disabled ? t('dept.presets.allExist') : undefined}
            style={{
              background: disabled
                ? 'rgba(99,102,241,0.25)'
                : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13,
              color: disabled ? 'var(--text-muted)' : 'rgba(255,255,255,0.95)', fontWeight: 600,
              cursor: busy || disabled ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: disabled ? 'none' : '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
            }}
          >
            {busy && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
            {busy
              ? t('dept.presets.creating')
              : choice.kind === 'blank' ? t('dept.presets.blank')
              : disabled ? t('dept.presets.allExist')
              : t('dept.presets.create', { count: String(createCount) })}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
