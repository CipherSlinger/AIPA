import React, { useState, useRef, useEffect } from 'react'
import { Gauge } from 'lucide-react'
import { useT } from '../../i18n'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { personaModelOf, resolveEffectiveModel } from '../../lib/sessionModel'
import { resolveWorkingDir } from '../../lib/workingDir'
import {
  EFFORT_LEVELS,
  isEffortOverridden,
  normalizeEffort,
  planEffortPick,
  resolveEffectiveEffort,
  type EffortLevel,
} from '../../lib/sessionEffort'

// `EFFORT_LEVELS` is read where it is rendered, not copied into a module-level
// alias. This file lands in the `app-chat` chunk while `sessionEffort` lands in
// `app-shared`, and those two chunks import each other; a top-level copy is
// evaluated during module initialisation and can run before `app-shared` has
// assigned the constant, which throws "Cannot access … before initialization"
// and leaves the whole page blank.
const EFFORT_COLORS: Record<EffortLevel, string> = {
  auto: '#818cf8',   // blue
  low: '#4ade80',    // green
  medium: '#fbbf24', // yellow
  high: '#fb923c',   // orange
  max: '#f87171',    // red
}

// The same hues are used for the dot/background above (built with alpha
// suffixes, so they must stay hex). Text gets theme tokens instead: the raw
// hues are tuned for the dark background and fail contrast in light mode.
const EFFORT_TEXT_COLORS: Record<EffortLevel, string> = {
  auto: 'var(--accent-text)',
  low: 'var(--success-text)',
  medium: 'var(--warning-text)',
  high: 'var(--warning-text)',
  max: 'var(--danger-text)',
}

/**
 * Efforts the Codex model that will run actually advertises.
 *
 * `turn/start` rejects an effort the model does not list, so the menu must not
 * offer one. `null` means "unknown" (not Codex, or the catalogue failed to
 * load) — every level stays selectable rather than disabling on a guess.
 */
interface EffortCatalogue {
  efforts: string[]
  model: string
}

const EFFORT_ABBREVIATIONS: Record<EffortLevel, string> = {
  auto: 'A',
  low: 'L',
  medium: 'M',
  high: 'H',
  max: 'X',
}

