// Skill detail view — extracted from SkillsPanel.tsx (Iteration 199)
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarClock, CalendarPlus, ChevronRight, Play, Trash2 } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useUiStore } from '../../store'
import { scheduleText } from '../automation/scheduleText'
import AutomationDialog, { type WorkflowOption } from '../automation/AutomationDialog'
import { WARNING } from '../automation/automationStyles'
import { skillBodyState } from '../automation/skillSelection'
import ProvenanceLine from '../provenance/ProvenanceLine'
import type { AutomationJobData, AutomationLimitsData } from '../../../preload'
import type { SkillInfo } from './skillsShared'

interface SkillDetailProps {
  skill: SkillInfo
  skillContent: string
  deletingSkillPath: string | null
  onBack: () => void
  onUseSkill: (name: string) => void
  onDeleteSkill: (dirPath: string) => void
}

/**
 * One schedule that runs this skill, as a quiet row.
 *
 * Read-only on purpose: the row's job is "this runs without me", so it opens
 * the automations page where the schedule can be changed, paused or deleted in
 * the same place as every other job. Mirrors the strip a workflow page shows,
 * but with no per-row actions — a skill has no run of its own to start.
 */
function SkillScheduleRow({ job, onOpen }: { job: AutomationJobData; onOpen: () => void }) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={t('skills.schedules.openHint')}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%',
        padding: '5px 7px', textAlign: 'left', cursor: 'pointer',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        border: 'none', borderRadius: 6,
        color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 11, transition: 'background 0.15s ease',
      }}
    >
      <CalendarClock size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span style={{
        fontWeight: 600, flexShrink: 0, maxWidth: '45%',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{job.name}</span>
      <span style={{
        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', opacity: 0.85,
      }}>{scheduleText(t, job.trigger)}</span>
      <ChevronRight size={11} style={{ flexShrink: 0, marginLeft: 'auto', opacity: 0.5 }} />
    </button>
  )
}

function getSourceBadgeStyle(source: string): React.CSSProperties {
  if (source === 'personal') {
    return {
      background: 'rgba(99,102,241,0.15)',
      border: '1px solid rgba(99,102,241,0.25)',
      color: '#a5b4fc',
    }
  }
  if (source === 'project') {
    return {
      background: 'rgba(34,197,94,0.12)',
      border: '1px solid rgba(34,197,94,0.25)',
      color: '#4ade80',
    }
  }
  return {
    background: 'var(--border)',
    border: '1px solid var(--bg-active)',
    color: 'var(--text-secondary)',
  }
}

