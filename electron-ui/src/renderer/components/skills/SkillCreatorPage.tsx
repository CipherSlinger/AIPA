// SkillCreatorPage — full-page form for creating a new skill (Iteration 535)
// Renders in the main view area when mainView === 'skill-creator'
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { ArrowLeft, Puzzle, CheckCircle, AlertCircle } from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'

type CreationState = 'idle' | 'creating' | 'success' | 'error'

export default function SkillCreatorPage() {
  const t = useT()
  const setMainView = useUiStore(s => s.setMainView)
  const addToast = useUiStore(s => s.addToast)

  const [skillName, setSkillName] = useState('')
  const [skillDesc, setSkillDesc] = useState('')
  const [creationState, setCreationState] = useState<CreationState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [submitHovered, setSubmitHovered] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // Focus name field on mount
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const handleCancel = useCallback(() => {
    setMainView('chat')
  }, [setMainView])

  const handleCreate = useCallback(async () => {
    const trimmedName = skillName.trim()
    const trimmedDesc = skillDesc.trim()

    if (!trimmedName) {
      nameRef.current?.focus()
      return
    }
    if (!trimmedDesc) return

    setCreationState('creating')
    setErrorMsg('')

    // Build SKILL.md content with YAML frontmatter
    const skillContent = `---
name: "${trimmedName}"
description: "${trimmedDesc.replace(/"/g, '\\"').split('\n')[0].slice(0, 120)}"
---

${trimmedDesc}
`

    try {
      const result = await window.electronAPI.skillsInstall({
        name: trimmedName,
        content: skillContent,
      })

      if (result?.success) {
        setCreationState('success')
        addToast('success', t('skill.createSuccess'))
        // Auto-navigate back to chat after brief success display
        setTimeout(() => {
          setMainView('chat')
        }, 1500)
      } else {
        setCreationState('error')
        setErrorMsg(result?.error || t('skill.createFailed'))
      }
    } catch (err) {
      setCreationState('error')
      setErrorMsg(String(err))
    }
  }, [skillName, skillDesc, addToast, t, setMainView])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleCreate()
    }
  }, [handleCreate])

  const isCreating = creationState === 'creating'
  const isSuccess = creationState === 'success'
  const isError = creationState === 'error'
  const canCreate = skillName.trim().length > 0 && skillDesc.trim().length > 0 && !isCreating && !isSuccess

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'rgba(10,10,18,1)',
    }}>
      {/* Header */}
      <div style={{
        height: 44,
        background: 'rgba(15,15,25,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
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
            color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center',
            padding: '5px', borderRadius: 6, transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.88)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <Puzzle size={16} style={{ color: '#818cf8', flexShrink: 0 }} />
        <span style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.9)', flex: 1, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
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
              color: 'rgba(255,255,255,0.45)',
            }}>
              <CheckCircle size={48} style={{ color: '#4ade80' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
                {t('skill.createSuccess')}
              </span>
              <span style={{ fontSize: 12, opacity: 0.7 }}>{t('skill.redirecting')}</span>
            </div>
          )}

          {!isSuccess && (
            <>
              {/* Skill Name section */}
              <div style={{
                background: 'rgba(15,15,25,0.90)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '16px 20px',
                marginBottom: 12,
              }}>
                <label style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.38)',
                  marginBottom: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}>
                  {t('skill.nameLabel')}
                  <span style={{ color: '#818cf8', marginLeft: 4 }}>*</span>
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('skill.namePlaceholder')}
                  disabled={isCreating}
                  maxLength={60}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.10)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.82)',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                    opacity: isCreating ? 0.6 : 1,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
                />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 4, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                  {skillName.trim().length}/60
                </div>
              </div>

              {/* Description / System Prompt section */}
              <div style={{
                background: 'rgba(15,15,25,0.90)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '16px 20px',
                marginBottom: 12,
              }}>
                <label style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.38)',
                  marginBottom: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}>
                  {t('skill.descLabel')}
                  <span style={{ color: '#818cf8', marginLeft: 4 }}>*</span>
                </label>
                <textarea
                  value={skillDesc}
                  onChange={(e) => setSkillDesc(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('skill.descPlaceholder')}
                  disabled={isCreating}
                  rows={10}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.10)',
                    background: 'rgba(8,8,16,1)',
                    color: '#a5b4fc',
                    fontSize: 12,
                    fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                    outline: 'none',
                    resize: 'vertical',
                    lineHeight: 1.5,
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s ease',
                    opacity: isCreating ? 0.6 : 1,
                    minHeight: 160,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
                />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 4 }}>
                  {t('skill.descHint')}
                </div>
              </div>

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
                    border: '1px solid rgba(255,255,255,0.10)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.55)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: isCreating ? 'not-allowed' : 'pointer',
                    transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                    opacity: isCreating ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isCreating) {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
                      e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                      e.currentTarget.style.color = 'rgba(255,255,255,0.80)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
                  }}
                >
                  {t('skill.cancelCreate')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!canCreate}
                  onMouseEnter={() => { if (canCreate) setSubmitHovered(true) }}
                  onMouseLeave={() => setSubmitHovered(false)}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                    color: 'rgba(255,255,255,0.95)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: canCreate ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s ease',
                    opacity: canCreate ? 1 : 0.4,
                    transform: submitHovered && canCreate ? 'translateY(-1px)' : 'translateY(0)',
                    boxShadow: submitHovered && canCreate ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {isCreating ? (
                    <>
                      <span style={{
                        width: 12, height: 12, borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: 'rgba(255,255,255,0.95)',
                        animation: 'spin 0.8s linear infinite',
                        flexShrink: 0,
                      }} />
                      {t('skill.creating')}
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
                color: 'rgba(255,255,255,0.38)',
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
