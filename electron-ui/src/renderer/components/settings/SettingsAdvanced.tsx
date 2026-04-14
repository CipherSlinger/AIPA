// SettingsAdvanced — Permission Mode + System Prompt + Tool Access Control (Iterations 523, 527, 535)
import React, { useState, useCallback } from 'react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import { AlertTriangle } from 'lucide-react'
import type { PermissionMode } from '../../types/app.types'

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
  { labelKey: 'settingsAdvanced.toolGroupTask', tools: [
    { name: 'TaskCreate', descKey: 'settingsAdvanced.toolDescTaskCreate' },
    { name: 'TaskGet', descKey: 'settingsAdvanced.toolDescTaskGet' },
    { name: 'TaskList', descKey: 'settingsAdvanced.toolDescTaskList' },
    { name: 'TaskUpdate', descKey: 'settingsAdvanced.toolDescTaskUpdate' },
    { name: 'TaskStop', descKey: 'settingsAdvanced.toolDescTaskStop' },
  ]},
  { labelKey: 'settingsAdvanced.toolGroupAgent', tools: [
    { name: 'AskUserQuestion', descKey: 'settingsAdvanced.toolDescAskUserQuestion' },
  ]},
  { labelKey: 'settingsAdvanced.toolGroupWorktree', tools: [
    { name: 'EnterWorktree', descKey: 'settingsAdvanced.toolDescEnterWorktree' },
    { name: 'ExitWorktree', descKey: 'settingsAdvanced.toolDescExitWorktree' },
  ]},
  { labelKey: 'settingsAdvanced.toolGroupPlanning', tools: [
    { name: 'EnterPlanMode', descKey: 'settingsAdvanced.toolDescEnterPlanMode' },
    { name: 'ExitPlanMode', descKey: 'settingsAdvanced.toolDescExitPlanMode' },
  ]},
]

const ALL_TOOL_NAMES = TOOL_GROUP_DEFS.flatMap(g => g.tools.map(t => t.name))

// ── Permission mode options ────────────────────────────────────────────────
const PERMISSION_MODE_OPTIONS: {
  mode: PermissionMode
  label: string
  desc: string
  danger?: boolean
}[] = [
  { mode: 'default',            label: 'Default',        desc: '每次工具调用均需确认' },
  { mode: 'acceptEdits',        label: 'Accept Edits',   desc: '自动接受文件修改' },
  { mode: 'dontAsk',            label: "Don't Ask",      desc: '自动接受大多数操作' },
  { mode: 'plan',               label: 'Plan Only',      desc: '仅规划，不执行' },
  { mode: 'bypassPermissions',  label: 'Bypass',         desc: '跳过所有权限检查 ⚠️', danger: true },
]

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

const sectionCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--glass-border)',
  borderRadius: 10,
  padding: '16px 20px',
  marginBottom: 12,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
  marginBottom: 6,
}

const descStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  lineHeight: 1.5,
  marginBottom: 12,
}