export default function SkillDetail({
  skill,
  skillContent,
  deletingSkillPath,
  onBack,
  onUseSkill,
  onDeleteSkill,
}: SkillDetailProps) {
  const t = useT()
  const [backHovered, setBackHovered] = useState(false)
  const [useHovered, setUseHovered] = useState(false)
  const [deleteHovered, setDeleteHovered] = useState(false)
  const [scheduleHovered, setScheduleHovered] = useState(false)
  // The dialog needs the same lists the workflow page hands it: the workflow
  // options it offers for a workflow action, and the scheduler's limits.
  const workflows = usePrefsStore(s => s.prefs.workflows) as WorkflowOption[] | undefined

  // Read on mount and on every scheduler broadcast, so a job created or
  // deleted in Settings shows up here without reopening the page. A failed read
  // is an empty list: showing no schedules is quieter than a broken strip, and
  // the page's real subject (the SKILL.md) is unaffected.
  const [jobs, setJobs] = useState<AutomationJobData[] | null>(null)
  const [limits, setLimits] = useState<AutomationLimitsData | null>(null)
  const refreshJobs = useCallback(async () => {
    try {
      const result = await window.electronAPI.automationList()
      setJobs(Array.isArray(result?.jobs) ? result.jobs : [])
      setLimits(result?.limits ?? null)
    } catch {
      setJobs(null)
    }
  }, [])
  useEffect(() => {
    void refreshJobs()
    const off = window.electronAPI.onAutomationChanged(() => { void refreshJobs() })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [refreshJobs])

  // Whether this skill can be scheduled at all. The page carries `skillContent`
  // for display, but that string is the read error when the read failed, so it
  // cannot answer "is the body empty"; one read of the same file through the
  // same IPC gives a truthful answer without a probe per render.
  const [runState, setRunState] = useState<'checking' | 'ready' | 'unreadable'>('checking')
  const [bodyEmpty, setBodyEmpty] = useState(false)
  useEffect(() => {
    let cancelled = false
    setRunState('checking')
    void (async () => {
      try {
        const result = await window.electronAPI.skillsRead(skill.dirPath)
        if (cancelled) return
        if (typeof result?.content !== 'string') {
          setRunState('unreadable')
          return
        }
        setBodyEmpty(skillBodyState(result.content) === 'empty')
        setRunState('ready')
      } catch {
        if (!cancelled) setRunState('unreadable')
      }
    })()
    return () => { cancelled = true }
  }, [skill.dirPath])

  // Nothing is written by opening this page. The dialog saves on the user's
  // click, and closing it re-reads the list so a new schedule appears now
  // rather than on the next broadcast.
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const canSchedule = runState === 'ready' && !bodyEmpty
  const blockedReason = runState === 'unreadable'
    ? t('skills.schedules.blockedUnreadable')
    : runState === 'ready' && bodyEmpty
      ? t('skills.schedules.blockedEmpty')
      : null

  // A job names the skill by source + directory segment, which is exactly the
  // identity this page was opened with. `skillDir` is absent only for a payload
  // from an older main process; `''` is the root-level skill, not a wildcard.
  const schedules = useMemo(() => {
    const list = jobs ?? []
    const dir = skill.skillDir ?? ''
    return list.filter(job =>
      job.action.kind === 'skill' &&
      job.action.skillSource === skill.source &&
      job.action.skillDir === dir)
  }, [jobs, skill])

  const sourceBadge = getSourceBadgeStyle(skill.source)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-chat)' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <button
          onClick={onBack}
          onMouseEnter={() => setBackHovered(true)}
          onMouseLeave={() => setBackHovered(false)}
          style={{
            background: backHovered ? 'var(--border)' : 'none',
            border: 'none',
            color: backHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '5px 8px',
            borderRadius: 6,
            fontSize: 12,
            gap: 4,
            transition: 'all 0.15s ease',
          }}
          aria-label={t('skills.back')}
        >
          <ArrowLeft size={14} />
        </button>
        <span style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {skill.name}
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          padding: '2px 8px',
          borderRadius: 20,
          flexShrink: 0,
          ...sourceBadge,
        }}>
          {skill.source === 'personal'
            ? t('skills.personal')
            : skill.source === 'project'
              ? t('skills.project')
              : 'global'}
        </span>
      </div>

      {/* Hero / description section */}
      <div style={{
        margin: '16px 20px 0',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            overflow: 'hidden',
            flexShrink: 0,
            background: 'rgba(99,102,241,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Play size={22} style={{ color: '#818cf8' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 10,
              lineHeight: 1.5,
            }}>
              {skill.description}
            </div>
            {/* Metadata */}
            <div>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: 2,
              }}>
                Path
              </span>
              <span style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                wordBreak: 'break-all' as const,
              }}>
                {skill.dirPath}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '12px 20px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => onUseSkill(skill.name)}
          onMouseEnter={() => setUseHovered(true)}
          onMouseLeave={() => setUseHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 20px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            color: 'var(--text-bright)',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transform: useHovered ? 'translateY(-1px)' : 'translateY(0)',
            boxShadow: useHovered ? '0 4px 16px rgba(99,102,241,0.40)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Play size={14} />
          {t('skills.useSkill')}
        </button>

        {/* Scheduling from the page a skill lives on. It only opens the same
            dialog the workflow page opens, pre-filled with this identity; the
            save is the user's. Disabled — never present-and-failing — when the
            run could not start: an unreadable file, or one with no body. */}
        <button
          onClick={() => setShowScheduleDialog(true)}
          disabled={!canSchedule}
          onMouseEnter={() => setScheduleHovered(true)}
          onMouseLeave={() => setScheduleHovered(false)}
          title={blockedReason ?? t('skills.schedules.scheduleHint')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 20px',
            background: !canSchedule
              ? 'var(--bg-hover)'
              : scheduleHovered
                ? 'rgba(99,102,241,0.16)'
                : 'var(--bg-hover)',
            color: canSchedule ? 'var(--accent-text)' : 'var(--text-muted)',
            border: canSchedule
              ? '1px solid rgba(99,102,241,0.35)'
              : '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: canSchedule ? 'pointer' : 'not-allowed',
            opacity: canSchedule ? 1 : 0.6,
            transition: 'all 0.15s ease',
          }}
        >
          <CalendarPlus size={14} />
          {t('skills.schedules.schedule')}
        </button>

        {skill.source === 'personal' && (
          <button
            onClick={() => onDeleteSkill(skill.dirPath)}
            onMouseEnter={() => setDeleteHovered(true)}
            onMouseLeave={() => setDeleteHovered(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 20px',
              background: deletingSkillPath === skill.dirPath
                ? 'rgba(239,68,68,0.25)'
                : deleteHovered
                  ? 'rgba(239,68,68,0.12)'
                  : 'var(--bg-hover)',
              color: '#fca5a5',
              border: deletingSkillPath === skill.dirPath
                ? '1px solid rgba(239,68,68,0.45)'
                : '1px solid rgba(239,68,68,0.20)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Trash2 size={14} />
            {deletingSkillPath === skill.dirPath ? t('skills.confirmDelete') : t('skills.deleteSkill')}
          </button>
        )}
      </div>

      {/* Why the action is unavailable, in place rather than on hover only. */}
      {blockedReason && (
        <div style={{
          padding: '0 20px 10px',
          fontSize: 11,
          color: WARNING,
          lineHeight: 1.5,
          flexShrink: 0,
        }}>
          {blockedReason}
        </div>
      )}

      {/* Schedules that run this skill. Nothing at all when there are none:
          an empty section header would suggest a feature that is missing
          rather than a schedule that was never made. */}
      {schedules.length > 0 && (
        <div style={{ padding: '0 20px 10px', flexShrink: 0 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 6,
          }}>
            {t('skills.schedules.title')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {schedules.map(job => (
              <SkillScheduleRow
                key={job.id}
                job={job}
                onOpen={() => useUiStore.getState().openSettingsAt('automations')}
              />
            ))}
          </div>
        </div>
      )}

      {/* Skill content preview */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        {/* One shared line: quiet text when the conversation is gone from the
            list, a link back to it when it is still there. */}
        <ProvenanceLine
          sessionId={skill.sourceConversation}
          title={skill.sourceTitle}
          date={skill.createdAt}
          surface="skill"
          className="mb-2.5"
        />
        <div style={{
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '16px 20px',
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 10,
          }}>
            SKILL.md
          </div>
          <pre style={{
            fontSize: 12,
            color: '#a5b4fc',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.5,
            margin: 0,
            fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
            background: 'var(--code-bg)',
            borderRadius: 8,
            padding: '12px 14px',
            border: '1px solid var(--bg-hover)',
          }}>
            {skillContent}
          </pre>
        </div>
      </div>

      {/* The same dialog the workflow page opens; the only difference is the
          pre-filled action. `skillDir ?? ''` mirrors the schedules strip: an
          older payload without the segment names the root SKILL.md. */}
      {showScheduleDialog && (
        <AutomationDialog
          job={null}
          initialSkill={{ source: skill.source, dir: skill.skillDir ?? '' }}
          workflows={workflows ?? []}
          limits={limits}
          onClose={() => {
            setShowScheduleDialog(false)
            void refreshJobs()
          }}
        />
      )}
    </div>
  )
}
