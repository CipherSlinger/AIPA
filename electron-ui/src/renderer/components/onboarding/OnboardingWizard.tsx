import React, { useState } from 'react'
import { Sparkles, Key, ChevronLeft, ArrowRight, Check } from 'lucide-react'
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
    // Sync apiKey / token / baseUrl to the claude-cli provider config so the Providers page shows them
    if (apiKey.trim() || token.trim() || baseUrl.trim()) {
      const configs = await window.electronAPI.providerListConfigs()
      const claudeCli = configs.find((c: any) => c.id === 'claude-cli')
      const providerEntry = claudeCli ?? {
        id: 'claude-cli',
        name: 'Claude CLI',
        enabled: true,
        apiKey: '',
        authToken: '',
        baseUrl: '',
      }
      const updated = {
        ...providerEntry,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(token.trim() ? { authToken: token.trim() } : {}),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        // Infer scenario: gateway when token or baseUrl is provided (takes precedence over apiKey)
        scenario: (token.trim() || baseUrl.trim()) ? 'gateway' : 'official',
        enabled: true,
      }
      await window.electronAPI.providerUpsert(updated)
    }
    await window.electronAPI.prefsSet('onboardingDone', true)
    onComplete()
  }

  const handleSkip = async () => {
    await window.electronAPI.prefsSet('onboardingDone', true)
    onComplete()
  }

  const StepIcon = STEP_ICONS[step - 1]
  const iconColor = '#818cf8'
  // Step 2 is valid when either API key or auth token is filled
  const step2Valid = apiKey.trim().length > 0 || token.trim().length > 0

  return (
    <div style={styles.overlay}>
      <style>{`
        @keyframes onboard-fadeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .onboard-card-enter {
          animation: onboard-fadeIn 0.15s ease both;
        }
        @keyframes onboard-icon-pop {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        .onboard-icon {
          animation: onboard-icon-pop 0.15s ease both;
        }
        @keyframes onboard-step-in {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .onboard-step-content {
          animation: onboard-step-in 0.15s ease both;
        }
      `}</style>
      <div style={styles.card} className="onboard-card-enter">

        {/* Step disc indicators */}
        <div style={styles.stepsIndicator}>
          {[1, 2].map((s) => {
            const isActive = step === s
            const isDone   = step > s
            return (
              <React.Fragment key={s}>
                <div style={{
                  ...styles.stepDisc,
                  background: isDone
                    ? 'rgba(74,222,128,0.85)'
                    : isActive
                      ? 'rgba(99,102,241,0.85)'
                      : 'rgba(255,255,255,0.15)',
                  boxShadow: isActive
                    ? '0 0 0 3px rgba(99,102,241,0.20)'
                    : isDone
                      ? '0 0 0 3px rgba(74,222,128,0.15)'
                      : 'none',
                  transform: isActive ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.15s ease',
                }}>
                  {isDone
                    ? <Check size={10} color="rgba(0,0,0,0.75)" strokeWidth={3} />
                    : <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)' }}>{s}</span>
                  }
                </div>
                {s < 2 && (
                  <div style={{
                    ...styles.stepConnector,
                    background: step > s ? 'rgba(99,102,241,0.50)' : 'rgba(255,255,255,0.10)',
                    transition: 'all 0.15s ease',
                  }} />
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* Step labels */}
        <div style={styles.stepLabelsRow}>
          {[1, 2].map((s) => {
            const isActive = step === s
            const isDone   = step > s
            return (
              <span key={s} style={{
                fontSize: 9,
                fontWeight: isActive ? 700 : 500,
                color: isActive
                  ? '#818cf8'
                  : isDone
                    ? 'rgba(255,255,255,0.60)'
                    : 'rgba(255,255,255,0.38)',
                transition: 'all 0.15s ease',
                letterSpacing: '0.04em',
              }}>
                {s === 1 ? t('onboarding.getStarted') : t('onboarding.enterApiKey')}
              </span>
            )
          })}
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
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.filter = 'brightness(1.08)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.filter = 'none'
              }}
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
                  borderColor: inputFocused === 'apiKey' ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.09)',
                  boxShadow: inputFocused === 'apiKey' ? 'rgba(99,102,241,0.50) 0 0 0 2px' : 'none',
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
                  borderColor: inputFocused === 'token' ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.09)',
                  boxShadow: inputFocused === 'token' ? 'rgba(99,102,241,0.50) 0 0 0 2px' : 'none',
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
                  borderColor: inputFocused === 'baseUrl' ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.09)',
                  boxShadow: inputFocused === 'baseUrl' ? 'rgba(99,102,241,0.50) 0 0 0 2px' : 'none',
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
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
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
                onMouseEnter={e => {
                  if (step2Valid) {
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.filter = 'brightness(1.08)'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.filter = 'none'
                }}
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
    background: 'rgba(0,0,0,0.80)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: 'rgba(15,15,25,0.96)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    width: '100%',
    maxWidth: '520px',
    padding: '40px 40px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0',
    boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
  },
  stepsIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    marginBottom: 6,
  },
  stepDisc: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepConnector: {
    width: 32,
    height: 2,
    borderRadius: 1,
    margin: '0 4px',
  },
  stepLabelsRow: {
    display: 'flex',
    gap: 44,
    marginBottom: 24,
    paddingLeft: 2,
  },
  iconCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'rgba(99,102,241,0.12)',
    border: '1px solid rgba(99,102,241,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
    boxShadow: '0 0 24px rgba(99,102,241,0.15)',
  },
  stepContent: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    margin: 0,
    letterSpacing: '-0.01em',
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    lineHeight: 1.6,
    margin: 0,
    maxWidth: '360px',
  },
  explanation: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    lineHeight: 1.6,
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
    fontSize: 10,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: '0.07em',
    textTransform: 'uppercase' as const,
  },
  fieldHint: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.38)',
    lineHeight: '1.5',
  },
  input: {
    width: '100%',
    height: '42px',
    padding: '0 14px',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 8,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'monospace',
    transition: 'all 0.15s ease',
    boxSizing: 'border-box' as const,
  },
  link: {
    fontSize: '12px',
    color: 'rgba(99,102,241,0.9)',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  folderDisplay: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 8,
  },
  folderPath: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.60)',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  primaryBtn: {
    padding: '10px 28px',
    height: '42px',
    background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
    color: 'rgba(255,255,255,0.82)',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    minWidth: '140px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    padding: '0 20px',
    height: '42px',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.60)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 8,
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtn: {
    padding: '0 20px',
    height: '38px',
    background: 'transparent',
    color: 'rgba(99,102,241,0.9)',
    border: '1px solid rgba(99,102,241,0.45)',
    borderRadius: 10,
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
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
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.38)',
    fontSize: 12,
    cursor: 'pointer',
    marginTop: '4px',
    transition: 'all 0.15s ease',
  },
}