// ── Component ──────────────────────────────────────────────────────────────
export default function SettingsAdvanced() {
  const t = useT()
  const { prefs, setPrefs, setPermissionMode } = usePrefsStore()

  // System prompt state
  const [draft, setDraft] = useState(prefs.appendSystemPrompt || '')
  const [saved, setSaved] = useState(false)
  const [replaceConfirm, setReplaceConfirm] = useState<string | null>(null)

  // Tool filter state (live — no save button, each toggle persists immediately)
  const disallowedTools = prefs.disallowedTools || []
  const activePreset = detectPreset(disallowedTools)
  const allDisabled = disallowedTools.length === ALL_TOOL_NAMES.length

  // Permission mode state
  const currentPermissionMode: PermissionMode = prefs.permissionMode || 'default'

  const handlePermissionModeChange = useCallback(async (mode: PermissionMode) => {
    setPermissionMode(mode)
    await window.electronAPI.prefsSet('permissionMode', mode)
    await window.electronAPI.prefsSet('skipPermissions', mode === 'bypassPermissions')
  }, [setPermissionMode])

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Section 0: Permission Mode ───────────────────────────────── */}
      <div style={sectionCardStyle}>
        <div style={sectionTitleStyle}>PERMISSION MODE</div>
        <div style={descStyle}>控制 AI 工具调用的权限策略，适用于每次新对话。</div>

        {/* Button group */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4,
          background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 4,
        }}>
          {PERMISSION_MODE_OPTIONS.map(opt => {
            const isSelected = currentPermissionMode === opt.mode
            return (
              <button
                key={opt.mode}
                onClick={() => handlePermissionModeChange(opt.mode)}
                style={{
                  flex: '1 1 auto',
                  background: isSelected
                    ? (opt.danger ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.15)')
                    : 'transparent',
                  border: isSelected
                    ? (opt.danger ? '1px solid rgba(239,68,68,0.40)' : '1px solid rgba(99,102,241,0.35)')
                    : '1px solid transparent',
                  borderRadius: 6,
                  padding: '6px 12px',
                  color: isSelected
                    ? (opt.danger ? 'rgba(239,68,68,0.82)' : 'rgba(165,180,252,0.82)')
                    : 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <div>{opt.label}</div>
                <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>{opt.desc}</div>
              </button>
            )
          })}
        </div>

        {/* Bypass warning */}
        {currentPermissionMode === 'bypassPermissions' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 6, padding: '8px 12px',
          }}>
            <AlertTriangle size={13} color="#f87171" />
            <span style={{ fontSize: 11, color: '#fca5a5' }}>
              Bypass 模式将跳过所有权限检查，AI 可无限制地执行工具调用。
            </span>
          </div>
        )}
      </div>

      {/* ── Section 1: System Prompt ─────────────────────────────────── */}
      <div style={sectionCardStyle}>
        <div style={sectionTitleStyle}>{t('systemPrompt.title')}</div>
        <div style={descStyle}>{t('systemPrompt.hint')}</div>

        {/* Preset chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {PROMPT_PRESET_DEFS.map(p => {
            const label = t(p.labelKey)
            const prompt = t(p.promptKey)
            const isActive = draft.trim() === prompt
            return (
              <button
                key={p.key}
                onClick={() => applyPreset(prompt)}
                aria-label={`${t('systemPrompt.preset')}: ${label}`}
                style={{
                  background: isActive ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                  border: isActive ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--glass-border-md)',
                  borderRadius: 8, padding: '3px 10px', fontSize: 11,
                  color: isActive ? '#a5b4fc' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
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
            background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '7px 12px',
            border: '1px solid var(--glass-border)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
              {t('systemPrompt.replaceConfirm')}
            </span>
            <button onClick={confirmReplace} style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8, color: '#a5b4fc', cursor: 'pointer', transition: 'all 0.15s ease' }}>
              {t('common.confirm')}
            </button>
            <button onClick={() => setReplaceConfirm(null)} style={{ fontSize: 11, padding: '3px 10px', background: 'none', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s ease' }}>
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
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--glass-border)',
              borderRadius: 7, padding: '8px 10px',
              color: 'var(--text-primary)',
              fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
              boxSizing: 'border-box', lineHeight: 1.6,
              transition: 'all 0.15s ease',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
          />
          <span style={{ position: 'absolute', bottom: 8, right: 10, fontSize: 10, color: draft.length >= MAX_CHARS ? '#f87171' : 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
            {draft.length} / {MAX_CHARS}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <button onClick={savePrompt}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.35)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)' }}
            style={{ padding: '7px 18px', fontSize: 12, fontWeight: 600, background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, color: '#a5b4fc', cursor: 'pointer', transition: 'all 0.15s ease' }}>
            {saved ? t('common.saved') : t('common.save')}
          </button>
          {draft.trim() && (
            <button onClick={() => setDraft('')}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
              style={{ padding: '7px 12px', fontSize: 12, background: 'none', border: '1px solid var(--glass-border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s ease' }}>
              {t('common.clear')}
            </button>
          )}
        </div>
      </div>

      {/* ── Section 2: Tool Access Control ────��──────────────────────── */}
      <div style={sectionCardStyle}>
        <div style={sectionTitleStyle}>{t('settings.toolAccessControl')}</div>
        <div style={descStyle}>{t('settings.toolAccessControlHint')}</div>

        {/* Preset chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {TOOL_PRESETS.map(p => {
            const isActive = activePreset === p.key
            return (
              <button
                key={p.key}
                onClick={() => applyToolPreset(p)}
                style={{
                  background: isActive ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                  border: isActive ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--glass-border-md)',
                  borderRadius: 5, padding: '3px 10px',
                  fontSize: 11, color: isActive ? '#a5b4fc' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {t(p.labelKey)}
              </button>
            )
          })}
          {activePreset === 'custom' && (
            <span style={{ fontSize: 11, color: 'var(--text-faint)', alignSelf: 'center', fontStyle: 'italic' }}>{t('settings.toolAccessCustom')}</span>
          )}
        </div>

        {/* All disabled warning — danger zone style */}
        {allDisabled && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px',
          }}>
            <AlertTriangle size={13} color="#f87171" />
            <span style={{ fontSize: 11, color: '#fca5a5' }}>{t('settings.toolAccessAllDisabled')}</span>
          </div>
        )}

        {/* Tool groups */}
        {TOOL_GROUP_DEFS.map(group => (
          <div key={group.labelKey} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'var(--text-faint)',
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
            }}>
              {t(group.labelKey)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {group.tools.map((tool, idx, arr) => {
                const isAllowed = !disallowedTools.includes(tool.name)
                return (
                  <React.Fragment key={tool.name}>
                    <label
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 0',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="checkbox"
                          checked={isAllowed}
                          onChange={(e) => toggleTool(tool.name, e.target.checked)}
                          aria-label={`${isAllowed ? t('common.disable') : t('common.enable')} ${tool.name}`}
                          style={{ cursor: 'pointer', accentColor: '#6366f1' }}
                        />
                        <code style={{
                          fontSize: 11, fontFamily: 'monospace',
                          color: 'rgba(165,180,252,0.85)',
                          background: 'rgba(99,102,241,0.10)', borderRadius: 4, padding: '1px 5px',
                          flex: '0 0 auto',
                        }}>{tool.name}</code>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t(tool.descKey)}</span>
                      </div>
                      {!isAllowed && (
                        <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.12)', color: '#fca5a5', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{t('settings.toolAccessDisabled')}</span>
                      )}
                    </label>
                    {idx < arr.length - 1 && (
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
