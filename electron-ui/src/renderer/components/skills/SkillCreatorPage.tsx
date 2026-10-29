// SkillCreatorPage — full-page form for creating a new skill (Iteration 535)
// Renders in the main view area when mainView === 'skill-creator'
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { ArrowLeft, Puzzle, CheckCircle, AlertCircle, FolderOpen, RefreshCw } from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'
import {
  buildSkillFile,
  sanitizeSkillDirName,
  SKILL_DESCRIPTION_MAX,
} from '../../../main/skills/skillMd'

type CreationState = 'idle' | 'creating' | 'success' | 'error' | 'conflict'

interface ExistingSkill {
  /** Absolute folder main reported; empty if the refusal somehow omitted it. */
  dirPath: string
  /** `name:` from the existing SKILL.md, when it could be read. */
  name?: string
}

export default function SkillCreatorPage() {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)

  const [skillName, setSkillName] = useState('')
  const [skillDesc, setSkillDesc] = useState('')
  const [skillInstructions, setSkillInstructions] = useState('')
  const [creationState, setCreationState] = useState<CreationState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [existing, setExisting] = useState<ExistingSkill | null>(null)
  const [isReplacing, setIsReplacing] = useState(false)
  const [submitHovered, setSubmitHovered] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // Focus name field on mount
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // The same normalizer main uses for the real folder, and the same builder
  // that produces the bytes: the preview below cannot promise a destination or
  // a file that the install would not actually write.
  const installSlug = sanitizeSkillDirName(skillName)
  const installPath = installSlug ? `~/.claude/skills/${installSlug}` : ''
  const built = useMemo(
    () => buildSkillFile({
      name: skillName,
      description: skillDesc,
      instructions: skillInstructions,
    }),
    [skillName, skillDesc, skillInstructions],
  )
  const descriptionLength = skillDesc.replace(/\s*\n\s*/g, ' ').trim().length
  const descriptionOverLimit = descriptionLength > SKILL_DESCRIPTION_MAX

  /** Editing after a refusal or a conflict must clear the old answer. */
  const clearOutcome = useCallback(() => {
    if (creationState === 'error' || creationState === 'conflict') {
      setCreationState('idle')
      setErrorMsg('')
      setExisting(null)
    }
  }, [creationState])

  const handleCancel = useCallback(() => {
    useUiStore.getState().setActiveNavItem('workflows')
  }, [])

  const submit = useCallback(async (replace: boolean) => {
    const trimmedName = skillName.trim()
    if (!trimmedName || !skillDesc.trim() || !skillInstructions.trim() || !installSlug) {
      nameRef.current?.focus()
      return
    }

    setCreationState('creating')
    setIsReplacing(replace)
    setErrorMsg('')

    try {
      const result = await window.electronAPI.skillsInstall({
        name: trimmedName,
        content: built.content,
        replace,
      })

      if (result?.success) {
        setCreationState('success')
        setExisting(null)
        addToast('success', t('skill.createSuccess'))
        // Auto-navigate back to chat after brief success display
        setTimeout(() => {
          useUiStore.getState().setActiveNavItem('workflows')
        }, 1500)
      } else if (result?.code === 'skill_exists') {
        // Not an error: the same folder already holds a skill. Offer to look at
        // it, or to overwrite it deliberately. Nothing was written.
        setCreationState('conflict')
        setExisting({
          dirPath: result.dirPath ?? '',
          ...(result.name ? { name: result.name } : {}),
        })
      } else {
        setCreationState('error')
        setErrorMsg(result?.error || t('skill.createFailed'))
      }
    } catch (err) {
      setCreationState('error')
      setErrorMsg(String(err))
    } finally {
      setIsReplacing(false)
    }
  }, [skillName, skillDesc, skillInstructions, installSlug, built.content, addToast, t])

  const handleCreate = useCallback(() => {
    if (creationState === 'conflict') return
    void submit(false)
  }, [creationState, submit])

  const handleReplace = useCallback(() => {
    void submit(true)
  }, [submit])

  const handleOpenExisting = useCallback(() => {
    if (!existing?.dirPath) return
    // The same hand-off the global search uses: the Employees page opens the
    // skill once its list has loaded, so a folder that vanished opens nothing
    // rather than a blank detail page.
    useUiStore.getState().openSkillDetail(existing.dirPath)
  }, [existing])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleCreate()
    }
  }, [handleCreate])

  const isCreating = creationState === 'creating'
  const isSuccess = creationState === 'success'
  const isError = creationState === 'error'
  const isConflict = creationState === 'conflict'
  const canCreate = skillName.trim().length > 0
    && skillDesc.trim().length > 0
    && skillInstructions.trim().length > 0
    && installSlug.length > 0
    && !isCreating
    && !isSuccess

  const cardStyle: React.CSSProperties = {
    background: 'var(--popup-bg)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '16px 20px',
    marginBottom: 12,
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-muted)',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  }
  const textareaBase: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
    resize: 'vertical',
    lineHeight: 1.5,
    boxSizing: 'border-box',
    transition: 'all 0.15s ease',
    opacity: isCreating ? 0.6 : 1,
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-chat)',
    }}>
      {/* Header */}
      <div style={{
        height: 44,
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        flexShrink: 0,
        gap: 12,
      }}>
        <button
          onClick={handleCancel}
          title={t('skill.cancelCreate')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
            padding: '5px', borderRadius: 6, transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <Puzzle size={16} style={{ color: '#818cf8', flexShrink: 0 }} />
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {t('skill.createTitle')}
        </span>
      </div>

      {/* Form content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        padding: '40px 16px',
      }}>
        <div style={{ width: '100%', maxWidth: 600 }}>

          {/* Success state */}
          {isSuccess && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: '48px 0',
              color: 'var(--text-muted)',
            }}>
              <CheckCircle size={48} style={{ color: '#4ade80' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('skill.createSuccess')}
              </span>
              <span style={{ fontSize: 12, opacity: 0.7 }}>{t('skill.redirecting')}</span>
            </div>
          )}

          {!isSuccess && (
            <>
              {/* Skill Name section */}
              <div style={cardStyle}>
                <label style={labelStyle}>
                  {t('skill.nameLabel')}
                  <span style={{ color: '#818cf8', marginLeft: 4 }}>*</span>
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={skillName}
                  onChange={(e) => { setSkillName(e.target.value); clearOutcome() }}
                  onKeyDown={handleKeyDown}
                  placeholder={t('skill.namePlaceholder')}
                  disabled={isCreating}
                  maxLength={60}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease',
                    opacity: isCreating ? 0.6 : 1,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                  {skillName.trim().length}/60
                </div>
              </div>

              {/* Description — frontmatter metadata only */}
              <div style={cardStyle}>
                <label style={labelStyle}>
                  {t('skill.descLabel')}
                  <span style={{ color: '#818cf8', marginLeft: 4 }}>*</span>
                </label>
                <textarea
                  value={skillDesc}
                  onChange={(e) => { setSkillDesc(e.target.value); clearOutcome() }}
                  onKeyDown={handleKeyDown}
                  placeholder={t('skill.descPlaceholder')}
                  disabled={isCreating}
                  rows={3}
                  style={{ ...textareaBase, minHeight: 70 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t('skill.descHint')}
                  </div>
                  <div style={{
                    fontSize: 11,
                    whiteSpace: 'nowrap',
                    color: descriptionOverLimit ? '#fbbf24' : 'var(--text-muted)',
                    fontVariantNumeric: 'tabular-nums',
                    fontFeatureSettings: '"tnum"',
                  }}>
                    {descriptionLength}/{SKILL_DESCRIPTION_MAX}
                  </div>
                </div>
                {descriptionOverLimit && (
                  <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 6, lineHeight: 1.5 }}>
                    {t('skill.descOverLimit', { max: SKILL_DESCRIPTION_MAX })}
                  </div>
                )}
              </div>

              {/* Instructions — the body of SKILL.md */}
              <div style={cardStyle}>
                <label style={labelStyle}>
                  {t('skill.instructionsLabel')}
                  <span style={{ color: '#818cf8', marginLeft: 4 }}>*</span>
                </label>
                <textarea
                  value={skillInstructions}
                  onChange={(e) => { setSkillInstructions(e.target.value); clearOutcome() }}
                  onKeyDown={handleKeyDown}
                  placeholder={t('skill.instructionsPlaceholder')}
                  disabled={isCreating}
                  rows={10}
                  style={{
                    ...textareaBase,
                    color: '#a5b4fc',
                    fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                    minHeight: 180,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                  {t('skill.instructionsHint')}
                </div>
                {!skillInstructions.trim() && (
                  <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4, lineHeight: 1.5 }}>
                    {t('skill.instructionsRequired')}
                  </div>
                )}
              </div>

              {/* The exact file and destination */}
              <div style={cardStyle}>
                <label style={labelStyle}>{t('skill.previewTitle')}</label>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                  wordBreak: 'break-all',
                }}>
                  {installSlug
                    ? t('skill.previewPath', { path: installPath })
                    : t('skill.previewNoName')}
                </div>
                <pre style={{
                  margin: 0,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  lineHeight: 1.5,
                  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 260,
                  overflow: 'auto',
                }}>{built.content}</pre>
              </div>

              {/* This folder is taken */}
              {isConflict && existing && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: 'rgba(245,158,11,0.10)',
                  border: '1px solid rgba(245,158,11,0.30)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  marginBottom: 12,
                }}>
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#fbbf24' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      {t('skill.existsTitle')}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {t('skill.existsBody', {
                        path: existing.dirPath || installPath,
                      })}
                    </div>
                    {existing.name && (
                      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {t('skill.existsName', { name: existing.name })}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {existing.dirPath && (
                        <button
                          onClick={handleOpenExisting}
                          disabled={isCreating}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px', borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-hover)',
                            color: 'var(--text-primary)',
                            fontSize: 12, fontWeight: 600,
                            cursor: isCreating ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <FolderOpen size={13} />
                          {t('skill.existsOpen')}
                        </button>
                      )}
                      <button
                        onClick={handleReplace}
                        disabled={isCreating}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '6px 12px', borderRadius: 6,
                          border: '1px solid rgba(245,158,11,0.45)',
                          background: 'rgba(245,158,11,0.16)',
                          color: '#fbbf24',
                          fontSize: 12, fontWeight: 600,
                          cursor: isCreating ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <RefreshCw size={13} />
                        {isCreating && isReplacing ? t('skill.replacing') : t('skill.existsReplace')}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                      {t('skill.existsReplaceWarning')}
                    </div>
                  </div>
                </div>
              )}

              {/* Error message */}
              {isError && errorMsg && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#fca5a5',
                  fontSize: 12,
                  marginBottom: 12,
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={handleCancel}
                  disabled={isCreating}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: isCreating ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                    opacity: isCreating ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isCreating) {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.background = 'var(--border)'
                      e.currentTarget.style.color = 'var(--text-primary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.background = 'var(--bg-hover)'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }}
                >
                  {t('skill.cancelCreate')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!canCreate || isConflict}
                  onMouseEnter={() => { if (canCreate && !isConflict) setSubmitHovered(true) }}
                  onMouseLeave={() => setSubmitHovered(false)}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: canCreate && !isConflict ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s ease',
                    opacity: canCreate && !isConflict ? 1 : 0.4,
                    transform: submitHovered && canCreate && !isConflict ? 'translateY(-1px)' : 'translateY(0)',
                    boxShadow: submitHovered && canCreate && !isConflict ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {isCreating ? (
                    <>
                      <span style={{
                        width: 12, height: 12, borderRadius: '50%',
                        border: '2px solid var(--text-faint)',
                        borderTopColor: 'var(--text-primary)',
                        animation: 'spin 0.8s linear infinite',
                        flexShrink: 0,
                      }} />
                      {isReplacing ? t('skill.replacing') : t('skill.creating')}
                    </>
                  ) : (
                    t('skill.confirmCreate')
                  )}
                </button>
              </div>

              {/* Keyboard shortcut hint */}
              <div style={{
                marginTop: 16,
                textAlign: 'right',
                fontSize: 11,
                color: 'var(--text-muted)',
              }}>
                {t('skill.submitHint')}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
