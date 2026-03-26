import React, { useState } from 'react'

interface OnboardingWizardProps {
  onComplete: () => void
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [apiKey, setApiKey] = useState('')
  const [workDir, setWorkDir] = useState(() => {
    // Will be overridden after mount if needed, default placeholder
    return '~/claude'
  })

  const handlePickFolder = async () => {
    const p = await window.electronAPI.fsShowOpenDialog()
    if (p) setWorkDir(p)
  }

  const handleComplete = async () => {
    await window.electronAPI.configSetApiKey(apiKey)
    await window.electronAPI.prefsSet('workingDir', workDir)
    await window.electronAPI.prefsSet('onboardingDone', true)
    onComplete()
  }

  const handleSkip = async () => {
    await window.electronAPI.prefsSet('onboardingDone', true)
    onComplete()
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Step indicators */}
        <div style={styles.stepDots}>
          {([1, 2, 3, 4] as const).map((s) => (
            <div
              key={s}
              style={{
                ...styles.dot,
                background: s === step ? 'var(--accent)' : 'var(--border)',
              }}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div style={styles.stepContent}>
            <div style={styles.emoji}>🤖</div>
            <h1 style={styles.title}>Welcome to AIPA</h1>
            <p style={styles.subtitle}>
              Your AI assistant, ready to help with coding, analysis, and more.
            </p>
            <button style={styles.primaryBtn} onClick={() => setStep(2)}>
              Get Started
            </button>
          </div>
        )}

        {/* Step 2: API Key */}
        {step === 2 && (
          <div style={styles.stepContent}>
            <h1 style={styles.title}>Enter Your API Key</h1>
            <p style={styles.explanation}>
              Claude needs an API key to work. Your key is stored locally on your machine and never uploaded anywhere.
            </p>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={styles.input}
              autoFocus
            />
            <a
              href="#"
              style={styles.link}
              onClick={(e) => {
                e.preventDefault()
                window.open('https://console.anthropic.com', '_blank')
              }}
            >
              Don't have a key? Get one free at console.anthropic.com
            </a>
            <div style={styles.btnRow}>
              <button style={styles.secondaryBtn} onClick={() => setStep(1)}>
                Back
              </button>
              <button
                style={{
                  ...styles.primaryBtn,
                  opacity: apiKey.trim() ? 1 : 0.4,
                  cursor: apiKey.trim() ? 'pointer' : 'not-allowed',
                }}
                onClick={() => apiKey.trim() && setStep(3)}
                disabled={!apiKey.trim()}
              >
                Next
              </button>
            </div>
            <button
              onClick={handleSkip}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', marginTop: 4 }}
            >
              Skip, configure later in Settings
            </button>
          </div>
        )}

        {/* Step 3: Work Folder */}
        {step === 3 && (
          <div style={styles.stepContent}>
            <h1 style={styles.title}>Choose Working Folder</h1>
            <p style={styles.explanation}>
              Claude will read and write files in this folder. You can change it anytime in Settings.
            </p>
            <div style={styles.folderDisplay}>
              <span style={styles.folderIcon}>📁</span>
              <span style={styles.folderPath}>{workDir}</span>
            </div>
            <button style={styles.outlineBtn} onClick={handlePickFolder}>
              Choose Folder
            </button>
            <div style={styles.btnRow}>
              <button style={styles.secondaryBtn} onClick={() => setStep(2)}>
                Back
              </button>
              <button style={styles.primaryBtn} onClick={() => setStep(4)}>
                Finish Setup
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div style={styles.stepContent}>
            <div style={styles.emoji}>✅</div>
            <h1 style={styles.title}>All Set!</h1>
            <p style={styles.subtitle}>You're ready to start chatting with Claude</p>
            <button style={styles.primaryBtn} onClick={handleComplete}>
              Start Chatting
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '480px',
    padding: '40px 36px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
  },
  stepDots: {
    display: 'flex',
    gap: '8px',
    marginBottom: '32px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    transition: 'background 0.2s',
  },
  stepContent: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  emoji: {
    fontSize: '56px',
    lineHeight: '1',
    marginBottom: '4px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '600',
    color: 'var(--text-bright)',
    textAlign: 'center',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: '1.6',
    margin: 0,
  },
  explanation: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: '1.6',
    margin: 0,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'monospace',
  },
  link: {
    fontSize: '12px',
    color: 'var(--accent)',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  folderDisplay: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
  },
  folderIcon: {
    fontSize: '16px',
    flexShrink: 0,
  },
  folderPath: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  primaryBtn: {
    padding: '10px 28px',
    background: 'var(--accent)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.15s',
    minWidth: '120px',
  },
  secondaryBtn: {
    padding: '10px 20px',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
  outlineBtn: {
    padding: '8px 20px',
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  btnRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: '4px',
  },
}
