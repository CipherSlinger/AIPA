// DeptTemplatePicker — the dialog that turns "I have an empty org chart" into a
// working company structure in one step.
//
// It is deliberately the *only* place that seeds departments: the empty org
// chart, the "new department" panel and the sidebar form all open this same
// dialog, so there is one code path that writes folders and one place to explain
// what is about to happen on disk.

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
  Megaphone,
  PenLine,
  Sparkles,
  ShoppingCart,
  SquareDashed,
  type LucideIcon,
} from 'lucide-react'
import { useSessionStore } from '../../store'
import { useI18n } from '../../i18n'
import { joinPath } from './deptUtils'
import {
  DEPT_PRESETS,
  PRESET_BASE_DIR_NAME,
  applyPreset,
  existingDirsPreview,
  importExistingDirs,
  markDeptSetupChosen,
  pendingPresetDepartments,
} from './deptPresets'

const DOMAIN_ICONS: Record<string, LucideIcon> = {
  software: Code,
  content: PenLine,
  marketing: Megaphone,
  research: FlaskConical,
  ecommerce: ShoppingCart,
  personal: Sparkles,
}

type Choice = { kind: 'preset'; id: string } | { kind: 'import' } | { kind: 'blank' }

interface DeptTemplatePickerProps {
  onClose: () => void
  /** Fired once folders are on disk; `created` is how many departments landed. */
  onApplied: (created: number) => void
  /** Pre-select a domain — lets a card in the empty state open straight onto it. */
  initialPresetId?: string
}

export default function DeptTemplatePicker({ onClose, onApplied, initialPresetId }: DeptTemplatePickerProps) {
  const { t, resolvedLocale } = useI18n()
  const sessions = useSessionStore(s => s.sessions)
  const homeDir = useSessionStore(s => s.homeDir)

  const [choice, setChoice] = useState<Choice>(() => ({
    kind: 'preset',
    id: DEPT_PRESETS.some(p => p.id === initialPresetId) ? initialPresetId! : DEPT_PRESETS[0].id,
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

  const preset = choice.kind === 'preset' ? DEPT_PRESETS.find(p => p.id === choice.id) ?? null : null
  const existingDirs = useMemo(() => existingDirsPreview(sessions, homeDir), [sessions, homeDir])

  // What the primary button is about to create, shown before it is clicked.
  // Departments that already exist at this path are excluded — the preview must
  // not promise work that will be skipped.
  const preview: Array<{ name: string; color: string }> = useMemo(() => {
    if (preset) return pendingPresetDepartments(preset, resolvedLocale, baseDir)
    if (choice.kind === 'import') return existingDirs.map(d => ({ name: d.name, color: '#6366f1' }))
    return []
  }, [preset, choice.kind, existingDirs, resolvedLocale, baseDir])
  const disabled = preview.length === 0 && choice.kind !== 'blank' && !busy

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

    if (!preset) return
    if (!baseDir.trim()) { setError(t('dept.presets.baseDirRequired')); return }

    setBusy(true)
    try {
      const result = await applyPreset(preset, baseDir.trim(), resolvedLocale)
      // Zero created with zero failures means every folder was already a
      // department — nothing went wrong, there was just nothing left to do.
      if (result.created === 0 && result.failed.length > 0) {
        setFailed(result.failed)
        setError(t('dept.presets.allFailed'))
        setBusy(false)
        return
      }
      onApplied(result.created)
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {DEPT_PRESETS.map(p => {
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
          {preview.length > 0 && (
            <div style={{
              border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px',
              background: 'var(--bg-hover)', display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {t('dept.presets.willCreate', { count: String(preview.length) })}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {preview.map(d => (
                  <span key={d.name} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 9px', borderRadius: 999,
                    border: '1px solid var(--border)', background: 'var(--bg-primary)',
                    fontSize: 11, color: 'var(--text-secondary)',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                    {d.name}
                  </span>
                ))}
              </div>
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
              : t('dept.presets.create', { count: String(preview.length) })}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
