// Preview and edit a SKILL.md derived from the current conversation.
// Installs through skillsInstall — the same channel the skill creator page
// uses — so permissions, storage location and listing behave identically.

import React, { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Puzzle } from 'lucide-react'
import { useT } from '../../i18n'
import { useChatStore, useUiStore } from '../../store'
import {
  MAX_SKILL_STEPS,
  assembleSkillContent,
  buildSkillDraft,
  skillInstallSlug,
} from '../../lib/sessionReuse'
import SessionReuseDialogShell from './SessionReuseDialogShell'

interface Props {
  sessionTitle: string | null
  onClose: () => void
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 6,
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 12,
  background: 'var(--bg-hover)',
  border: '1px solid var(--bg-active)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s ease',
}

const monoStyle: React.CSSProperties = {
  ...fieldStyle,
  padding: '10px 12px',
  fontSize: 11,
  lineHeight: 1.55,
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
  background: 'var(--bg-primary)',
  color: '#a5b4fc',
}

export default function SaveConversationSkillDialog({ sessionTitle, onClose }: Props) {
  const t = useT()
  const messages = useChatStore(s => s.messages)
  const addToast = useUiStore(s => s.addToast)
  const draft = useMemo(
    () => buildSkillDraft(messages, sessionTitle, t),
    [messages, sessionTitle, t],
  )
  const [name, setName] = useState(draft.name)
  const [description, setDescription] = useState(draft.description)
  const [body, setBody] = useState(draft.body)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')

  // One normalizer for the preview, the installed directory and the SKILL.md
  // `name:` — the dialog must not advertise a path the installer will not create.
  const installSlug = skillInstallSlug(name)
  const content = assembleSkillContent(installSlug, description, body)
  const empty = draft.totalTurns === 0
  const canInstall = !empty && !!name.trim() && !!description.trim() && !!body.trim() && !installing

  const handleInstall = useCallback(async () => {
    if (!name.trim()) {
      addToast('warning', t('sessionReuse.skill.missingName'))
      return
    }
    if (!description.trim()) {
      addToast('warning', t('sessionReuse.skill.missingDescription'))
      return
    }
    if (!body.trim()) {
      addToast('warning', t('sessionReuse.skill.missingBody'))
      return
    }
    setInstalling(true)
    setError('')
    try {
      const result = await window.electronAPI.skillsInstall({
        name: installSlug,
        content: assembleSkillContent(installSlug, description, body),
      })
      if (result?.success) {
        addToast('success', t('sessionReuse.skill.installed', { name: installSlug }))
        onClose()
      } else {
        setError(result?.error || t('sessionReuse.skill.failed'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setInstalling(false)
    }
  }, [name, installSlug, description, body, addToast, t, onClose])

  return (
    <SessionReuseDialogShell
      title={t('sessionReuse.skill.title')}
      subtitle={t('sessionReuse.skill.subtitle')}
      icon={<Puzzle size={16} />}
      width={560}
      onClose={onClose}
      testId="skill"
      footer={(
        <>
          <button
            onClick={onClose}
            disabled={installing}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12,
              cursor: installing ? 'not-allowed' : 'pointer',
              background: 'var(--bg-hover)', border: '1px solid var(--bg-active)',
              color: 'var(--text-secondary)', fontWeight: 500,
              opacity: installing ? 0.5 : 1,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleInstall}
            disabled={!canInstall}
            data-reuse-save="skill"
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12,
              cursor: canInstall ? 'pointer' : 'not-allowed',
              background: canInstall
                ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                : 'var(--bg-hover)',
              border: 'none', color: 'var(--text-bright)', fontWeight: 600,
              opacity: canInstall ? 1 : 0.5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {installing && (
              <span style={{
                width: 11, height: 11, borderRadius: '50%',
                border: '2px solid var(--text-faint)',
                borderTopColor: 'var(--text-primary)',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
              }} />
            )}
            {installing ? t('sessionReuse.skill.installing') : t('sessionReuse.skill.install')}
          </button>
        </>
      )}
    >
      {empty ? (
        <div style={{ padding: '28px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('sessionReuse.skill.empty')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            {t('sessionReuse.skill.emptyHint')}
          </div>
        </div>
      ) : (
        <>
          {draft.truncated && (
            <div
              data-reuse-truncated="skill"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 7,
                padding: '7px 10px', marginBottom: 12,
                background: 'rgba(234,179,8,0.10)',
                border: '1px solid rgba(234,179,8,0.28)',
                borderRadius: 8,
                fontSize: 11, color: 'rgba(253,224,71,0.92)', lineHeight: 1.45,
              }}
            >
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {t('sessionReuse.skill.truncated', {
                  shown: Math.min(draft.totalTurns, MAX_SKILL_STEPS),
                  total: draft.totalTurns,
                  omitted: draft.totalTurns - Math.min(draft.totalTurns, MAX_SKILL_STEPS),
                })}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={labelStyle}>{t('sessionReuse.skill.name')}</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value.slice(0, 60))}
                maxLength={60}
                placeholder={t('sessionReuse.skill.namePlaceholder')}
                data-reuse-field="skill-name"
                style={fieldStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--bg-active)' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={labelStyle}>{t('sessionReuse.skill.description')}</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 120))}
                maxLength={120}
                placeholder={t('sessionReuse.skill.descPlaceholder')}
                style={fieldStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--bg-active)' }}
              />
            </div>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 6,
          }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['edit', 'preview'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setTab(mode)}
                  data-reuse-tab={mode}
                  style={{
                    padding: '3px 10px', borderRadius: 7, fontSize: 10,
                    fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer',
                    border: tab === mode
                      ? '1px solid rgba(99,102,241,0.4)'
                      : '1px solid var(--border)',
                    background: tab === mode ? 'rgba(99,102,241,0.14)' : 'transparent',
                    color: tab === mode ? '#818cf8' : 'var(--text-muted)',
                  }}
                >
                  {t(mode === 'edit' ? 'sessionReuse.skill.editTab' : 'sessionReuse.skill.previewTab')}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }} data-reuse-install-path>
              {t('sessionReuse.skill.installPath', { name: installSlug })}
            </span>
          </div>

          {tab === 'edit' ? (
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={14}
              aria-label={t('sessionReuse.skill.body')}
              placeholder={t('sessionReuse.skill.bodyPlaceholder')}
              style={{ ...monoStyle, resize: 'vertical', minHeight: 220, maxHeight: 360 }}
            />
          ) : (
            <pre
              data-reuse-preview="skill"
              style={{
                ...monoStyle,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflow: 'auto',
                maxHeight: 320,
                minHeight: 220,
                color: 'var(--text-secondary)',
              }}
            >
              {content}
            </pre>
          )}

          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 7,
              marginTop: 10, padding: '6px 10px', borderRadius: 6,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#fca5a5', fontSize: 11, lineHeight: 1.45,
            }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
        </>
      )}
    </SessionReuseDialogShell>
  )
}
