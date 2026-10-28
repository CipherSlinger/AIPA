// TurnDiffCard — Codex's aggregate diff for the turn (`turn/diff/updated`).
//
// Mounted by ChatPanel as a sibling *after* MessageList, never inside the
// transcript: the message list owns scroll anchoring and virtualization, and a
// card growing underneath the last message would move its anchor.
//
// The diff is authoritative in a way the per-tool cards are not — it includes
// changes made by shell commands, which never pass through a file-edit tool.
//
// It is also a snapshot: once the turn ends, the disk can move on. The card
// therefore stats the files it names (size + mtime only) and says, per file,
// whether it has changed since the snapshot. Files whose folder is not watched
// stay `unchecked`; they are never presented as fresh.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Copy, RefreshCw } from 'lucide-react'
import { useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import {
  classifyTurnDiff,
  splitTurnDiff,
  summarizeTurnDiff,
  type TurnDiffLineKind,
} from '../../utils/turnDiff'
import {
  affectedDirectories,
  canonicalWatchPath,
  type FsWatchStateLike,
} from '../filebrowser/watchModel'
import {
  collectDiffDirectories,
  decideTurnDiffDrift,
  diffPathDirectory,
  driftChipKey,
  driftSummaryLine,
  driftUncheckedLine,
  extractTurnDiffPaths,
  type TurnDiffDriftState,
  type TurnDiffStatResult,
} from './turnDiffDrift'

/** At most this many lines reach the DOM until the user asks for the rest. */
const MAX_RENDERED_LINES = 400

/** Mirrors the main-process ceiling; extra paths would only be reported back. */
const MAX_STAT_PATHS = 256

/** Stable empty list, so a stale-stat render does not allocate a new dependency. */
const NO_STATS: TurnDiffStatResult[] = []

/**
 * Identity of one diff snapshot. A stat result may only support a claim about
 * the snapshot it was fetched for; this key gates that. The bounded diff is too
 * large to use directly as a state key on every render, so its length, receipt
 * time and a cheap hash stand in for it.
 */
function diffScopeOf(update: {
  sessionId: string
  turnId: string | null
  capturedAt: number | null
  diff: string
} | null): string {
  if (!update) return ''
  let hash = 5381
  for (let i = 0; i < update.diff.length; i++) {
    hash = ((hash << 5) + hash + update.diff.charCodeAt(i)) | 0
  }
  return `${update.sessionId}\u0000${update.turnId ?? ''}\u0000${update.capturedAt ?? ''}\u0000${update.diff.length}\u0000${hash}`
}

const LINE_COLOR: Record<TurnDiffLineKind, string> = {
  add: 'var(--success-text)',
  del: 'var(--danger-text)',
  hunk: 'var(--text-faint)',
  meta: 'var(--text-faint)',
  context: 'var(--text-muted)',
}

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

function chipStyle(
  state: Exclude<TurnDiffDriftState, 'unchecked'>,
  expectedGone: boolean,
): React.CSSProperties {
  // A deletion or rename source is supposed to be gone; its chip informs but
  // must not look like the warning used for actual drift.
  const warning = state === 'changed' || (state === 'missing' && !expectedGone)
  return {
    flexShrink: 0,
    fontSize: 9,
    lineHeight: '15px',
    padding: '0 5px',
    borderRadius: 999,
    border: `1px solid ${warning ? 'var(--warning-text)' : 'var(--text-faint)'}`,
    color: warning ? 'var(--warning-text)' : 'var(--text-faint)',
    opacity: warning ? 1 : 0.75,
    whiteSpace: 'nowrap',
  }
}

export default function TurnDiffCard() {
  const t = useT()
  const turnDiff = useChatStore(s => s.turnDiff)
  // While the turn is still writing, the diff is a moving target: a file the
  // agent writes a second later would read as "changed on disk since this
  // turn". Nothing is claimed — and nothing is watched or stat'ed — until the
  // turn ends and the capture time is re-stamped.
  const turnActive = useChatStore(s => s.messages.some(
    m => (m as { isStreaming?: boolean }).isStreaming === true,
  ))
  const [expanded, setExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const bodyId = React.useId()

  const diffText = turnDiff?.diff ?? ''
  const cwd = turnDiff?.cwd ?? null
  const capturedAt = turnDiff?.capturedAt ?? null
  const lines = useMemo(() => splitTurnDiff(diffText), [diffText])
  const kinds = useMemo(() => classifyTurnDiff(diffText), [diffText])
  const stats = useMemo(() => summarizeTurnDiff(diffText), [diffText])

  const driftPaths = useMemo(() => extractTurnDiffPaths(diffText, cwd), [diffText, cwd])
  const diffDirs = useMemo(() => collectDiffDirectories(driftPaths), [driftPaths])
  // `diffDirs` is a fresh array whenever the diff text changes. Split/join by a
  // key so the subscription effect only reruns when the *set* of folders does.
  const dirsKey = diffDirs.join('\u0000')
  const stableDirs = useMemo(() => (dirsKey ? dirsKey.split('\u0000') : []), [dirsKey])

  const subscriberIdRef = useRef(`td-${Math.random().toString(36).slice(2, 10)}`)
  const [watchState, setWatchState] = useState<FsWatchStateLike | null>(null)
  const [statResults, setStatResults] = useState<TurnDiffStatResult[]>([])
  const [statScope, setStatScope] = useState('')
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'done'>('idle')
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [resubscribeNonce, setResubscribeNonce] = useState(0)

  const diffScope = useMemo(() => diffScopeOf(turnDiff), [turnDiff])

  const hasTurnDiff = turnDiff != null
  const hasPaths = driftPaths.length > 0
  // A malformed timestamp is as unusable as a missing one: no file may be
  // judged against a capture time that is not a real moment.
  const canCheck = !turnActive && typeof capturedAt === 'number' && Number.isFinite(capturedAt)

  // A new turn must not inherit the previous card's expanded state: the card
  // is cleared to null on `turn/started` (cli:messageStart), then filled again
  // as soon as the new turn changes something.
  const turnKey = turnDiff ? `${turnDiff.sessionId}:${turnDiff.turnId ?? ''}` : ''
  useLayoutEffect(() => {
    setExpanded(false)
    setShowAll(false)
  }, [turnKey])

  // Watch exactly the folders the diff names. Re-checking is driven by
  // `fs:changed`, never by an interval. A folder main cannot watch leaves its
  // files `unchecked`, which the decision module reports honestly.
  useEffect(() => {
    const subscriberId = subscriberIdRef.current
    if (!hasTurnDiff || stableDirs.length === 0 || !canCheck) {
      setWatchState(null)
      void window.electronAPI.fsWatchDirectories([], subscriberId)
      return
    }
    let cancelled = false
    // Until main confirms the set, no file may be judged against the disk.
    setWatchState(null)
    const off = window.electronAPI.onFsChanged((payload) => {
      if (cancelled) return
      if (payload?.state) setWatchState(payload.state)
      const affected = affectedDirectories(stableDirs, payload?.changes)
      if (affected.length > 0) setRefreshNonce(n => n + 1)
    })
    window.electronAPI.fsWatchDirectories(stableDirs, subscriberId)
      .then(state => { if (!cancelled) setWatchState(state) })
      .catch(() => {
        if (!cancelled) {
          setWatchState({
            watching: [],
            failed: stableDirs.map(directory => ({ directory, error: 'ipc' })),
          })
        }
      })
    return () => {
      cancelled = true
      off()
    }
  }, [hasTurnDiff, stableDirs, canCheck, resubscribeNonce])

  // Unmounting releases this card's subscription. Dependency changes above only
  // replace the watched set, matching the file browser's refcounted pattern.
  useEffect(() => {
    const subscriberId = subscriberIdRef.current
    return () => { void window.electronAPI.fsWatchDirectories([], subscriberId) }
  }, [])

  // Stat the files whose folder is actually watched. The previous snapshot is
  // cleared first: while the new check is in flight nothing may claim to be
  // "unchanged" — that claim requires a stat that ran against the current diff.
  useEffect(() => {
    // Results without a matching scope are from an older snapshot and may not
    // support any claim about this one.
    const clear = () => {
      setStatResults(prev => (prev.length === 0 ? prev : []))
      setStatScope(prev => (prev === diffScope ? prev : diffScope))
    }
    if (!hasTurnDiff || driftPaths.length === 0) {
      clear()
      setCheckState('idle')
      return
    }
    if (!canCheck || stableDirs.length === 0) {
      clear()
      setCheckState('done')
      return
    }
    if (!watchState) {
      clear()
      setCheckState('checking')
      return
    }

    const watched = new Set<string>()
    for (const directory of watchState.watching) {
      const key = canonicalWatchPath(directory)
      if (key) watched.add(key)
    }

    const paths: string[] = []
    const seen = new Set<string>()
    for (const ref of driftPaths) {
      if (!ref.absolutePath) continue
      const directory = diffPathDirectory(ref.absolutePath)
      const dirKey = directory ? canonicalWatchPath(directory) : null
      if (!dirKey || !watched.has(dirKey)) continue
      const pathKey = canonicalWatchPath(ref.absolutePath) ?? ref.absolutePath
      if (seen.has(pathKey)) continue
      seen.add(pathKey)
      paths.push(ref.absolutePath)
      if (paths.length >= MAX_STAT_PATHS) break
    }

    if (paths.length === 0) {
      clear()
      setCheckState('done')
      return
    }

    let cancelled = false
    clear()
    setCheckState('checking')
    window.electronAPI.fsStatPaths(paths)
      .then(results => {
        if (cancelled) return
        setStatResults(results)
        setStatScope(diffScope)
        setCheckState('done')
      })
      .catch(() => {
        if (cancelled) return
        // A failed call is not evidence of anything; every file stays unchecked.
        clear()
        setCheckState('done')
      })
    return () => { cancelled = true }
  }, [hasTurnDiff, driftPaths, stableDirs, canCheck, watchState, refreshNonce, diffScope])

  const statsCurrent = diffScope !== '' && statScope === diffScope
  const currentStats = statsCurrent ? statResults : NO_STATS
  const drift = useMemo(
    () => decideTurnDiffDrift(driftPaths, currentStats, capturedAt, watchState?.watching ?? null),
    [driftPaths, currentStats, capturedAt, watchState],
  )
  const driftSummary = useMemo(() => driftSummaryLine(drift.summary, t), [drift.summary, t])
  const uncheckedLine = useMemo(() => driftUncheckedLine(drift.summary, t), [drift.summary, t])
  // Do not describe an older snapshot's reasons while this one is still
  // settling; the next commit either has current stats or is honestly checking.
  const showUnchecked = !turnActive && checkState !== 'checking' && statsCurrent && uncheckedLine !== null

  if (!turnDiff) return null

  const fileLabel = stats.files === 1
    ? t('codex.diff.filesOne')
    : t('codex.diff.files', { count: String(stats.files) })
  const visibleLines = showAll ? lines : lines.slice(0, MAX_RENDERED_LINES)
  const hasStatusRow = !turnActive && (driftSummary !== null || showUnchecked)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(diffText)
      useUiStore.getState().addToast('success', t('codex.diff.copied'))
    } catch {
      useUiStore.getState().addToast('warning', t('codex.diff.copyFailed'))
    }
  }

  return (
    <div className="chat-column" style={{ marginBottom: 6, flexShrink: 0 }}>
      <div style={{
        background: 'var(--code-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {/* Header row — the toggle is a real button, so Enter/Space and
            aria-expanded come for free. */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '2px 4px',
          background: 'var(--glass-bg-low)',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
        }}>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            aria-controls={bodyId}
            title={expanded ? t('codex.diff.collapse') : t('codex.diff.expand')}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 6px',
              background: 'none',
              border: 'none',
              borderRadius: 6,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            {expanded ? <ChevronDown size={12} style={{ flexShrink: 0 }} /> : <ChevronRight size={12} style={{ flexShrink: 0 }} />}
            <span style={{ whiteSpace: 'nowrap' }}>{t('codex.diff.title')}</span>
            <span style={{
              fontSize: 10,
              fontWeight: 400,
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
              whiteSpace: 'nowrap',
            }}>
              {fileLabel}
            </span>
            {stats.additions > 0 && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--success-text)',
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
              }}>
                +{stats.additions}
              </span>
            )}
            {stats.deletions > 0 && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--danger-text)',
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
              }}>
                −{stats.deletions}
              </span>
            )}
            {turnDiff.truncated && (
              <span
                aria-label={t('codex.diff.truncated')}
                title={t('codex.diff.truncated')}
                style={{ fontSize: 10, color: 'var(--warning-text)', flexShrink: 0 }}
              >
                …
              </span>
            )}
          </button>
          {hasPaths && (
            <button
              type="button"
              onClick={() => {
                // Re-request the watches too: a previous attempt may have failed,
                // and statting only the folders main reports as watched would
                // otherwise make the refresh a no-op.
                setResubscribeNonce(n => n + 1)
                setRefreshNonce(n => n + 1)
              }}
              disabled={!canCheck || stableDirs.length === 0}
              title={t('codex.diff.drift.refresh')}
              aria-label={t('codex.diff.drift.refresh')}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: 3,
                background: 'none',
                border: 'none',
                borderRadius: 5,
                color: 'var(--text-muted)',
                cursor: canCheck && stableDirs.length > 0 ? 'pointer' : 'default',
                opacity: canCheck && stableDirs.length > 0 ? 1 : 0.45,
                flexShrink: 0,
                transition: 'color 0.15s ease, background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (canCheck && stableDirs.length > 0) {
                  e.currentTarget.style.color = 'var(--text-primary)'
                  e.currentTarget.style.background = 'var(--bg-hover)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.background = 'none'
              }}
            >
              <RefreshCw size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            title={t('codex.diff.copy')}
            aria-label={t('codex.diff.copy')}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: 3,
              background: 'none',
              border: 'none',
              borderRadius: 5,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'color 0.15s ease, background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}
          >
            <Copy size={12} />
          </button>
        </div>

        {/* Disk state. The warning line is visible even when the diff is
            collapsed: a stale diff must not look current just because its body
            is hidden. The unchecked line is quiet, and a file whose folder is
            not watched is never presented as matching the disk. */}
        {hasStatusRow && (
          <div style={{
            borderBottom: expanded ? '1px solid var(--border)' : 'none',
          }}>
            {driftSummary && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                fontSize: 10,
                color: 'var(--warning-text)',
              }}>
                <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>{driftSummary}</span>
              </div>
            )}
            {showUnchecked && uncheckedLine && (
              <div style={{
                padding: '2px 10px',
                fontSize: 9,
                color: 'var(--text-faint)',
              }}>
                {uncheckedLine}
              </div>
            )}
          </div>
        )}

        {expanded && (
          <div id={bodyId}>
            {turnDiff.truncated && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                fontSize: 10,
                color: 'var(--warning-text)',
                borderBottom: '1px solid var(--border)',
              }}>
                <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                <span>{t('codex.diff.truncated')}</span>
              </div>
            )}
            {!turnActive && drift.files.length > 0 && (
              <div style={{
                borderBottom: '1px solid var(--border)',
                maxHeight: 96,
                overflowY: 'auto',
                padding: '3px 0',
                scrollbarWidth: 'thin',
              }}>
                <div style={{
                  padding: '1px 10px 3px',
                  fontSize: 9,
                  color: 'var(--text-faint)',
                }}>
                  {t('codex.diff.drift.files')}
                </div>
                {drift.files.map((file, idx) => {
                  const chipKey = file.state === 'unchecked' ? null : driftChipKey(file.state)
                  return (
                    <div
                      key={`${file.path}:${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '1px 10px',
                        fontSize: 10,
                        minWidth: 0,
                      }}
                    >
                      <span
                        title={file.absolutePath ?? file.path}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: MONO_FONT,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {file.path}
                      </span>
                      {chipKey && file.state !== 'unchecked' && (
                        <span style={chipStyle(file.state, file.expected === 'gone')}>
                          {t(chipKey)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {lines.length === 0 ? (
              <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)' }}>
                {t('codex.diff.empty')}
              </div>
            ) : (
              <div
                role="region"
                aria-label={t('codex.diff.region')}
                style={{
                  overflowX: 'auto',
                  overflowY: 'auto',
                  maxHeight: 320,
                  padding: '4px 0',
                  fontFamily: MONO_FONT,
                  fontSize: 11,
                  lineHeight: 1.55,
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'var(--border) transparent',
                }}
              >
                {visibleLines.map((line, idx) => (
                  <div
                    key={idx}
                    style={{
                      // Long lines scroll horizontally instead of wrapping:
                      // re-wrapped patch lines stop looking like a patch.
                      whiteSpace: 'pre',
                      padding: '0 10px',
                      color: LINE_COLOR[kinds[idx] ?? 'context'],
                    }}
                  >
                    {line.length > 0 ? line : ' '}
                  </div>
                ))}
              </div>
            )}
            {!showAll && lines.length > MAX_RENDERED_LINES && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '4px 10px',
                  background: 'none',
                  border: 'none',
                  borderTop: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 10,
                  textAlign: 'left',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                {t('codex.diff.showAll', { count: String(lines.length) })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
