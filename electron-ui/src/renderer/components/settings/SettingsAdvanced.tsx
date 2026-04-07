// SettingsAdvanced — System Prompt + Tool Access Control (Iterations 523, 527)
import React, { useState, useCallback } from 'react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import { AlertTriangle } from 'lucide-react'

const MAX_CHARS = 2000

// ── System Prompt presets ──────────────────────────────────────────────────
const PROMPT_PRESETS = [
  { key: 'concise',    label: 'Concise',     prompt: 'Always be concise. Answer in 1-3 sentences unless asked for detail.' },
  { key: 'reviewer',  label: 'Code Review',  prompt: 'Act as a senior code reviewer. Focus on bugs, performance issues, and best practices.' },
  { key: 'teaching',  label: 'Teaching',     prompt: 'Explain concepts step by step, as if teaching a junior developer. Use analogies.' },
  { key: 'chinese',   label: '中文回复',      prompt: 'Always respond in Chinese (Simplified). Use technical terms in English.' },
  { key: 'analyze',   label: 'Analyze Only', prompt: 'Analyze and explain what you would do, but do NOT execute any tools or make any changes.' },
  { key: 'security',  label: 'Security',     prompt: 'Focus on security vulnerabilities, injection risks, and auth issues in the code.' },
]

// ── Tool definitions ───────────────────────────────────────────────────────
interface ToolDef { name: string; desc: string }
const TOOL_GROUPS: { label: string; tools: ToolDef[] }[] = [
  { label: 'Execution', tools: [{ name: 'Bash', desc: 'Run shell commands' }] },
  { label: 'File Write', tools: [
    { name: 'Write', desc: 'Create/overwrite files' },
    { name: 'Edit', desc: 'Edit file sections' },
    { name: 'MultiEdit', desc: 'Edit multiple sections' },
  ]},
  { label: 'File Read', tools: [
    { name: 'Read', desc: 'Read file contents' },
    { name: 'Glob', desc: 'Find files by pattern' },
    { name: 'Grep', desc: 'Search file contents' },
    { name: 'LS', desc: 'List directory' },
  ]},
  { label: 'Network', tools: [
    { name: 'WebFetch', desc: 'Fetch web pages' },
    { name: 'WebSearch', desc: 'Search the web' },
  ]},
  { label: 'Other', tools: [
    { name: 'NotebookEdit', desc: 'Edit Jupyter notebooks' },
    { name: 'TodoRead', desc: 'Read todo list' },
    { name: 'TodoWrite', desc: 'Write todo list' },
  ]},
]

const ALL_TOOL_NAMES = TOOL_GROUPS.flatMap(g => g.tools.map(t => t.name))

type PresetKey = 'all' | 'readonly' | 'nonet' | 'analysis' | 'custom'
const TOOL_PRESETS: { key: PresetKey; label: string; disallowed: string[] }[] = [
  { key: 'all',      label: 'All Tools',     disallowed: [] },
  { key: 'readonly', label: 'Read Only',     disallowed: ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'TodoWrite'] },
  { key: 'nonet',    label: 'No Network',    disallowed: ['WebFetch', 'WebSearch'] },
  { key: 'analysis', label: 'Analysis Only', disallowed: ['Bash', 'Write', 'Edit', 'MultiEdit', 'WebFetch', 'WebSearch', 'NotebookEdit', 'TodoRead', 'TodoWrite'] },
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
          {PROMPT_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.prompt)}
              aria-label={`${t('systemPrompt.preset')}: ${p.label}`}
              style={{
                background: draft.trim() === p.prompt ? 'var(--accent)' : 'var(--action-btn-bg)',
                border: '1px solid var(--border)',
                borderRadius: 5, padding: '3px 10px', fontSize: 11,
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
          Tool Access Control
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
          Control which built-in tools Claude can use. Disabled tools are passed via <code style={{ fontFamily: 'monospace', fontSize: 10 }}>--disallowedTools</code>.
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
              {p.label}
            </button>
          ))}
          {activePreset === 'custom' && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', fontStyle: 'italic' }}>Custom</span>
          )}
        </div>

        {/* All disabled warning */}
        {allDisabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px' }}>
            <AlertTriangle size={13} color="#ef4444" />
            <span style={{ fontSize: 11, color: '#ef4444' }}>All tools disabled. Claude can only chat without taking actions.</span>
          </div>
        )}

        {/* Tool groups */}
        {TOOL_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              {group.label}
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
                      aria-label={`${isAllowed ? 'Disable' : 'Enable'} ${tool.name}`}
                      style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                    <code style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-primary)', flex: '0 0 auto' }}>{tool.name}</code>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{tool.desc}</span>
                    {!isAllowed && (
                      <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.12)', color: '#ef4444', borderRadius: 3, padding: '1px 5px' }}>disabled</span>
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