export default function EffortPicker() {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const addToast = useUiStore(s => s.addToast)
  const [show, setShow] = useState(false)
  const [triggerHovered, setTriggerHovered] = useState(false)
  const [catalogue, setCatalogue] = useState<EffortCatalogue | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const sessionEffortOverride = useChatStore(s => s.sessionEffortOverride)
  // What a turn will actually send: this conversation's pick, else the global
  // default. Showing `prefs.effortLevel` here made the button look effective
  // while an overridden conversation kept running on its own level.
  const currentEffort = resolveEffectiveEffort(prefs.effortLevel, sessionEffortOverride)
  const globalEffort = normalizeEffort(prefs.effortLevel)
  // A conversation is "open" once a turn exists or the view has an id. On the
  // welcome screen there is nothing to scope a pick to, so it is the default.
  const hasConversation = useChatStore(s => !!s.currentSessionId || s.messages.length > 0)
  const differsFromDefault = isEffortOverridden(prefs.effortLevel, sessionEffortOverride)

  // Ask Codex which efforts the model that will run supports. Loaded once per
  // menu open (the main process caches `model/list` for five minutes). Any
  // failure leaves `catalogue` null, i.e. today's behaviour untouched.
  useEffect(() => {
    if (!show) return
    setCatalogue(null)
    let cancelled = false

    const load = async () => {
      try {
        const active = await window.electronAPI.engineGetActive()
        if (cancelled || active?.kind !== 'codex') return
        const chat = useChatStore.getState()
        // The probe must run where the next turn will run, so the precedence is
        // the send path's own resolver rather than a copy that can drift.
        const cwd = resolveWorkingDir({
          tabCwd: chat.tabs.find(tb => tb.id === chat.activeTabId)?.cwd,
          globalDir: usePrefsStore.getState().prefs.workingDir,
        }).dir
        const result = await window.electronAPI.codexModelList({
          cwd: cwd || undefined,
          sessionId: chat.streamSessionId || undefined,
        })
        if (cancelled || !result?.success) return
        const models = result.models ?? []
        const wanted = resolveEffectiveModel(
          usePrefsStore.getState().prefs.model,
          personaModelOf(usePrefsStore.getState().prefs, useChatStore.getState().sessionPersonaId),
          useChatStore.getState().sessionModelOverride,
        )
        // An id outside the catalogue (e.g. the Claude default prefs still
        // carry) is stripped before it reaches Codex, so the default model runs.
        const row = models.find(m => m.model === wanted || m.id === wanted)
          ?? models.find(m => m.isDefault)
        const efforts = (row?.supportedReasoningEfforts ?? [])
          .map(o => o.reasoningEffort)
          .filter(Boolean)
        if (!row || efforts.length === 0) return
        setCatalogue({ efforts, model: row.displayName || row.model || row.id })
      } catch {
        // A read-only probe must never change what the menu offers.
      }
    }

    load()
    return () => { cancelled = true }
  }, [show])

  // `auto` always means "whatever the engine decides", so it is never disabled.
  const isUnsupported = (level: EffortLevel): boolean =>
    !!catalogue && level !== 'auto' && !catalogue.efforts.includes(level)

  // Close dropdown on outside click
  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  // Keyboard navigation
  useEffect(() => {
    if (!show) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShow(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [show])

  const handleSelect = (level: EffortLevel) => {
    setShow(false)
    const globalLevel = normalizeEffort(usePrefsStore.getState().prefs.effortLevel)
    // The rule (and the "auto means delete the record" promise) lives in the
    // pure module, so the harness can exercise the pick the menu really makes.
    const plan = planEffortPick(hasConversation, level, globalLevel)

    if (plan.scope === 'session') {
      // In a conversation the pick belongs to this conversation. `'auto'` is
      // planned as an absent override, not as today's default frozen in place.
      useChatStore.getState().setSessionEffortOverride(plan.override)
      addToast('info', plan.override
        ? t('effort.sessionSwitched', { level: t(`effort.${level}`) })
        : t('effort.followsGlobal', { level: t(`effort.${globalLevel}`) }))
      return
    }

    // Nothing open to scope it to: this changes the default every new
    // conversation starts from.
    setPrefs({ effortLevel: plan.level })
    window.electronAPI.prefsSet('effortLevel', plan.level)
    addToast('info', t('effort.globalSwitched', { level: t(`effort.${plan.level}`) }))
  }

  const color = EFFORT_COLORS[currentEffort]
  const isNonDefault = currentEffort !== 'auto'
  // `'auto'` in a conversation means "follow the default", so the row must say
  // which level that is — otherwise picking "Auto" while the default is High
  // would look like it selected Auto and then quietly run High.
  const autoOptionLabel = hasConversation && globalEffort !== 'auto'
    ? t('effort.followGlobalOption', { level: t(`effort.${globalEffort}`) })
    : t('effort.auto')
  const autoOptionHint = hasConversation
    ? t('effort.followGlobalOptionHint', { level: t(`effort.${globalEffort}`) })
    : t('effort.autoHint')

  const triggerTitle = hasConversation
    ? differsFromDefault
      ? t('effort.overrideTitle', {
          level: t(`effort.${currentEffort}`),
          global: t(`effort.${globalEffort}`),
        })
      : t('effort.sessionTitle', { level: t(`effort.${currentEffort}`) })
    : t('effort.globalTitle', { level: t(`effort.${currentEffort}`) })

  // Build trigger button colors from design tokens
  const triggerBg = isNonDefault
    ? triggerHovered ? `${color}33` : `${color}22`
    : triggerHovered ? 'var(--border)' : 'var(--bg-hover)'
  const triggerBorder = isNonDefault
    ? triggerHovered ? `${color}88` : `${color}55`
    : triggerHovered ? 'var(--bg-active)' : 'var(--border)'
  const triggerColor = isNonDefault ? EFFORT_TEXT_COLORS[currentEffort] : 'var(--text-secondary)'

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setShow(!show)}
        title={triggerTitle}
        aria-label={t('effort.pickerTitle')}
        aria-expanded={show}
        onMouseEnter={() => setTriggerHovered(true)}
        onMouseLeave={() => setTriggerHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 8px',
          background: triggerBg,
          border: `1px solid ${triggerBorder}`,
          borderRadius: 6,
          color: triggerColor,
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap',
        }}
      >
        <Gauge size={9} />
        <span style={{ fontWeight: 600 }}>{EFFORT_ABBREVIATIONS[currentEffort]}</span>
        {t(`effort.${currentEffort}`)}
        {/* Same marker the model picker uses for an explicit per-session pick:
            a conversation that runs on something other than the default says
            so without the menu being opened. */}
        {differsFromDefault && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.02em', opacity: 0.75 }}>
            {t('effort.sessionTag')}
          </span>
        )}
      </button>
      {show && (
        <div
          className="popup-enter"
          role="listbox"
          aria-label={t('effort.pickerTitle')}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
            padding: '4px',
            minWidth: 220,
            zIndex: 200,
            animation: 'slideUp 0.15s ease',
          }}
        >
          <div style={{
            padding: '6px 10px 4px',
            fontSize: 10,
            color: 'var(--text-muted)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}>
            {t('effort.pickerTitle')}
          </div>
          {/* Say which promise this menu is keeping: a pick here changes this
              conversation, or — with nothing open — the default for new ones.
              The two are different and the menu must not blur them. */}
          <div style={{ padding: '0 10px 6px', fontSize: 10, color: 'var(--text-muted)' }}>
            {hasConversation
              ? differsFromDefault
                ? t('effort.sessionHint', { level: t(`effort.${currentEffort}`) })
                : t('effort.followsDefaultHint', { level: t(`effort.${globalEffort}`) })
              : t('effort.globalHint')}
          </div>
          {EFFORT_LEVELS.map(level => {
            const isSelected = level === currentEffort
            const lvlColor = EFFORT_COLORS[level]
            const unsupported = isUnsupported(level)
            return (
              <EffortOption
                key={level}
                level={level}
                isSelected={isSelected}
                lvlColor={lvlColor}
                label={level === 'auto' ? autoOptionLabel : t(`effort.${level}`)}
                hint={level === 'auto' ? autoOptionHint : t(`effort.${level}Hint`)}
                unavailableReason={unsupported && catalogue
                  ? t('codex.effort.unsupported', { model: catalogue.model })
                  : undefined}
                onSelect={handleSelect}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

interface EffortOptionProps {
  level: EffortLevel
  isSelected: boolean
  lvlColor: string
  label: string
  hint: string
  /** Set when the running model does not advertise this level; blocks selection. */
  unavailableReason?: string
  onSelect: (level: EffortLevel) => void
}

function EffortOption({ level, isSelected, lvlColor, label, hint, unavailableReason, onSelect }: EffortOptionProps) {
  const [hovered, setHovered] = useState(false)
  const unavailable = !!unavailableReason

  const bg = isSelected
    ? 'rgba(99,102,241,0.20)'
    : hovered && !unavailable
    ? 'var(--bg-hover)'
    : 'transparent'

  const textColor = isSelected
    ? '#a5b4fc'
    : hovered && !unavailable
    ? 'var(--text-primary)'
    : 'var(--text-secondary)'

  return (
    <button
      role="option"
      aria-selected={isSelected}
      aria-disabled={unavailable || undefined}
      title={unavailableReason}
      onClick={() => { if (!unavailable) onSelect(level) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        background: bg,
        border: 'none',
        borderLeft: isSelected ? '2px solid rgba(99,102,241,0.40)' : '2px solid transparent',
        borderRadius: 7,
        color: textColor,
        // `aria-disabled`, not `disabled`: a disabled button swallows the
        // hover that shows the `title` explaining why.
        cursor: unavailable ? 'not-allowed' : 'pointer',
        opacity: unavailable ? 0.45 : 1,
        fontSize: 12,
        fontWeight: isSelected ? 600 : 500,
        lineHeight: 1.4,
        transition: 'all 0.15s ease',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: lvlColor,
            flexShrink: 0,
            boxShadow: isSelected ? `0 0 6px ${lvlColor}88` : 'none',
          }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
        </span>
        {isSelected && <span style={{ fontSize: 11, color: '#818cf8' }}>{'✓'}</span>}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, paddingLeft: 15 }}>
        {hint}
      </span>
    </button>
  )
}
