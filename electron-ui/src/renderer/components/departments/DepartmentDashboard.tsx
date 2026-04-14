// DepartmentDashboard — org chart (all depts) or single dept session list
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, FolderOpen, MessageSquarePlus, ChevronRight, ArrowLeft, Search, X } from 'lucide-react'
import { useDepartmentStore, useSessionStore, useChatStore, useUiStore, usePrefsStore } from '../../store'
import { SessionListItem } from '../../types/app.types'
import SessionCard from './SessionCard'
import { useT } from '../../i18n'
import { parseSessionMessages } from '../sessions/sessionUtils'

// Stable fallback for sessionColorLabels — avoids creating a new {} on every selector call
// (inline `?? {}` in a Zustand selector causes infinite re-renders because {} !== {})
const EMPTY_COLOR_LABELS: Record<string, string> = {}

// Encode a real directory path to Claude's project slug format.
// Claude replaces all path separators (/ and \) and Windows drive colon (:) with hyphens.
// Example: "C:\Users\osr\Desktop" → "C--Users-osr-Desktop"
//          "/home/osr/AIPA"       → "-home-osr-AIPA"
// Comparing slugs is the only reliable match — s.project (decoded from slug) is lossy
// because decodeProjectSlug replaces ALL hyphens with separators, mangling real paths.
function dirToSlug(dir: string): string {
  return dir.replace(/[/\\:]/g, '-')
}

// Shared core logic for opening a session in a department directory.
// Extracted here so DeptView and OrgChart don't duplicate the implementation.
async function openSessionCore(session: SessionListItem, deptDirectory: string): Promise<void> {
  useUiStore.getState().setMainView('chat')
  useUiStore.getState().closeSettingsModal()
  const raw = await window.electronAPI.sessionLoad(session.sessionId)
  const chatMessages = parseSessionMessages(raw)
  useChatStore.getState().clearMessages()
  useChatStore.getState().loadHistory(chatMessages)
  useChatStore.getState().setSessionId(session.sessionId)
  useUiStore.getState().clearUnreadForSession(session.sessionId)
  usePrefsStore.getState().setPrefs({ workingDir: deptDirectory })
  window.electronAPI.prefsSet('workingDir', deptDirectory)
}

// ── Single Department View ──────────────────────────────────────────────────
interface DeptViewProps {
  deptId: string
  onBack: () => void
  onOpenSession: (session: SessionListItem) => void
  loadingSessionId?: string | null
  onDeleteSession?: (sessionId: string) => void
}

