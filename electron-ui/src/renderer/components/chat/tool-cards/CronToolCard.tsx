import React, { useState } from 'react'
import { Clock, X } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CronJob {
  id?: string
  trigger_id?: string
  cron?: string
  schedule?: string
  prompt?: string
  description?: string
  status?: string
  recurring?: boolean
  durable?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Parse CronList result: JSON array of cron job descriptors */
export function parseCronJobs(raw: string): CronJob[] | null {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as CronJob[]
  } catch { /* noop */ }
  return null
}

// ── Component ──────────────────────────────────────────────────────────────────

/** CronCard — input/result display for CronCreate, CronDelete, CronList */
export function CronCard({
  mode,
  input,
  resultText,
  isResult,
}: {
  mode: 'create' | 'delete' | 'list'
  input: Record<string, unknown>
  resultText?: string
  isResult?: boolean
}) {
  const [promptExpanded, setPromptExpanded] = useState(false)

  // ── CronCreate result ─────────────────────────────────────────
  if (mode === 'create' && isResult) {
    const jobId = typeof input.trigger_id === 'string' ? input.trigger_id
      : typeof input.id === 'string' ? input.id
      : resultText?.trim() ?? ''
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 9px', borderRadius: 8,
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.28)',
          color: '#4ade80', fontSize: 11, fontWeight: 600,
        }}>
          <Clock size={11} style={{ flexShrink: 0 }} />
          Scheduled
        </div>
        {jobId && (
          <span style={{
            fontSize: 11, fontFamily: 'monospace',
            padding: '2px 7px', borderRadius: 6,
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
            color: '#a5b4fc',
          }}>
            {jobId}
          </span>
        )}
      </div>
    )
  }

  // ── CronCreate input ──────────────────────────────────────────
  if (mode === 'create') {
    const cron = typeof input.cron === 'string' ? input.cron : ''
    const prompt = typeof input.prompt === 'string' ? input.prompt : ''
    const recurring = input.recurring !== false // default true
    const durable = !!input.durable
    const PROMPT_LIMIT = 100
    const needsExpand = prompt.length > PROMPT_LIMIT
    const displayPrompt = needsExpand && !promptExpanded ? prompt.slice(0, PROMPT_LIMIT) + '\u2026' : prompt

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Cron expression chip */}
        {cron && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={11} style={{ color: 'rgba(165,180,252,0.7)', flexShrink: 0 }} />
            <span style={{
              fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
              padding: '2px 8px', borderRadius: 6,
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
              color: '#a5b4fc',
            }}>
              {cron}
            </span>
          </div>
        )}

        {/* Prompt preview */}
        {prompt && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {displayPrompt}
            {needsExpand && (
              <button
                onClick={() => setPromptExpanded(v => !v)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#a5b4fc', fontSize: 10, padding: '0 4px', marginLeft: 2,
                }}
              >
                {promptExpanded ? 'less' : 'more'}
              </button>
            )}
          </div>
        )}

        {/* Badges row */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            padding: '2px 7px', borderRadius: 8,
            background: recurring ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)',
            border: recurring ? '1px solid rgba(34,197,94,0.28)' : '1px solid rgba(59,130,246,0.28)',
            color: recurring ? '#4ade80' : '#93c5fd',
          }}>
            {recurring ? 'recurring' : 'one-shot'}
          </span>
          {durable && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 8,
              background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.28)',
              color: '#c084fc',
            }}>
              persistent
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── CronDelete input ──────────────────────────────────────────
  if (mode === 'delete') {
    const jobId = typeof input.trigger_id === 'string' ? input.trigger_id
      : typeof input.id === 'string' ? input.id
      : ''
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
          padding: '2px 7px', borderRadius: 8,
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)',
          color: '#fca5a5',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <X size={9} style={{ flexShrink: 0 }} />
          Delete
        </span>
        {jobId && (
          <span style={{
            fontSize: 11, fontFamily: 'monospace',
            padding: '2px 7px', borderRadius: 6,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)',
            color: '#fca5a5',
          }}>
            {jobId}
          </span>
        )}
      </div>
    )
  }

  // ── CronList result ───────────────────────────────────────────
  if (mode === 'list' && isResult && resultText) {
    const jobs = parseCronJobs(resultText)
    if (jobs && jobs.length > 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {jobs.slice(0, 20).map((job, i) => {
            const cronExpr = job.cron ?? job.schedule ?? ''
            const promptText = job.prompt ?? job.description ?? ''
            const status = job.status ?? 'active'
            const jobId = job.id ?? job.trigger_id ?? ''
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  padding: '4px 6px', borderRadius: 6,
                  background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.16)',
                }}
              >
                {cronExpr && (
                  <span style={{
                    fontSize: 10, fontFamily: 'monospace',
                    padding: '1px 5px', borderRadius: 4,
                    background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.28)',
                    color: '#a5b4fc', flexShrink: 0,
                  }}>
                    {cronExpr}
                  </span>
                )}
                {promptText && (
                  <span
                    style={{
                      fontSize: 11, color: 'var(--text-secondary)', flex: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                    title={promptText}
                  >
                    {promptText.length > 40 ? promptText.slice(0, 40) + '\u2026' : promptText}
                  </span>
                )}
                {jobId && !promptText && (
                  <span style={{
                    fontSize: 10, fontFamily: 'monospace', color: 'rgba(165,180,252,0.6)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 180,
                  }}>
                    {jobId}
                  </span>
                )}
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  padding: '1px 5px', borderRadius: 5,
                  background: status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.15)',
                  border: status === 'active' ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(100,116,139,0.25)',
                  color: status === 'active' ? '#4ade80' : '#94a3b8',
                  flexShrink: 0,
                }}>
                  {status}
                </span>
              </div>
            )
          })}
          {jobs.length > 20 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 4 }}>
              +{jobs.length - 20} more
            </span>
          )}
        </div>
      )
    }
    // Empty list
    return (
      <div style={{
        fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Clock size={11} style={{ opacity: 0.5 }} />
        No scheduled jobs
      </div>
    )
  }

  return null
}
