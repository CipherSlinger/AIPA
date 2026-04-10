// SettingsAdvanced — System Prompt + Tool Access Control (Iterations 523, 527)
import React, { useState, useCallback } from 'react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import { AlertTriangle } from 'lucide-react'

const MAX_CHARS = 2000

// ── System Prompt presets — labels resolved at render time via t() ─────────
const PROMPT_PRESET_DEFS = [
  { key: 'concise',    labelKey: 'settingsAdvanced.presetConcise',     promptKey: 'settingsAdvanced.presetConcisePrompt' },
  { key: 'reviewer',  labelKey: 'settingsAdvanced.presetCodeReview',   promptKey: 'settingsAdvanced.presetCodeReviewPrompt' },
  { key: 'teaching',  labelKey: 'settingsAdvanced.presetTeaching',     promptKey: 'settingsAdvanced.presetTeachingPrompt' },
  { key: 'chinese',   labelKey: 'settingsAdvanced.presetChinese',      promptKey: 'settingsAdvanced.presetChinesePrompt' },
  { key: 'analyze',   labelKey: 'settingsAdvanced.presetAnalyzeOnly',  promptKey: 'settingsAdvanced.presetAnalyzeOnlyPrompt' },
  { key: 'security',  labelKey: 'settingsAdvanced.presetSecurity',     promptKey: 'settingsAdvanced.presetSecurityPrompt' },
]

// ── Tool definitions — labels resolved at render time via t() ─────────────
interface ToolDef { name: string; descKey: string }
const TOOL_GROUP_DEFS: { labelKey: string; tools: ToolDef[] }[] = [
  { labelKey: 'settingsAdvanced.toolGroupExecution', tools: [{ name: 'Bash', descKey: 'settingsAdvanced.toolDescBash' }] },
  { labelKey: 'settingsAdvanced.toolGroupFileWrite', tools: [
    { name: 'Write', descKey: 'settingsAdvanced.toolDescWrite' },
    { name: 'Edit', descKey: 'settingsAdvanced.toolDescEdit' },
    { name: 'MultiEdit', descKey: 'settingsAdvanced.toolDescMultiEdit' },
  ]},
  { labelKey: 'settingsAdvanced.toolGroupFileRead', tools: [
    { name: 'Read', descKey: 'settingsAdvanced.toolDescRead' },
    { name: 'Glob', descKey: 'settingsAdvanced.toolDescGlob' },
    { name: 'Grep', descKey: 'settingsAdvanced.toolDescGrep' },
    { name: 'LS', descKey: 'settingsAdvanced.toolDescLs' },
  ]},
  { labelKey: 'settingsAdvanced.toolGroupNetwork', tools: [
    { name: 'WebFetch', descKey: 'settingsAdvanced.toolDescWebFetch' },
    { name: 'WebSearch', descKey: 'settingsAdvanced.toolDescWebSearch' },
  ]},
  { labelKey: 'settingsAdvanced.toolGroupOther', tools: [
    { name: 'NotebookEdit', descKey: 'settingsAdvanced.toolDescNotebookEdit' },
    { name: 'TodoRead', descKey: 'settingsAdvanced.toolDescTodoRead' },
    { name: 'TodoWrite', descKey: 'settingsAdvanced.toolDescTodoWrite' },
  ]},
]

const ALL_TOOL_NAMES = TOOL_GROUP_DEFS.flatMap(g => g.tools.map(t => t.name))

type PresetKey = 'all' | 'readonly' | 'nonet' | 'analysis' | 'custom'
const TOOL_PRESETS: { key: PresetKey; labelKey: string; disallowed: string[] }[] = [
  { key: 'all',      labelKey: 'settingsAdvanced.presetAllTools',     disallowed: [] },
  { key: 'readonly', labelKey: 'settingsAdvanced.presetReadOnly',     disallowed: ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'TodoWrite'] },
  { key: 'nonet',    labelKey: 'settingsAdvanced.presetNoNetwork',    disallowed: ['WebFetch', 'WebSearch'] },
  { key: 'analysis', labelKey: 'settingsAdvanced.presetAnalysisOnly', disallowed: ['Bash', 'Write', 'Edit', 'MultiEdit', 'WebFetch', 'WebSearch', 'NotebookEdit', 'TodoRead', 'TodoWrite'] },
]

function detectPreset(disallowed: string[]): PresetKey {
  const sorted = [...disallowed].sort().join(',')
  for (const p of TOOL_PRESETS) {
    if ([...p.disallowed].sort().join(',') === sorted) return p.key
  }
  return 'custom'
}

