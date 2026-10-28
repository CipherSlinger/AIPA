// CodexSkillsSection — the skills the installed Codex already knows about
// (repo / user / admin / system scopes), shown read-only under the AIPA
// marketplace on the Skills page.
//
// These directories belong to Codex, not AIPA: the section only reveals a
// skill on disk or copies its path, so there are deliberately no install,
// edit or delete buttons here. A failed probe or an empty list renders
// nothing — most installs have no Codex skills and the page must not gain
// permanent noise.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, FolderOpen, Puzzle } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useUiStore } from '../../store'
import type { CodexSkillInfoData } from '../../../preload'

type TFunction = (key: string, params?: Record<string, string | number>) => string

/** Display order mandated by the page spec. Unknown scopes sort last. */
const SCOPE_ORDER = ['repo', 'user', 'admin', 'system']

const SCOPE_LABEL_KEY: Record<string, string> = {
  repo: 'codex.skills.scopeRepo',
  user: 'codex.skills.scopeUser',
  admin: 'codex.skills.scopeAdmin',
  system: 'codex.skills.scopeSystem',
}

interface ScopeStyle {
  color: string
  background: string
  border: string
}

const SCOPE_STYLES: Record<string, ScopeStyle> = {
  repo: {
    color: 'var(--accent-text)',
    background: 'var(--accent-bg)',
    border: '1px solid var(--accent-border)',
  },
  user: {
    color: 'var(--text-secondary)',
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
  },
  admin: {
    color: 'var(--warning-text)',
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
  },
  system: {
    color: 'var(--text-muted)',
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
  },
}

function scopeRank(scope: string): number {
  const index = SCOPE_ORDER.indexOf(scope)
  return index === -1 ? SCOPE_ORDER.length : index
}

interface CardActionProps {
  icon: React.ReactNode
  label: string
  title: string
  onClick: () => void
}

function CardAction({ icon, label, title, onClick }: CardActionProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

interface SkillCardProps {
  skill: CodexSkillInfoData
  t: TFunction
}

function CodexSkillCard({ skill, t }: SkillCardProps) {
  const addToast = useUiStore(s => s.addToast)
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | undefined>(undefined)

  // A copy feedback timer must not fire into an unmounted card.
  useEffect(() => () => {
    if (copiedTimer.current !== undefined) window.clearTimeout(copiedTimer.current)
  }, [])

  const disabled = skill.enabled === false
  const description = skill.shortDescription || skill.description || ''
  const scopeStyle = SCOPE_STYLES[skill.scope] ?? SCOPE_STYLES.system

  const handleReveal = async () => {
    const api = window.electronAPI
    if (!api?.shellShowItemInFolder) return
    try {
      const result = await api.shellShowItemInFolder(skill.path)
      if (result && !result.success) {
        addToast('error', result.error || t('codex.skills.revealFailed'))
      }
    } catch (err) {
      addToast('error', String(err))
    }
  }

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(skill.path)
      addToast('success', t('codex.skills.copied'))
      setCopied(true)
      if (copiedTimer.current !== undefined) window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1200)
    } catch {
      addToast('error', t('codex.skills.copyFailed'))
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--border)'}`,
        background: 'var(--bg-primary)',
        // Disabled skills stay visible (they exist on disk) but must not read
        // as active. The state is carried by the badge and a muted name rather
        // than a faded card: 55 % opacity pushed the description below AA.
        transition: 'border-color 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span
          title={skill.name}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
            fontWeight: 700,
            color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
          }}
        >
          {skill.name}
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '2px 7px',
            borderRadius: 20,
            ...scopeStyle,
          }}
        >
          {t(SCOPE_LABEL_KEY[skill.scope] ?? 'codex.skills.scopeOther')}
        </span>
        {disabled && (
          <span
            style={{
              flexShrink: 0,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '2px 7px',
              borderRadius: 20,
              color: 'var(--warning-text)',
              border: '1px solid var(--border)',
            }}
          >
            {t('codex.skills.disabled')}
          </span>
        )}
      </div>
      {description && (
        <div
          title={description}
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: 11,
            lineHeight: 1.5,
            color: 'var(--text-muted)',
            wordBreak: 'break-word',
          }}
        >
          {description}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 2 }}>
        <CardAction
          icon={<FolderOpen size={11} />}
          label={t('codex.skills.showInFolder')}
          title={skill.path}
          onClick={handleReveal}
        />
        <CardAction
          icon={copied ? <Check size={11} /> : <Copy size={11} />}
          label={t('codex.skills.copyPath')}
          title={skill.path}
          onClick={handleCopyPath}
        />
      </div>
    </div>
  )
}

export default function CodexSkillsSection() {
  const t = useT()
  // Repo-scoped skills only resolve when Codex is asked about a cwd, so probe
  // with the active working directory. Re-probing when the directory changes
  // is intentional: the repo group is per-project.
  const workingDir = usePrefsStore(s => s.prefs.workingDir)
  const [skills, setSkills] = useState<CodexSkillInfoData[] | null>(null)
  // `skills/changed` is the engine's invalidation signal: skill files on disk
  // changed. Refetch on it while this section is on screen — one probe per
  // event, no polling loop. Mount still fetches once, so a change that happened
  // while Settings was closed is picked up when it opens.
  const [refreshToken, setRefreshToken] = useState(0)
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onCliEvent) return
    return api.onCliEvent(null, (event) => {
      if (event === 'cli:skillsChanged') setRefreshToken(token => token + 1)
    })
  }, [])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.codexSkillsList) return
    let cancelled = false
    api.codexSkillsList(workingDir ? { cwd: workingDir } : {})
      .then(result => {
        if (cancelled) return
        setSkills(result?.success && Array.isArray(result.skills) ? result.skills : [])
      })
      .catch(() => {
        if (!cancelled) setSkills([])
      })
    return () => { cancelled = true }
  }, [workingDir, refreshToken])

  const sorted = useMemo(() => {
    if (!skills) return []
    return [...skills].sort((a, b) => {
      const byScope = scopeRank(a.scope) - scopeRank(b.scope)
      return byScope !== 0 ? byScope : a.name.localeCompare(b.name)
    })
  }, [skills])

  // Loading, empty and failed probes are indistinguishable to the user on
  // purpose: silence beats a permanent error box for a feature most installs
  // do not use.
  if (sorted.length === 0) return null

  return (
    <section style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Puzzle size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('codex.skills.title')}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '1px 7px',
            borderRadius: 20,
            background: 'var(--border)',
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
          }}
        >
          {sorted.length}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
        {t('codex.skills.description')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {sorted.map(skill => (
          <CodexSkillCard
            key={`${skill.scope}:${skill.path || skill.name}`}
            skill={skill}
            t={t}
          />
        ))}
      </div>
    </section>
  )
}