function DeptView({ deptId, onBack, onOpenSession, loadingSessionId, onDeleteSession }: DeptViewProps) {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const dept = departments.find(d => d.id === deptId) ?? null

  const allSessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const sessionColorLabels = usePrefsStore(s => s.prefs?.sessionColorLabels ?? EMPTY_COLOR_LABELS)

  const deptSessions = useMemo((): SessionListItem[] => {
    if (!dept) return []
    const deptSlug = dirToSlug(dept.directory)
    return allSessions
      .filter(s => s.projectSlug === deptSlug)
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [allSessions, dept])

  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest' | 'msgs'>('recent')

  const sortedSessions = useMemo(() => {
    const arr = [...deptSessions]
    if (sortOrder === 'oldest') arr.sort((a, b) => a.timestamp - b.timestamp)
    else if (sortOrder === 'msgs') arr.sort((a, b) => (b.messageCount ?? 0) - (a.messageCount ?? 0))
    return arr
  }, [deptSessions, sortOrder])

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sortedSessions
    const q = searchQuery.toLowerCase()
    return sortedSessions.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.lastPrompt || '').toLowerCase().includes(q)
    )
  }, [sortedSessions, searchQuery])

  const pinnedFilteredSessions = useMemo(() => {
    const pinned = filteredSessions.filter(s => localStorage.getItem(`aipa:session-pin:${s.sessionId}`) === '1')
    const unpinned = filteredSessions.filter(s => localStorage.getItem(`aipa:session-pin:${s.sessionId}`) !== '1')
    return [...pinned, ...unpinned]
  }, [filteredSessions])

  const newSession = useCallback(() => {
    if (!dept) return
    setPrefs({ workingDir: dept.directory })
    window.electronAPI.prefsSet('workingDir', dept.directory)
    useChatStore.getState().clearMessages()
    useUiStore.getState().setMainView('chat')
  }, [dept, setPrefs])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        newSession()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [newSession])

  const openFiles = () => {
    if (!dept) return
    setPrefs({ workingDir: dept.directory })
    window.electronAPI.prefsSet('workingDir', dept.directory)
    useUiStore.getState().setActiveNavItem('files')
  }

  if (!dept) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 56,
        flexShrink: 0,
        background: 'var(--glass-bg-raised)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--glass-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '14px 20px',
        gap: 10,
        position: 'relative',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        {/* Dept color accent bar */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 3,
          background: dept.color || '#6366f1',
          opacity: 0.75,
          borderRadius: '0 0 0 0',
        }} />
        {/* Back button — icon-only with hover background */}
        <button
          onClick={onBack}
          title={t('dept.backToOrgChart')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 6,
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <ArrowLeft size={15} />
        </button>

        {/* Color dot */}
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: dept.color || '#6366f1',
          flexShrink: 0,
          boxShadow: `0 0 0 2px rgba(255,255,255,0.08)`,
        }} />

        {/* Dept name + dir */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            {dept.name}
            {deptSessions.some(s => s.sessionId === currentSessionId) && (
              <div style={{
                width: 7, height: 7,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 0 2px rgba(34,197,94,0.25)',
                animation: 'dept-active-pulse 2s ease-in-out infinite',
                flexShrink: 0,
                marginLeft: 4,
              }} />
            )}
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 1,
          }}>
            <FolderOpen size={10} style={{ opacity: 0.7, flexShrink: 0 }} />
            {dept.directory}
          </div>
        </div>

        <button
          onClick={() => {
            setSelectMode(prev => !prev)
            setSelectedSessions(new Set())
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            borderRadius: 6,
            border: `1px solid ${selectMode ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.1)'}`,
            background: selectMode ? 'rgba(99,102,241,0.1)' : 'transparent',
            color: selectMode ? '#818cf8' : 'var(--text-secondary)',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (!selectMode) {
              e.currentTarget.style.borderColor = 'var(--text-faint)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }
          }}
          onMouseLeave={e => {
            if (!selectMode) {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }
          }}
        >
          {selectMode ? t('session.exitSelect') : t('session.selectMode')}
        </button>

        <button
          onClick={() => {
            const data = deptSessions.map(s => ({
              id: s.sessionId,
              title: s.title || s.lastPrompt?.slice(0, 60) || 'Untitled',
              lastPrompt: s.lastPrompt,
              messageCount: s.messageCount,
              timestamp: new Date(s.timestamp).toISOString(),
              project: s.project,
            }))
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${dept.name.replace(/[^a-z0-9]/gi, '_')}_sessions_${new Date().toISOString().slice(0,10)}.json`
            a.click()
            URL.revokeObjectURL(url)
          }}
          title="Export sessions as JSON"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 10px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(34,197,94,0.4)'
            e.currentTarget.style.color = '#22c55e'
            e.currentTarget.style.background = 'rgba(34,197,94,0.06)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          ↓ Export
        </button>

        <button
          onClick={openFiles}
          title={t('dept.files')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 11px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'
            e.currentTarget.style.color = '#818cf8'
            e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <FolderOpen size={13} />
          {t('dept.files')}
        </button>

        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: 2, flexShrink: 0 }}>
          {([['recent', '↓Time'], ['oldest', '↑Time'], ['msgs', 'Msgs']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSortOrder(val)}
              style={{
                padding: '3px 7px',
                borderRadius: 4,
                border: 'none',
                background: sortOrder === val ? 'rgba(99,102,241,0.25)' : 'transparent',
                color: sortOrder === val ? '#6366f1' : 'var(--text-muted)',
                fontSize: 10,
                cursor: 'pointer',
                fontWeight: sortOrder === val ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={newSession}
          title={t('dept.newSession')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '9px 20px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.opacity = '0.88'
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.45)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.35)'
          }}
        >
          <MessageSquarePlus size={13} />
          {t('dept.newSession')}
          <kbd style={{
            fontSize: 9,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 3,
            padding: '0px 4px',
            lineHeight: '14px',
            fontFamily: 'monospace',
            marginLeft: 2,
          }}>N</kbd>
        </button>
      </div>

      {/* Sessions area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 24px', background: 'var(--bg-chat)' }}>
        {/* Section header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 10,
          borderLeft: '2px solid rgba(99,102,241,0.7)',
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: 'var(--glass-bg-raised)',
          paddingTop: 4,
          paddingBottom: 10,
          marginBottom: 8,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          <span style={{
            color: 'var(--text-faint)',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}>
            {t('dept.sessions')}
          </span>
          <span style={{
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: '1px 7px',
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--text-faint)',
          }}>
            {searchQuery.trim() ? pinnedFilteredSessions.length : deptSessions.length}
          </span>
        </div>

        {/* Stats row */}
        {deptSessions.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--glass-bg-low)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)'
              el.style.borderColor = 'var(--glass-border-md)'
              el.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
              el.style.borderColor = 'rgba(255,255,255,0.08)'
              el.style.transform = 'translateY(0)'
            }}
          >
            {[
              {
                label: t('dept.sessions'),
                value: deptSessions.length,
                color: '#6366f1',
              },
              {
                label: t('session.today'),
                value: (() => {
                  const todayStart = new Date().setHours(0,0,0,0)
                  return deptSessions.filter(s => s.timestamp >= todayStart).length
                })(),
                color: (() => {
                  const todayStart = new Date().setHours(0,0,0,0)
                  return deptSessions.filter(s => s.timestamp >= todayStart).length > 0 ? '#22c55e' : 'var(--text-primary)'
                })(),
              },
              {
                label: t('dept.msgCount'),
                value: deptSessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0),
                color: 'var(--text-primary)',
              },
            ].map(stat => (
              <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1.4 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{
          position: 'relative',
          marginBottom: 18,
        }}>
          <Search size={12} style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
            pointerEvents: 'none',
            opacity: 0.6,
          }} />
          <input
            placeholder={t('dept.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              width: '100%',
              padding: '6px 32px 6px 30px',
              borderRadius: 6,
              border: `1px solid ${searchFocused ? 'rgba(99,102,241,0.40)' : 'rgba(255,255,255,0.1)'}`,
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary)',
              fontSize: 12,
              boxSizing: 'border-box',
              outline: 'none',
              transition: 'all 0.15s ease',
              boxShadow: searchFocused ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                borderRadius: 3,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {selectMode && selectedSessions.size > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 8,
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600, flex: 1 }}>
              {t('session.selectedCount', { count: selectedSessions.size })}
            </span>
            <button
              onClick={() => setSelectedSessions(new Set(pinnedFilteredSessions.map(s => s.sessionId)))}
              style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t('session.selectAll')}
            </button>
            <button
              onClick={async () => {
                for (const id of selectedSessions) {
                  await onDeleteSession?.(id)
                }
                setSelectedSessions(new Set())
                setSelectMode(false)
              }}
              style={{
                fontSize: 11, fontWeight: 600,
                color: '#f87171',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 5,
                padding: '3px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.2)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'
              }}
            >
              {t('session.deleteSelected')} ({selectedSessions.size})
            </button>
          </div>
        )}

        {sessionsLoading ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  width: 240,
                  minHeight: 130,
                  borderRadius: 12,
                  background: 'linear-gradient(90deg, var(--glass-shimmer) 25%, var(--glass-border) 50%, var(--glass-shimmer) 75%)',
                  backgroundSize: '200% 100%',
                  border: '1.5px solid var(--glass-border)',
                  animation: 'shimmer 1.6s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        ) : deptSessions.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '56px 20px',
            gap: 16,
            color: 'var(--text-muted)',
            textAlign: 'center',
            animation: 'dept-empty-in 0.15s ease-out',
          }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <MessageSquarePlus size={30} style={{ opacity: 0.35, color: '#6366f1' }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {t('dept.noSessions')}
              </div>
              <div style={{ fontSize: 12, opacity: 0.65, maxWidth: 240, lineHeight: 1.65 }}>
                {t('dept.noSessionsHint')}
              </div>
            </div>
            <button
              onClick={newSession}
              style={{
                marginTop: 4,
                padding: '9px 22px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99,102,241,0.45)',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = '0.9'
                e.currentTarget.style.boxShadow = '0 6px 18px rgba(99,102,241,0.55)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.45)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <MessageSquarePlus size={13} />
              {t('dept.newSession')}
            </button>
          </div>
        ) : pinnedFilteredSessions.length === 0 && searchQuery ? (
          <div style={{
            padding: '40px 16px',
            textAlign: 'center',
            color: 'var(--text-faint)',
            fontSize: 13,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}>
            <Search size={22} style={{ opacity: 0.2 }} />
            <span style={{ opacity: 0.65 }}>{t('dept.noSearchResults')}</span>
          </div>
        ) : (
          (() => {
            const renderSessionCard = (session: SessionListItem) => (
              <div
                key={session.sessionId}
                style={{ position: 'relative' }}
                onClick={selectMode ? e => {
                  e.stopPropagation()
                  setSelectedSessions(prev => {
                    const next = new Set(prev)
                    if (next.has(session.sessionId)) next.delete(session.sessionId)
                    else next.add(session.sessionId)
                    return next
                  })
                } : undefined}
              >
                {selectMode && (
                  <div style={{
                    position: 'absolute',
                    top: 8, left: 8,
                    width: 18, height: 18,
                    borderRadius: 4,
                    border: `2px solid ${selectedSessions.has(session.sessionId) ? '#6366f1' : 'rgba(255,255,255,0.3)'}`,
                    background: selectedSessions.has(session.sessionId) ? '#6366f1' : 'transparent',
                    zIndex: 5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}>
                    {selectedSessions.has(session.sessionId) && (
                      <div style={{ width: 4, height: 8, borderRight: '2px solid #fff', borderBottom: '2px solid #fff', transform: 'rotate(45deg) translate(-1px, -1px)' }} />
                    )}
                  </div>
                )}
                <div style={{ opacity: selectMode ? 0.85 : 1, pointerEvents: selectMode ? 'none' : 'auto' }}>
                  <div style={{
                    borderRadius: 12,
                    overflow: 'hidden',
                    borderLeft: sessionColorLabels[session.sessionId]
                      ? `4px solid ${sessionColorLabels[session.sessionId]}`
                      : undefined,
                  }}>
                    <SessionCard
                      session={session}
                      isActive={!selectMode && session.sessionId === currentSessionId}
                      onClick={selectMode ? () => {} : () => onOpenSession(session)}
                      isLoading={loadingSessionId === session.sessionId}
                      onDelete={selectMode ? undefined : () => onDeleteSession?.(session.sessionId)}
                    />
                  </div>
                </div>
              </div>
            )

            if (sortOrder !== 'recent') {
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {pinnedFilteredSessions.map(renderSessionCard)}
                </div>
              )
            }

            const now = new Date()
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
            const yesterdayStart = todayStart - 86400000
            const weekStart = todayStart - 6 * 86400000

            const groups: { label: string; sessions: SessionListItem[] }[] = []
            const today = pinnedFilteredSessions.filter(s => s.timestamp >= todayStart)
            const yesterday = pinnedFilteredSessions.filter(s => s.timestamp >= yesterdayStart && s.timestamp < todayStart)
            const thisWeek = pinnedFilteredSessions.filter(s => s.timestamp >= weekStart && s.timestamp < yesterdayStart)
            const older = pinnedFilteredSessions.filter(s => s.timestamp < weekStart)

            if (today.length) groups.push({ label: t('session.today'), sessions: today })
            if (yesterday.length) groups.push({ label: t('session.yesterday'), sessions: yesterday })
            if (thisWeek.length) groups.push({ label: t('session.thisWeek'), sessions: thisWeek })
            if (older.length) groups.push({ label: t('session.thisMonth'), sessions: older })

            return (
              <div>
                {groups.map(group => (
                  <div key={group.label} style={{ marginBottom: 20 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--text-faint)',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      marginBottom: 10,
                      paddingLeft: 8,
                      borderLeft: `2px solid ${dept.color || '#6366f1'}`,
                    }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {group.sessions.map(renderSessionCard)}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()
        )}
      </div>
    </div>
  )
}

// ── Org Chart — all departments ──────────────────────────────────────────────
interface OrgChartProps {
  onSelectDept: (deptId: string) => void
  onOpenSession: (session: SessionListItem, deptDirectory: string) => void
  loadingSessionId?: string | null
  onDeleteSession?: (sessionId: string) => void
}

function OrgChart({ onSelectDept, onOpenSession, loadingSessionId, onDeleteSession }: OrgChartProps) {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const allSessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const sessionColorLabels = usePrefsStore(s => s.prefs?.sessionColorLabels ?? EMPTY_COLOR_LABELS)

  const [hoveredDept, setHoveredDept] = useState<string | null>(null)
  const [deptSearch, setDeptSearch] = useState('')
  const [statsPopoverId, setStatsPopoverId] = useState<string | null>(null)
  const [statsPopoverPos, setStatsPopoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [showAddDept, setShowAddDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptDir, setNewDeptDir] = useState('')
  const addNewDept = useDepartmentStore(s => s.addDepartment)

  useEffect(() => {
    if (!statsPopoverId) return
    const close = () => setStatsPopoverId(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [statsPopoverId])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !showAddDept) {
        e.preventDefault()
        setShowAddDept(true)
      }
      if (e.key === 'Escape' && showAddDept) {
        setShowAddDept(false)
        setNewDeptName('')
        setNewDeptDir('')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showAddDept])

  const filteredDepts = useMemo(() => {
    if (!deptSearch.trim()) return departments
    const q = deptSearch.toLowerCase()
    return departments.filter(d => d.name.toLowerCase().includes(q))
  }, [departments, deptSearch])

  // 3 most recently active sessions across ALL departments
  const recentSessions = useMemo(() => {
    const deptSlugs = new Set(departments.map(d => dirToSlug(d.directory)))
    return allSessions
      .filter(s => deptSlugs.has(s.projectSlug))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3)
  }, [allSessions, departments])

  // Sessions per dept
  const sessionsByDept = useMemo(() => {
    const map: Record<string, SessionListItem[]> = {}
    for (const dept of departments) {
      const deptSlug = dirToSlug(dept.directory)
      map[dept.id] = allSessions
        .filter(s => s.projectSlug === deptSlug)
        .sort((a, b) => b.timestamp - a.timestamp)
    }
    return map
  }, [departments, allSessions])

  const newSessionInDept = (dept: { id: string; directory: string; name: string; color?: string }) => {
    setPrefs({ workingDir: dept.directory })
    window.electronAPI.prefsSet('workingDir', dept.directory)
    useChatStore.getState().clearMessages()
    useUiStore.getState().setMainView('chat')
  }

  const handleAdd = () => {
    if (!newDeptName.trim() || !newDeptDir.trim()) return
    addNewDept({
      name: newDeptName.trim(),
      directory: newDeptDir.trim(),
      color: '#6366f1',
    })
    setShowAddDept(false)
    setNewDeptName('')
    setNewDeptDir('')
  }

  if (departments.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 0,
      }}>
        {/* Beautiful empty state card */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          padding: '40px 36px',
          borderRadius: 16,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--glass-border)',
          maxWidth: 300,
          textAlign: 'center',
        }}>
          <Building2 size={48} color="var(--text-muted)" style={{ opacity: 0.2 }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              {t('dept.noSelection')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65, opacity: 0.8 }}>
              {t('dept.noSelectionHint')}
            </div>
          </div>
          <button
            onClick={() => useUiStore.getState().setMainView('department')}
            style={{
              marginTop: 4,
              padding: '8px 18px',
              borderRadius: 7,
              border: '1px solid rgba(99,102,241,0.6)',
              background: 'rgba(99,102,241,0.1)',
              color: '#818cf8',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)' }}
          >
            + {t('dept.create')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 24px', background: 'var(--bg-chat)' }}>
      <div style={{ marginBottom: 16, position: 'relative' }}>
        <Search size={12} style={{
          position: 'absolute', left: 10, top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)', opacity: 0.6,
          pointerEvents: 'none',
        }} />
        <input
          value={deptSearch}
          onChange={e => setDeptSearch(e.target.value)}
          placeholder={t('dept.searchDepts')}
          style={{
            width: '100%',
            padding: '7px 30px 7px 30px',
            borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'all 0.15s ease',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = 'none' }}
        />
        {deptSearch && (
          <button
            onClick={() => setDeptSearch('')}
            style={{
              position: 'absolute', right: 8, top: '50%',
              transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 2,
              display: 'flex', alignItems: 'center',
              borderRadius: 3,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* No results state */}
      {filteredDepts.length === 0 && deptSearch && (
        <div style={{
          padding: '20px 10px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 12,
          opacity: 0.6,
        }}>
          {t('dept.noSearchResults')}
        </div>
      )}

      {recentSessions.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12,
            paddingLeft: 10,
            borderLeft: '2px solid rgba(99,102,241,0.7)',
            position: 'relative',
          }}>
            <span style={{
              color: 'var(--text-faint)', fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              {t('dept.recent')}
            </span>
            <div style={{
              position: 'absolute',
              bottom: -4, left: 10, right: 0,
              height: 1,
              background: 'linear-gradient(to right, rgba(99,102,241,0.25), transparent)',
              pointerEvents: 'none',
            }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {recentSessions.map(session => {
              const dept = departments.find(d => dirToSlug(d.directory) === session.projectSlug)
              return (
                <div
                  key={session.sessionId}
                  style={{
                    position: 'relative',
                    borderRadius: 12,
                    overflow: 'hidden',
                    borderLeft: sessionColorLabels[session.sessionId]
                      ? `4px solid ${sessionColorLabels[session.sessionId]}`
                      : undefined,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)'
                    el.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.boxShadow = 'none'
                    el.style.transform = 'translateY(0)'
                  }}
                >
                  {dept?.color && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0,
                      height: 2, borderRadius: '12px 12px 0 0',
                      background: dept.color, zIndex: 1,
                    }} />
                  )}
                  <SessionCard
                    session={session}
                    isActive={session.sessionId === currentSessionId}
                    onClick={() => onOpenSession(session, dept?.directory ?? '')}
                    isLoading={loadingSessionId === session.sessionId}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
      {filteredDepts.map(dept => {
        const sessions = sessionsByDept[dept.id] || []
        const isHovered = hoveredDept === dept.id
        return (
          <div key={dept.id} style={{ marginBottom: 36 }}>
            {/* Dept header — clickable to enter dept view */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: 0,
                margin: '0 -10px 14px',
                background: isHovered ? 'rgba(255,255,255,0.04)' : 'var(--glass-bg-raised)',
                transition: 'all 0.15s ease',
                borderLeft: `3px solid ${isHovered ? (dept.color || '#6366f1') : 'transparent'}`,
                paddingLeft: isHovered ? 7 : 10,
                position: 'sticky',
                top: 0,
                zIndex: 3,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                paddingTop: 4,
                paddingBottom: 4,
                marginBottom: 10,
              }}
              onClick={() => onSelectDept(dept.id)}
              onMouseEnter={() => setHoveredDept(dept.id)}
              onMouseLeave={() => setHoveredDept(null)}
            >
              {/* Color dot — larger and more prominent */}
              <button
                onClick={e => {
                  e.stopPropagation()
                  const rect = e.currentTarget.getBoundingClientRect()
                  setStatsPopoverPos({ x: rect.right + 8, y: rect.top })
                  setStatsPopoverId(statsPopoverId === dept.id ? null : dept.id)
                }}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: dept.color || '#6366f1',
                  flexShrink: 0,
                  boxShadow: sessions.some(s => s.sessionId === currentSessionId)
                    ? `0 0 0 2px rgba(255,255,255,0.12), 0 0 6px 2px ${dept.color || '#6366f1'}44`
                    : `0 0 0 2px rgba(255,255,255,0.08)`,
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  animation: sessions.some(s => s.sessionId === currentSessionId)
                    ? 'dept-dot-pulse 2s ease infinite'
                    : 'none',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.3)'; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(255,255,255,0.15)` }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = `0 0 0 2px rgba(255,255,255,0.08)` }}
                title="View department stats"
              />

              {/* Dept name */}
              <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}>
                {dept.name}
              </span>

              {/* Session count badge — pill */}
              <span style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                background: 'var(--glass-border-md)',
                borderRadius: 20,
                padding: '1px 8px',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
              }}>
                {sessions.length}
              </span>

              {/* Active session indicator */}
              {sessions.some(s => s.sessionId === currentSessionId) && (
                <div style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#22c55e',
                  boxShadow: '0 0 0 2px rgba(34,197,94,0.25)',
                  animation: 'dept-active-pulse 2s ease-in-out infinite',
                  flexShrink: 0,
                }} />
              )}

              {/* Divider line — thinner, more subtle */}
              <div style={{
                flex: 1,
                height: 1,
                background: dept.color
                  ? `linear-gradient(to right, ${dept.color}55, transparent)`
                  : 'rgba(255,255,255,0.08)',
                marginLeft: 2,
              }} />

              <ChevronRight
                size={13}
                style={{
                  color: isHovered ? 'var(--text-secondary)' : 'var(--text-muted)',
                  opacity: isHovered ? 0.8 : 0.4,
                  transition: 'all 0.15s ease',
                }}
              />
            </div>

            {sessionsLoading ? (
              <div style={{ display: 'flex', gap: 10 }}>
                {[1, 2].map(i => (
                  <div
                    key={i}
                    style={{
                      width: 240,
                      height: 130,
                      borderRadius: 12,
                      background: 'linear-gradient(90deg, var(--glass-shimmer) 25%, var(--glass-border) 50%, var(--glass-shimmer) 75%)',
                      backgroundSize: '200% 100%',
                      border: '1.5px solid var(--glass-border)',
                      animation: 'shimmer 1.6s ease-in-out infinite',
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div
                onClick={() => newSessionInDept(dept)}
                style={{
                  padding: '16px 16px',
                  borderRadius: 8,
                  border: '1px dashed rgba(255,255,255,0.1)',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  opacity: 0.65,
                  letterSpacing: '0.01em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.opacity = '1'
                  el.style.borderColor = dept.color || '#6366f1'
                  el.style.color = dept.color || '#6366f1'
                  el.style.background = 'rgba(99,102,241,0.04)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.opacity = '0.65'
                  el.style.borderColor = 'rgba(255,255,255,0.1)'
                  el.style.color = 'var(--text-muted)'
                  el.style.background = 'transparent'
                }}
              >
                <MessageSquarePlus size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
                <span>{t('dept.noSessions')} — <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>{t('dept.newSession')}</span></span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {sessions.slice(0, 6).map(session => (
                  <div
                    key={session.sessionId}
                    style={{ position: 'relative', transition: 'all 0.15s ease' }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)'
                      el.style.transform = 'translateY(-1px)'
                      // reveal action overlay
                      const overlay = el.querySelector('.session-action-overlay') as HTMLElement | null
                      if (overlay) overlay.style.opacity = '1'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.boxShadow = 'none'
                      el.style.transform = 'translateY(0)'
                      const overlay = el.querySelector('.session-action-overlay') as HTMLElement | null
                      if (overlay) overlay.style.opacity = '0'
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                      background: dept.color || '#6366f1',
                      borderRadius: '12px 12px 0 0', zIndex: 1, opacity: 0.7,
                    }} />
                    {/* Hover action overlay — open in dept */}
                    <div
                      className="session-action-overlay"
                      style={{
                        position: 'absolute',
                        top: 8, right: 8,
                        zIndex: 5,
                        display: 'flex',
                        gap: 4,
                        opacity: 0,
                        transition: 'all 0.15s ease',
                        pointerEvents: 'auto',
                      }}
                    >
                      <button
                        onClick={e => { e.stopPropagation(); onSelectDept(dept.id) }}
                        title="Open in department"
                        style={{
                          background: 'var(--glass-bg-raised)',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 6,
                          padding: '3px 7px',
                          fontSize: 9,
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#818cf8'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                      >
                        Open
                      </button>
                    </div>
                    <div style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      borderLeft: sessionColorLabels[session.sessionId]
                        ? `4px solid ${sessionColorLabels[session.sessionId]}`
                        : undefined,
                    }}>
                      <SessionCard
                        session={session}
                        isActive={session.sessionId === currentSessionId}
                        onClick={() => onOpenSession(session, dept.directory)}
                        isLoading={loadingSessionId === session.sessionId}
                        onDelete={() => onDeleteSession?.(session.sessionId)}
                      />
                    </div>
                  </div>
                ))}
                {sessions.length > 6 && (
                  <div
                    onClick={() => onSelectDept(dept.id)}
                    style={{
                      minHeight: 130,
                      borderRadius: 12,
                      border: '1.5px dashed rgba(255,255,255,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: 6,
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      transition: 'all 0.15s ease',
                      background: 'rgba(255,255,255,0.02)',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.borderColor = '#6366f1'
                      el.style.color = '#6366f1'
                      el.style.background = 'rgba(99,102,241,0.06)'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.borderColor = 'rgba(255,255,255,0.12)'
                      el.style.color = 'var(--text-muted)'
                      el.style.background = 'rgba(255,255,255,0.02)'
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 700 }}>+{sessions.length - 6}</span>
                    <span style={{ letterSpacing: '0.03em' }}>{t('dept.sessions')}</span>
                  </div>
                )}
                {/* New session card — only shown when ≤6 sessions (no "+N more" card visible) */}
                {sessions.length <= 6 && (
                <div
                  onClick={() => newSessionInDept(dept)}
                  title={t('dept.newSession')}
                  style={{
                    minHeight: 130,
                    borderRadius: 12,
                    border: '1.5px dashed rgba(255,255,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 6,
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    transition: 'all 0.15s ease',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = '#6366f1'
                    el.style.color = '#6366f1'
                    el.style.background = 'rgba(99,102,241,0.06)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'rgba(255,255,255,0.15)'
                    el.style.color = 'var(--text-muted)'
                    el.style.background = 'rgba(255,255,255,0.02)'
                  }}
                >
                  <span style={{ fontSize: 28, fontWeight: 200, lineHeight: 1 }}>+</span>
                  <span style={{ fontSize: 10, letterSpacing: '0.03em' }}>{t('dept.newSession')}</span>
                </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {/* Department stats popover */}
      {statsPopoverId && (() => {
        const dept = departments.find(d => d.id === statsPopoverId)
        if (!dept) return null
        const sessions = sessionsByDept[dept.id] || []
        const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)
        const todayStart = new Date().setHours(0,0,0,0)
        const todayCount = sessions.filter(s => s.timestamp >= todayStart).length
        const lastSession = sessions[0]
        return (
          <div
            style={{
              position: 'fixed',
              left: statsPopoverPos.x,
              top: statsPopoverPos.y,
              zIndex: 200,
              background: 'var(--glass-bg-deep)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${dept.color || 'rgba(255,255,255,0.12)'}`,
              borderRadius: 10,
              padding: '12px 16px',
              minWidth: 200,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              animation: 'slideUp 0.15s ease',
            }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: dept.color || '#6366f1', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{dept.name}</span>
              <button onClick={() => setStatsPopoverId(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, borderRadius: 3, fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
            {[
              { label: 'Sessions', value: sessions.length },
              { label: 'Today', value: todayCount },
              { label: 'Messages', value: totalMessages },
              { label: 'Last Active', value: lastSession ? new Date(lastSession.timestamp).toLocaleDateString() : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{value}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {dept.directory}
            </div>
            <button
              onClick={() => {
                const sessions = sessionsByDept[dept.id] || []
                const data = sessions.map(s => ({
                  id: s.sessionId,
                  title: s.title || s.lastPrompt?.slice(0, 60) || 'Untitled',
                  lastPrompt: s.lastPrompt,
                  messageCount: s.messageCount,
                  timestamp: new Date(s.timestamp).toISOString(),
                }))
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${dept.name.replace(/[^a-z0-9]/gi, '_')}_sessions.json`
                a.click()
                URL.revokeObjectURL(url)
                setStatsPopoverId(null)
              }}
              style={{
                marginTop: 8,
                width: '100%',
                padding: '4px 8px',
                borderRadius: 5,
                border: '1px solid rgba(34,197,94,0.3)',
                background: 'rgba(34,197,94,0.06)',
                color: '#22c55e',
                fontSize: 10,
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(34,197,94,0.14)'
                e.currentTarget.style.borderColor = 'rgba(34,197,94,0.5)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(34,197,94,0.06)'
                e.currentTarget.style.borderColor = 'rgba(34,197,94,0.3)'
              }}
            >
              ↓ Export sessions
            </button>
          </div>
        )
      })()}

      {/* Quick-add new department */}
      {!showAddDept ? (
        <button
          onClick={() => setShowAddDept(true)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1.5px dashed rgba(255,255,255,0.1)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'center',
            marginTop: 8,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#6366f1'
            e.currentTarget.style.color = '#6366f1'
            e.currentTarget.style.background = 'rgba(99,102,241,0.05)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 200 }}>+</span>
          New Department
          <kbd style={{ fontSize: 9, background: 'rgba(255,255,255,0.08)', borderRadius: 3, padding: '0 4px', marginLeft: 2, fontFamily: 'monospace' }}>N</kbd>
        </button>
      ) : (
        <div style={{
          padding: '12px 14px',
          borderRadius: 8,
          border: '1px solid rgba(99,102,241,0.3)',
          background: 'rgba(99,102,241,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginTop: 8,
          animation: 'slideUp 0.15s ease',
        }}>
          <input
            autoFocus
            placeholder="Department name"
            value={newDeptName}
            onChange={e => setNewDeptName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setShowAddDept(false); setNewDeptName(''); setNewDeptDir('') }
              if (e.key === 'Enter' && newDeptName.trim() && newDeptDir.trim()) {
                handleAdd()
              }
            }}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 6,
              transition: 'all 0.15s ease',
              lineHeight: 1.5,
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          <input
            placeholder="Directory path (e.g. ~/projects/frontend)"
            value={newDeptDir}
            onChange={e => setNewDeptDir(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setShowAddDept(false); setNewDeptName(''); setNewDeptDir('') }
              if (e.key === 'Enter' && newDeptName.trim() && newDeptDir.trim()) {
                handleAdd()
              }
            }}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 6,
              transition: 'all 0.15s ease',
              lineHeight: 1.5,
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleAdd}
              disabled={!newDeptName.trim() || !newDeptDir.trim()}
              style={{
                flex: 1, padding: '6px 12px', borderRadius: 7, border: 'none',
                background: (!newDeptName.trim() || !newDeptDir.trim())
                  ? 'rgba(99,102,241,0.25)'
                  : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                color: 'var(--text-primary)', fontSize: 11, fontWeight: 600,
                cursor: (!newDeptName.trim() || !newDeptDir.trim()) ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: (!newDeptName.trim() || !newDeptDir.trim()) ? 'none' : '0 2px 10px rgba(99,102,241,0.3)',
              }}
              onMouseEnter={e => { if (newDeptName.trim() && newDeptDir.trim()) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = newDeptName.trim() && newDeptDir.trim() ? '0 2px 10px rgba(99,102,241,0.3)' : 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              Create
            </button>
            <button
              onClick={() => { setShowAddDept(false); setNewDeptName(''); setNewDeptDir('') }}
              style={{
                padding: '6px 12px', borderRadius: 7,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-border-md)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function DepartmentDashboard() {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const setActiveDepartmentId = useDepartmentStore(s => s.setActiveDepartmentId)

  const setSessions = useSessionStore(s => s.setSessions)
  const setLoading = useSessionStore(s => s.setLoading)

  // Local state: which dept is being drilled into (null = org chart)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [loadingSession, setLoadingSession] = useState<string | null>(null)

  // Always reload sessions when DepartmentDashboard mounts
  useEffect(() => {
    let isMounted = true
    setLoading(true)
    window.electronAPI.sessionList().then((list: any) => {
      if (!isMounted) return
      setSessions(list || [])
      setLoading(false)
    }).catch(() => { if (isMounted) setLoading(false) })
    return () => { isMounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount — always refresh sessions when entering dept view

  const handleSelectDept = (deptId: string) => {
    setActiveDepartmentId(deptId)
    setSelectedDeptId(deptId)
  }

  const handleBack = () => {
    setSelectedDeptId(null)
  }

  // Shared openSession handler passed down to both DeptView and OrgChart
  const handleOpenSession = async (session: SessionListItem, deptDirectory: string) => {
    if (loadingSession) return
    setLoadingSession(session.sessionId)
    try {
      await openSessionCore(session, deptDirectory)
    } catch {
      // ignore
    } finally {
      setLoadingSession(null)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      if (typeof window.electronAPI.sessionDelete === 'function') {
        await window.electronAPI.sessionDelete(sessionId)
      }
      const updated = useSessionStore.getState().sessions.filter(s => s.sessionId !== sessionId)
      useSessionStore.getState().setSessions(updated)
    } catch {
      // ignore
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-chat)' }}>
      <style>{`
        @keyframes dept-view-in {
          from { opacity: 0; transform: translateX(14px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes dept-org-in {
          from { opacity: 0; transform: translateX(-14px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes dept-active-pulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(34,197,94,0.25); }
          50%       { box-shadow: 0 0 0 5px rgba(34,197,94,0.0); }
        }
        @keyframes dept-stats-in {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dept-dot-pulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(99,102,241,0.25), 0 0 0 0 rgba(99,102,241,0.15); }
          50%       { box-shadow: 0 0 0 4px rgba(99,102,241,0.10), 0 0 6px 3px rgba(99,102,241,0.08); }
        }
        @keyframes dept-empty-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {selectedDeptId ? (
        <div key={selectedDeptId} style={{ flex: 1, overflow: 'hidden', animation: 'dept-view-in 0.15s ease-out' }}>
          <DeptView
            deptId={selectedDeptId}
            onBack={handleBack}
            onOpenSession={session => handleOpenSession(session, departments.find(d => d.id === selectedDeptId)?.directory ?? '')}
            loadingSessionId={loadingSession}
            onDeleteSession={handleDeleteSession}
          />
        </div>
      ) : (
        <div key="org" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', animation: 'dept-org-in 0.15s ease-out' }}>
          {/* Top bar — shown on org chart view */}
          <div style={{
            height: 56,
            flexShrink: 0,
            background: 'var(--glass-bg-raised)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: 9,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            <Building2 size={16} style={{ color: 'var(--text-muted)', opacity: 0.8 }} />
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', flex: 1, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
              {t('dept.orgChart')}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-muted)',
              background: 'var(--glass-border)',
              borderRadius: 20,
              padding: '2px 10px',
            }}>
              {departments.length} {t('dept.title')}
            </span>
          </div>
          <OrgChart
            onSelectDept={handleSelectDept}
            onOpenSession={handleOpenSession}
            loadingSessionId={loadingSession}
            onDeleteSession={handleDeleteSession}
          />
        </div>
      )}
    </div>
  )
}