// ── Component ──────────────────────────────────────────────────────────────
export default function SettingsAdvanced() {
  const t = useT()
  const { prefs, setPrefs } = usePrefsStore()

  // System prompt state
  const [draft, setDraft] = useState(prefs.appendSystemPrompt || '')
  const [saved, setSaved] = useState(false)
  const [replaceConfirm, setReplaceConfirm] = useState<string | null>(null)

  // Tool filter state (live — no save button, each toggle persists immediately)
  const disallowedTools = prefs.disallowedTools || []
  const activePreset = detectPreset(disallowedTools)
  const allDisabled = disallowedTools.length === ALL_TOOL_NAMES.length

  // ── System prompt handlers ─────────────────────────────────────────────
  const savePrompt = useCallback(async () => {
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

  // ── Tool filter handlers ───────────────────────────────────────────────
  const toggleTool = useCallback(async (toolName: string, allowed: boolean) => {
    let updated: string[]
    if (allowed) {
      updated = disallowedTools.filter(t => t !== toolName)
    } else {
      updated = disallowedTools.includes(toolName) ? disallowedTools : [...disallowedTools, toolName]
    }
    setPrefs({ disallowedTools: updated })
    await window.electronAPI.prefsSet('disallowedTools', updated)
  }, [disallowedTools, setPrefs])

  const applyToolPreset = useCallback(async (preset: typeof TOOL_PRESETS[0]) => {
    setPrefs({ disallowedTools: preset.disallowed })
    await window.electronAPI.prefsSet('disallowedTools', preset.disallowed)
  }, [setPrefs])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Section 1: System Prompt ─────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {t('systemPrompt.title')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
          {t('systemPrompt.hint')}
        </div>

        {/* Preset chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {PROMPT_PRESET_DEFS.map(p => {
            const label = t(p.labelKey)
            const prompt = t(p.promptKey)
            return (
              <button
                key={p.key}
                onClick={() => applyPreset(prompt)}
                aria-label={`${t('systemPrompt.preset')}: ${label}`}
                style={{
                  background: draft.trim() === prompt ? 'var(--accent)' : 'var(--action-btn-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 5, padding: '3px 10px', fontSize: 11,
                  color: draft.trim() === prompt ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
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
            <button onClick={confirmReplace} style={{ fontSize: 11, padding: '3px 10px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}>
              {t('common.confirm')}
            </button>
            <button onClick={() => setReplaceConfirm(null)} style={{ fontSize: 11, padding: '3px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer' }}>
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
              width: '100%', background: 'var(--action-btn-bg)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)',
              fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
              boxSizing: 'border-box', lineHeight: 1.6,
            }}
          />
          <span style={{ position: 'absolute', bottom: 8, right: 10, fontSize: 10, color: draft.length >= MAX_CHARS ? '#ef4444' : 'var(--text-muted)' }}>
            {draft.length} / {MAX_CHARS}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <button onClick={savePrompt} style={{ padding: '7px 18px', fontSize: 12, fontWeight: 500, background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer' }}>
            {saved ? t('common.saved') : t('common.save')}
          </button>
          {draft.trim() && (
            <button onClick={() => setDraft('')} style={{ padding: '7px 12px', fontSize: 12, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer' }}>
              {t('common.clear')}
            </button>
          )}
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* ── Section 2: Tool Access Control ───────────────────────────── */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {t('settings.toolAccessControl')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
          {t('settings.toolAccessControlHint')}
        </div>

        {/* Preset chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {TOOL_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => applyToolPreset(p)}
              style={{
                background: activePreset === p.key ? 'var(--accent)' : 'var(--action-btn-bg)',
                border: '1px solid var(--border)', borderRadius: 5, padding: '3px 10px',
                fontSize: 11, color: activePreset === p.key ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {t(p.labelKey)}
            </button>
          ))}
          {activePreset === 'custom' && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', fontStyle: 'italic' }}>{t('settings.toolAccessCustom')}</span>
          )}
        </div>

        {/* All disabled warning */}
        {allDisabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px' }}>
            <AlertTriangle size={13} color="#ef4444" />
            <span style={{ fontSize: 11, color: '#ef4444' }}>{t('settings.toolAccessAllDisabled')}</span>
          </div>
        )}

        {/* Tool groups */}
        {TOOL_GROUP_DEFS.map(group => (
          <div key={group.labelKey} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              {t(group.labelKey)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {group.tools.map(tool => {
                const isAllowed = !disallowedTools.includes(tool.name)
                return (
                  <label
                    key={tool.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderRadius: 5, background: 'var(--action-btn-bg)', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={isAllowed}
                      onChange={(e) => toggleTool(tool.name, e.target.checked)}
                      aria-label={`${isAllowed ? t('common.disable') : t('common.enable')} ${tool.name}`}
                      style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                    <code style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-primary)', flex: '0 0 auto' }}>{tool.name}</code>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{t(tool.descKey)}</span>
                    {!isAllowed && (
                      <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.12)', color: '#ef4444', borderRadius: 3, padding: '1px 5px' }}>{t('settings.toolAccessDisabled')}</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
