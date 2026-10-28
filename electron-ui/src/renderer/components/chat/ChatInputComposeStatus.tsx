// ChatInput compose status bar — extracted from ChatInput.tsx (Iteration 314)
// Displays word/char/token counts, WPM, calculator result, and input history hint.

import React from 'react'
import { AlertTriangle, Calculator, Clock, MessageCircleQuestion } from 'lucide-react'
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
  // Last `thread/status/changed` report, already reduced by the pure mapper.
  // This line never infers "thinking" from it: only the two waiting flags and
  // the engine's own error produce a chip.
  const threadStatus = useChatStore(s => s.threadStatus)
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

  // A compact "the engine is blocked on you" chip. The text names which kind of
  // request it is; the tooltip says what is expected. The error variant states
  // only that the engine reported an error — `systemError` carries no detail,
  // so no cause is invented.
  const statusChip = threadStatus?.kind === 'waitingApproval'
    ? {
        Icon: Clock,
        label: t('chat.threadStatus.waitingApproval'),
        hint: t('chat.threadStatus.waitingApprovalHint'),
        color: 'rgba(251,191,36,0.92)',
        background: 'rgba(251,191,36,0.10)',
        border: 'rgba(251,191,36,0.25)',
      }
    : threadStatus?.kind === 'waitingInput'
      ? {
          Icon: MessageCircleQuestion,
          label: t('chat.threadStatus.waitingInput'),
          hint: t('chat.threadStatus.waitingInputHint'),
          color: 'rgba(165,180,252,0.92)',
          background: 'rgba(99,102,241,0.10)',
          border: 'rgba(99,102,241,0.25)',
        }
      : threadStatus?.kind === 'error'
        ? {
            Icon: AlertTriangle,
            label: t('chat.threadStatus.error'),
            hint: t('chat.threadStatus.errorHint'),
            color: 'rgba(248,113,113,0.92)',
            background: 'rgba(239,68,68,0.10)',
            border: 'rgba(239,68,68,0.25)',
          }
        : null

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
      {/* Compose status — also the home of the engine's "waiting on you" chip,
          so a user who came back to the window sees the block without a new
          row of chrome. The row exists whenever either signal has something to
          say; an empty composer with no chip keeps it hidden as before. */}
      {(statusChip || trimmed.length > 0) && (
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
          {statusChip && (
            <span
              role="status"
              aria-label={statusChip.hint}
              title={statusChip.hint}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                marginRight: 'auto',
                fontSize: 11, fontWeight: 600,
                color: statusChip.color,
                background: statusChip.background,
                border: `1px solid ${statusChip.border}`,
                borderRadius: 10, padding: '2px 8px',
                whiteSpace: 'nowrap', userSelect: 'none',
              }}
            >
              <statusChip.Icon size={11} />
              {statusChip.label}
            </span>
          )}
          {trimmed.length > 0 && (
            <>
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
      {/* Input history hint — the status chip is more urgent; do not stack a
          second hint row under it. */}
      {input.length === 0 && hasInputHistory && !statusChip && (
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
