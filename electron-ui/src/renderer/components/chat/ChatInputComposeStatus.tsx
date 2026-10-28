// ChatInput compose status bar — extracted from ChatInput.tsx (Iteration 314)
// Displays word/char/token counts, WPM, calculator result, and input history hint.

import React from 'react'
import { Calculator } from 'lucide-react'
import { useT } from '../../i18n'
import { useChatStore, usePrefsStore } from '../../store'
import { personaModelOf, resolveEffectiveModel } from '../../lib/sessionModel'

interface ChatInputComposeStatusProps {
  input: string
  typingWpm: number
  calcResult: string | null
  hasInputHistory: boolean
}

// Codex reports the policy the thread actually runs with. The labels say what
// it does, not whether it is "safe": `never` means the thread asks nothing.
const APPROVAL_LABEL_KEYS: Record<string, string> = {
  untrusted: 'codex.thread.approval.untrusted',
  'on-request': 'codex.thread.approval.onRequest',
  never: 'codex.thread.approval.never',
  // Legacy wire values still emitted by older builds.
  'unless-allow-listed': 'codex.thread.approval.unlessAllowListed',
  always: 'codex.thread.approval.always',
}

const KNOWN_EFFORTS = new Set(['auto', 'low', 'medium', 'high', 'max'])

const SEP = (
  <span style={{
    display: 'inline-block',
    width: 3, height: 3, borderRadius: '50%',
    background: 'var(--border)',
    flexShrink: 0,
  }} />
)

export default function ChatInputComposeStatus({ input, typingWpm, calcResult, hasInputHistory }: ChatInputComposeStatusProps) {
  const t = useT()
  const trimmed = input.trim()

  // What the Codex thread reports (thread/settings/updated). Reported only —
  // this line never writes prefs or changes what a turn sends.
  const threadSettings = useChatStore(s => s.threadSettings)
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const sessionModelOverride = useChatStore(s => s.sessionModelOverride)
  const pickerModel = usePrefsStore(s =>
    resolveEffectiveModel(s.prefs.model, personaModelOf(s.prefs, sessionPersonaId), sessionModelOverride)
  )

  const reportedModel = threadSettings?.model ?? null
  const approvalPolicy = threadSettings?.approvalPolicy ?? null
  const approvalKey = approvalPolicy ? APPROVAL_LABEL_KEYS[approvalPolicy] : undefined
  const approvalLabel = approvalPolicy ? (approvalKey ? t(approvalKey) : approvalPolicy) : null
  const effort = threadSettings?.effort ?? null
  const effortLabel = effort ? (KNOWN_EFFORTS.has(effort) ? t(`effort.${effort}`) : effort) : null
  const modelMismatch = !!reportedModel && !!pickerModel && reportedModel !== pickerModel
  // A settings report whose fields were all null has nothing to say; do not
  // render an empty strip for it.
  const hasThreadLine = !!(reportedModel || approvalLabel || effortLabel)

  const isOverLimit = input.length > 10000
  const isNearLimit = input.length > 5000

  const charColor = isOverLimit ? '#fca5a5' : isNearLimit ? '#fbbf24' : 'var(--text-muted)'

  return (
    <>
      {/* Settings the Codex thread actually runs with. Nothing here is
          interactive: the picker above stays the only way to change a model. */}
      {threadSettings && hasThreadLine && (
        <div
          role="status"
          aria-label={t('codex.thread.settingsAria')}
          style={{
            display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6,
            padding: '2px 12px',
            background: 'var(--glass-bg-mid)',
            borderTop: '1px solid var(--border)',
            lineHeight: 1.5,
          }}
        >
          {reportedModel && (
            <span
              title={reportedModel}
              style={{
                fontSize: 10, color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: 220,
              }}
            >
              {reportedModel}
            </span>
          )}
          {modelMismatch && (
            <span
              aria-label={t('codex.thread.modelMismatch', { running: reportedModel ?? '', picker: pickerModel })}
              title={t('codex.thread.modelMismatch', { running: reportedModel ?? '', picker: pickerModel })}
              style={{
                display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                background: 'var(--warning-text)', flexShrink: 0,
              }}
            />
          )}
          {reportedModel && (approvalLabel || effortLabel) && SEP}
          {approvalLabel && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {approvalLabel}
            </span>
          )}
          {approvalLabel && effortLabel && SEP}
          {effortLabel && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {t('codex.thread.effort', { level: effortLabel })}
            </span>
          )}
        </div>
      )}
      {/* Compose status */}
      {trimmed.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6,
          padding: '3px 12px',
          background: 'var(--glass-bg-mid)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)',
          transition: 'all 0.15s ease',
          lineHeight: 1.5,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
            {trimmed.split(/\s+/).filter(w => w.length > 0).length} {t('chat.words')}
          </span>
          {SEP}
          <span style={{ fontSize: 10, color: charColor, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', fontWeight: isOverLimit ? 600 : 400 }}>
            {input.length.toLocaleString()} {t('chat.chars')}{isOverLimit ? ` (${t('chat.veryLong')})` : isNearLimit ? ` (${t('chat.long')})` : ''}
          </span>
          {SEP}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
            {t('message.approxTokens', { count: String(Math.ceil(input.length / 4)) })}
          </span>
          {typingWpm > 0 && (
            <>
              {SEP}
              <span style={{ fontSize: 10, color: typingWpm > 60 ? 'rgba(165,180,252,0.60)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                {typingWpm} {t('chat.wpm')}
              </span>
            </>
          )}
        </div>
      )}
      {/* Inline calculator result */}
      {calcResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px',
          background: 'var(--glass-bg-mid)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)',
        }}>
          <Calculator size={13} style={{ color: '#a5b4fc', opacity: 0.8 }} />
          <span style={{ fontSize: 11, color: '#a5b4fc', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>= {calcResult}</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>{t('chat.calcTabHint')}</span>
        </div>
      )}
      {/* Input history hint */}
      {input.length === 0 && hasInputHistory && (
        <div style={{
          display: 'flex', justifyContent: 'center', padding: '3px 12px',
          background: 'var(--glass-bg-mid)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('chat.inputHistoryHint')}</span>
        </div>
      )}
    </>
  )
}
