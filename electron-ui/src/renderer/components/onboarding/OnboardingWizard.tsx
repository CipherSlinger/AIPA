import React, { useState } from 'react'
import { Sparkles, Key, ChevronLeft, ArrowRight } from 'lucide-react'
import { useT } from '../../i18n'

interface OnboardingWizardProps {
  onComplete: () => void
}

const STEP_ICONS = [Sparkles, Key] as const

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [apiKey, setApiKey] = useState('')
  const [token, setToken] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [inputFocused, setInputFocused] = useState<string | null>(null)
  const t = useT()

  const handleComplete = async () => {
    if (apiKey.trim()) {
      await window.electronAPI.configSetApiKey(apiKey)
    }
    // If token or baseUrl was provided, update the claude-cli provider config
    if (token.trim() || baseUrl.trim()) {
      const configs: Array<{
        id: string
        name: string
        scenario: string
        baseUrl?: string
        apiKey?: string
        authToken?: string
        models: unknown[]
        enabled: boolean
        isDefault?: boolean
        failoverPriority?: number
      }> = await window.electronAPI.providerListConfigs()
      const claudeCli = configs.find((c) => c.id === 'claude-cli')
      if (claudeCli) {
        const updated = {
          ...claudeCli,
          authToken: token.trim() || claudeCli.authToken,
          baseUrl: baseUrl.trim() || claudeCli.baseUrl,
        }
        await window.electronAPI.providerUpsert(updated)
      }
    }
    await window.electronAPI.prefsSet('onboardingDone', true)
    onComplete()
  }

  const handleSkip = async () => {
    await window.electronAPI.prefsSet('onboardingDone', true)
    onComplete()
  }

  const StepIcon = STEP_ICONS[step - 1]
  const iconColor = 'var(--accent)'
  const progressWidth = `${((step) / 2) * 100}%`
  // Step 2 is valid when either API key or auth token is filled
  const step2Valid = apiKey.trim().length > 0 || token.trim().length > 0

  return (
    <div style={styles.overlay}>
      <div style={styles.card} className="popup-enter">
        {/* Progress bar */}
        <div style={styles.progressContainer}>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: progressWidth }} />
          </div>
          <div style={styles.progressLabel}>{t('onboarding.step', { current: step, total: 2 })}</div>
        </div>

        {/* Step icon */}
        <div className="onboard-icon" key={`icon-${step}`} style={styles.iconCircle}>
          <StepIcon size={48} color={iconColor} strokeWidth={1.5} />
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="onboard-step-content" key="step1" style={styles.stepContent}>
            <h1 style={styles.title}>{t('onboarding.welcome')}</h1>
            <p style={styles.subtitle}>
              {t('onboarding.welcomeSubtitle')}
            </p>
            <button
              style={styles.primaryBtn}
              onClick={() => setStep(2)}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.filter = 'brightness(1.1)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'none' }}
            >
              {t('onboarding.getStarted')} <ArrowRight size={16} style={{ marginLeft: 6, verticalAlign: 'middle' }} />
            </button>
          </div>
        )}

        {/* Step 2: API Key + Token + Base URL */}
        {step === 2 && (
          <div className="onboard-step-content" key="step2" style={styles.stepContent}>
            <h1 style={styles.title}>{t('onboarding.enterApiKey')}</h1>
            <p style={styles.explanation}>
              {t('onboarding.apiKeyStored')}
            </p>

            {/* API Key */}
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>{t('onboarding.apiKeyLabel')}</label>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{
                  ...styles.input,
                  borderColor: inputFocused === 'apiKey' ? 'var(--input-field-focus)' : 'var(--input-field-border)',
                  boxShadow: inputFocused === 'apiKey' ? 'var(--input-focus-shadow)' : 'none',
                }}
                onFocus={() => setInputFocused('apiKey')}
                onBlur={() => setInputFocused(null)}
                autoFocus
              />
            </div>

            {/* Token */}
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>{t('onboarding.tokenLabel')}</label>
              <input
                type="password"
                placeholder={t('onboarding.tokenPlaceholder')}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                style={{
                  ...styles.input,
                  borderColor: inputFocused === 'token' ? 'var(--input-field-focus)' : 'var(--input-field-border)',
                  boxShadow: inputFocused === 'token' ? 'var(--input-focus-shadow)' : 'none',
                }}
                onFocus={() => setInputFocused('token')}
                onBlur={() => setInputFocused(null)}
              />
              <span style={styles.fieldHint}>{t('onboarding.tokenHint')}</span>
            </div>

            {/* Base URL */}
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>{t('onboarding.baseUrlLabel')}</label>
              <input
                type="text"
                placeholder={t('onboarding.baseUrlPlaceholder')}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                style={{
                  ...styles.input,
                  borderColor: inputFocused === 'baseUrl' ? 'var(--input-field-focus)' : 'var(--input-field-border)',
                  boxShadow: inputFocused === 'baseUrl' ? 'var(--input-focus-shadow)' : 'none',
                  fontFamily: 'monospace',
                }}
                onFocus={() => setInputFocused('baseUrl')}
                onBlur={() => setInputFocused(null)}
              />
              <span style={styles.fieldHint}>{t('onboarding.baseUrlHint')}</span>
            </div>

            <a
              href="#"
              style={styles.link}
              onClick={(e) => {
                e.preventDefault()
                window.open('https://console.anthropic.com', '_blank')
              }}
              onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
            >
              {t('onboarding.getApiKey')}
            </a>
            <div style={styles.btnRow}>
              <button
                style={styles.secondaryBtn}
                onClick={() => setStep(1)}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <ChevronLeft size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> {t('onboarding.back')}
              </button>
              <button
                style={{
                  ...styles.primaryBtn,
                  opacity: step2Valid ? 1 : 0.4,
                  cursor: step2Valid ? 'pointer' : 'not-allowed',
                }}
                onClick={() => step2Valid && handleComplete()}
                disabled={!step2Valid}
                onMouseEnter={e => { if (step2Valid) { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.filter = 'brightness(1.1)' } }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'none' }}
              >
                {t('onboarding.startChatting')} <ArrowRight size={16} style={{ marginLeft: 6, verticalAlign: 'middle' }} />
              </button>
            </div>
            <button
              onClick={handleSkip}
              style={styles.skipBtn}
              onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
            >
              {t('onboarding.skipConfig')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.85)',
    backgroundImage: 'radial-gradient(ellipse at center, rgba(0,122,204,0.05) 0%, transparent 70%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: 'var(--popup-bg)',
    border: '1px solid var(--popup-border)',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '520px',
    padding: '48px 40px 36px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0',
    boxShadow: 'var(--popup-shadow), 0 0 80px rgba(0,122,204,0.08)',
  },
  progressContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '32px',
    width: '200px',
  },
  progressTrack: {
    width: '100%',
    height: '4px',
    borderRadius: '2px',
    background: 'var(--border)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
    borderRadius: '2px',
    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  progressLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    letterSpacing: '0.03em',
  },
  iconCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'rgba(0,122,204,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  stepContent: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--text-bright)',
    textAlign: 'center',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: '1.7',
    margin: 0,
    maxWidth: '360px',
  },
  explanation: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: '1.7',
    margin: 0,
    maxWidth: '360px',
  },
  fieldGroup: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  fieldHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
    opacity: 0.8,
  },
  input: {
    width: '100%',
    height: '42px',
    padding: '0 14px',
    background: 'var(--input-field-bg)',
    border: '1px solid var(--input-field-border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'monospace',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box' as const,
  },
  link: {
    fontSize: '12px',
    color: 'var(--accent)',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'text-decoration 0.15s',
  },
  folderDisplay: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    background: 'var(--input-field-bg)',
    border: '1px solid var(--input-field-border)',
    borderRadius: '8px',
  },
  folderPath: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  primaryBtn: {
    padding: '0 28px',
    height: '42px',
    background: 'var(--accent)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.15s, filter 0.15s, background 0.15s',
    minWidth: '140px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    padding: '0 20px',
    height: '42px',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--popup-border)',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'color 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtn: {
    padding: '0 20px',
    height: '38px',
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: '4px',
  },
  skipBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '11px',
    cursor: 'pointer',
    marginTop: '4px',
    transition: 'text-decoration 0.15s',
  },
}
