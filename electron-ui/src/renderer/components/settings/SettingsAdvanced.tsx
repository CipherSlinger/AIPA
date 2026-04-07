// SettingsAdvanced — System Prompt (append) configuration (Iteration 523)
import React, { useState, useCallback } from 'react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'

const MAX_CHARS = 2000

const PRESETS = [
  { key: 'concise',    label: 'Concise',     prompt: 'Always be concise. Answer in 1-3 sentences unless asked for detail.' },
  { key: 'reviewer',  label: 'Code Review',  prompt: 'Act as a senior code reviewer. Focus on bugs, performance issues, and best practices.' },
  { key: 'teaching',  label: 'Teaching',     prompt: 'Explain concepts step by step, as if teaching a junior developer. Use analogies.' },
  { key: 'chinese',   label: '中文回复',      prompt: 'Always respond in Chinese (Simplified). Use technical terms in English.' },
  { key: 'analyze',   label: 'Analyze Only', prompt: 'Analyze and explain what you would do, but do NOT execute any tools or make any changes.' },
  { key: 'security',  label: 'Security',     prompt: 'Focus on security vulnerabilities, injection risks, and auth issues in the code.' },
]

export default function SettingsAdvanced() {
  const t = useT()
  const { prefs, setPrefs } = usePrefsStore()
  const [draft, setDraft] = useState(prefs.appendSystemPrompt || '')
  const [saved, setSaved] = useState(false)
  const [replaceConfirm, setReplaceConfirm] = useState<string | null>(null)

  const save = useCallback(async () => {
    const trimmed = draft.trim()
    setPrefs({ appendSystemPrompt: trimmed })
    await window.electronAPI.prefsSet('appendSystemPrompt', trimmed)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [draft, setPrefs])

  const applyPreset = useCallback((prompt: string) => {
    if (draft.trim() && draft.trim() !== prompt) {
      setReplaceConfirm(prompt)
    } else {
      setDraft(prompt)
    }
  }, [draft])

  const confirmReplace = useCallback(() => {
    if (replaceConfirm) {
      setDraft(replaceConfirm)
      setReplaceConfirm(null)
    }
  }, [replaceConfirm])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {t('systemPrompt.title')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
          {t('systemPrompt.hint')}
        </div>

        {/* Preset chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.prompt)}
              aria-label={`${t('systemPrompt.preset')}: ${p.label}`}
              style={{
                background: draft.trim() === p.prompt ? 'var(--accent)' : 'var(--action-btn-bg)',
                border: '1px solid var(--border)',
                borderRadius: 5,
                padding: '3px 10px',
                fontSize: 11,
                color: draft.trim() === p.prompt ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Replace confirm */}
        {replaceConfirm && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
            background: 'var(--action-btn-bg)', borderRadius: 6, padding: '7px 12px',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
              {t('systemPrompt.replaceConfirm')}
            </span>
            <button
              onClick={confirmReplace}
              style={{ fontSize: 11, padding: '3px 10px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}
            >
              {t('common.confirm')}
            </button>
            <button
              onClick={() => setReplaceConfirm(null)}
              style={{ fontSize: 11, padding: '3px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              {t('common.cancel')}
            </button>
          </div>
        )}

        {/* Textarea */}
        <div style={{ position: 'relative' }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
            placeholder={t('systemPrompt.placeholder')}
            rows={5}
            style={{
              width: '100%',
              background: 'var(--action-btn-bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '8px 10px',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              lineHeight: 1.6,
            }}
          />
          <span style={{
            position: 'absolute', bottom: 8, right: 10,
            fontSize: 10, color: draft.length >= MAX_CHARS ? '#ef4444' : 'var(--text-muted)',
          }}>
            {draft.length} / {MAX_CHARS}
          </span>
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={save}
          style={{
            padding: '7px 18px', fontSize: 12, fontWeight: 500,
            background: 'var(--accent)', border: 'none', borderRadius: 6,
            color: '#fff', cursor: 'pointer',
          }}
        >
          {saved ? t('common.saved') : t('common.save')}
        </button>
        {draft.trim() && (
          <button
            onClick={() => setDraft('')}
            style={{
              padding: '7px 12px', fontSize: 12,
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            {t('common.clear')}
          </button>
        )}
      </div>
    </div>
  )
}
