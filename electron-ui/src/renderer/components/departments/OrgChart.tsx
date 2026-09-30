// OrgChart — the company diagram at the top of the 「部门」 view.
//
// Only departments are drawn here: a company (HQ) node on top, a connector tree
// underneath, and one card per department showing headcount. Employees
// (sessions) are deliberately *not* listed at this level — clicking a card
// drills into that department, where the full roster lives.
//
// The tree re-flows as departments are added, so it never degenerates into a
// long ribbon of cards. Two shapes, picked from how many departments there are
// and how much room the pane has:
//
//   1 row  — symmetric: HQ centred, a trunk dropping straight into the middle of
//            the row, with a bus spanning the card centres.
//   2+ rows — a rail: the trunk runs down the left edge and every row hangs off
//            it on its own bus. Column count comes from the measured width, and
//            the rows are balanced so the last one never holds a single stray
//            card. Past DENSE_FROM departments the cards themselves compact and
//            more columns fit.
//
// Card and connector coordinates are computed in pixels from the measured
// container width (a percentage bus would drift off the card centres by the gap).
import React, { useEffect, useMemo, useState } from 'react'
import {
  BarChart3, Building2, ChevronRight, FolderOpen, MessageSquare, Plus, Search, Users, X,
} from 'lucide-react'
import { useChatStore, useDepartmentStore, useSessionStore } from '../../store'
import { SessionListItem } from '../../types/app.types'
import { useT } from '../../i18n'
import { cardStyle, ToolbarButton } from '../workflows/EmployeesShared'
import { baseName, dirToSlug } from './deptUtils'

const ACCENT = '#6366f1'
/** Horizontal gap between cards in a row. */
const GAP = 16
/** Below this card width a card stops being readable, so a column is dropped. */
const CARD_MIN_FULL = 216
const CARD_MIN_DENSE = 180
/** Cards stop growing past this width — otherwise one department gets a billboard. */
const CARD_MAX_FULL = 400
const CARD_MAX_DENSE = 300
const MAX_COLS_FULL = 4
const MAX_COLS_DENSE = 5
/** Department count at which cards compact to keep the whole tree on screen. */
const DENSE_FROM = 9
/** X of the rail in the multi-row layout, and the gap between rail and cards. */
const RAIL_X = 26
const RAIL_GAP = 26

/** Connector lengths — tightened in dense mode to keep many rows compact. */
interface TreeMetrics { trunk: number; drop: number; rowGap: number }
const METRICS_FULL: TreeMetrics = { trunk: 28, drop: 28, rowGap: 26 }
const METRICS_DENSE: TreeMetrics = { trunk: 20, drop: 20, rowGap: 16 }

/** Deterministic emoji per department, so a card keeps its face across reloads. */
const DEPT_EMOJI = ['🏢', '🧪', '🎨', '📊', '🛠️', '📈', '🧠', '🔬', '🚀', '📦', '💡', '🗂️', '🛰️', '🧰', '📐', '🎯', '🧩', '⚙️']

function deptEmoji(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return DEPT_EMOJI[hash % DEPT_EMOJI.length]
}

const ELLIPSIS: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function relativeTime(timestamp: number | undefined, t: (key: string) => string): string {
  if (!timestamp) return '—'
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('session.justNow')
  if (minutes < 60) return `${minutes}${t('session.minutesAgo')}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}${t('session.hoursAgo')}`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}${t('session.daysAgo')}`
  return new Date(timestamp).toLocaleDateString()
}

// ── Layout ──────────────────────────────────────────────────────────────────

interface TreeLayout {
  /** Card count per row — always sums to the number of departments. */
  rows: number[]
  cols: number
  cardWidth: number
  /** Left edge of the card area (top-left of the first card). */
  cardLeft: number
  /** X of the trunk: the pane centre in single-row mode, the rail otherwise. */
  spineX: number
  single: boolean
  metrics: TreeMetrics
}

/**
 * Split `count` cards into rows of at most `cols`, then even out a lone trailing
 * card — `4 + 1` reads as a stray, `3 + 2` reads as deliberate. Only safe with
 * 3+ columns, since borrowing would otherwise leave the row above with one card.
 */
function balanceRows(count: number, cols: number): number[] {
  const rows: number[] = []
  for (let left = count; left > 0;) {
    const take = Math.min(cols, left)
    rows.push(take)
    left -= take
  }
  if (rows.length >= 2 && rows[rows.length - 1] === 1 && cols >= 3) {
    rows[rows.length - 2] -= 1
    rows[rows.length - 1] = 2
  }
  return rows
}

function computeLayout(width: number, count: number, dense: boolean): TreeLayout | null {
  if (width <= 0 || count <= 0) return null
  const cardMin = dense ? CARD_MIN_DENSE : CARD_MIN_FULL
  const cardMax = dense ? CARD_MAX_DENSE : CARD_MAX_FULL
  const maxCols = dense ? MAX_COLS_DENSE : MAX_COLS_FULL
  const railOffset = RAIL_X + RAIL_GAP

  const colsWithin = (avail: number) =>
    Math.max(1, Math.min(maxCols, Math.floor((avail + GAP) / (cardMin + GAP))))

  // The rail costs a lane on the left, so first ask how many columns fit with it
  // taken out. If everything still lands on one row, the rail is unnecessary and
  // the full width is available again.
  const colsWithRail = colsWithin(width - railOffset)
  const single = count <= colsWithRail
  const cols = single ? colsWithin(width) : colsWithRail

  const rows = balanceRows(count, cols)
  const avail = width - (single ? 0 : railOffset)
  const cardWidth = Math.min(cardMax, Math.max(0, (avail - (cols - 1) * GAP) / cols))
  const rowWidth = count * cardWidth + (count - 1) * GAP
  return {
    rows,
    cols,
    cardWidth,
    cardLeft: single ? Math.max(0, (width - rowWidth) / 2) : railOffset,
    spineX: single ? width / 2 : RAIL_X,
    single,
    metrics: dense ? METRICS_DENSE : METRICS_FULL,
  }
}

/** Centre x of each card in a row of `size`, in container coordinates. */
function rowCenters(size: number, cardWidth: number, cardLeft: number): number[] {
  return Array.from({ length: size }, (_, i) => cardLeft + i * (cardWidth + GAP) + cardWidth / 2)
}

// ── Connector lines ─────────────────────────────────────────────────────────

/** Vertical connector at x (px), from `top` downwards. */
function VLine({ x, top, height, stretch }: { x: number; top: number; height?: number; stretch?: boolean }) {
  return (
    <div style={{
      position: 'absolute',
      left: x - 1,
      top,
      ...(stretch ? { bottom: 0 } : { height }),
      width: 2,
      borderRadius: 2,
      background: 'linear-gradient(180deg, rgba(99,102,241,0.55), rgba(99,102,241,0.22))',
      pointerEvents: 'none',
    }} />
  )
}

/** Horizontal bus line between two card centres. */
function HLine({ from, to, top }: { from: number; to: number; top: number }) {
  if (to - from <= 1) return null
  return (
    <div style={{
      position: 'absolute',
      left: from,
      width: to - from,
      top,
      height: 2,
      borderRadius: 2,
      background: 'linear-gradient(90deg, rgba(99,102,241,0.22), rgba(99,102,241,0.55), rgba(99,102,241,0.22))',
      pointerEvents: 'none',
    }} />
  )
}

// ── Department card ─────────────────────────────────────────────────────────

interface DeptCardProps {
  dept: { id: string; name: string; directory: string; color?: string }
  sessions: SessionListItem[]
  sessionsLoading: boolean
  hasActiveSession: boolean
  /** Compact card for the many-department layout. */
  dense: boolean
  onEnter: () => void
  onRecruit: () => void
  onStats: (e: React.MouseEvent) => void
}

function DeptCard({ dept, sessions, sessionsLoading, hasActiveSession, dense, onEnter, onRecruit, onStats }: DeptCardProps) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  const color = dept.color || ACCENT
  const messageCount = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEnter}
      onKeyDown={e => { if (e.key === 'Enter') onEnter() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...cardStyle(hovered),
        display: 'flex',
        flexDirection: 'column',
        minHeight: dense ? 108 : 132,
        overflow: 'hidden',
        borderColor: hovered ? `${color}88` : undefined,
      }}
    >
      {/* Department colour accent */}
      <div style={{ height: 3, flexShrink: 0, background: `linear-gradient(90deg, ${color}, ${color}33)` }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: dense ? 8 : 10, padding: dense ? '10px 11px 8px' : '12px 13px 10px', flex: 1 }}>
        <span style={{
          width: dense ? 30 : 36, height: dense ? 30 : 36, borderRadius: dense ? 8 : 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: dense ? 15 : 18, lineHeight: 1,
          background: `${color}1f`, border: `1px solid ${color}33`,
          transform: hovered ? 'scale(1.06)' : 'scale(1)',
          transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          {deptEmoji(dept.id)}
        </span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: dense ? 12 : 13, fontWeight: 700, color: 'var(--text-primary)', ...ELLIPSIS }}>
              {dept.name}
            </span>
            {hasActiveSession && (
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)',
                animation: 'dept-active-pulse 2s ease-in-out infinite',
              }} />
            )}
          </span>
          <span
            title={dept.directory}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginTop: 3, minWidth: 0 }}
          >
            <FolderOpen size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span style={ELLIPSIS}>{baseName(dept.directory)}</span>
          </span>
        </span>

        <button
          onClick={e => { e.stopPropagation(); onStats(e) }}
          onMouseDown={e => e.stopPropagation()}
          title={t('dept.stats')}
          style={{
            flexShrink: 0, padding: 4, borderRadius: 6, border: 'none',
            background: hovered ? 'rgba(99,102,241,0.12)' : 'transparent',
            color: hovered ? '#818cf8' : 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', transition: 'all 0.15s ease',
          }}
        >
          <BarChart3 size={13} />
        </button>
      </div>

      {/* Footer: headcount, messages, and on hover the drill-in / recruit actions */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: dense ? 9 : 12,
        padding: dense ? '6px 11px' : '8px 13px',
        borderTop: '1px solid var(--glass-border)',
        fontSize: 11, color: 'var(--text-muted)',
        minHeight: 33,
      }}>
        <span title={t('dept.staff')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
          <Users size={11} />{sessionsLoading ? '·' : sessions.length}
        </span>
        <span title={t('dept.msgCount')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
          <MessageSquare size={11} />{sessionsLoading ? '·' : messageCount}
        </span>

        {hovered ? (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); onRecruit() }}
              title={t('dept.newSession')}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 7px', borderRadius: 20, cursor: 'pointer',
                fontSize: 10, fontWeight: 700, lineHeight: 1.5,
                border: `1px solid ${color}55`, background: `${color}18`, color,
              }}
            >
              <Plus size={9} />{t('dept.recruit')}
            </button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 1, color, fontSize: 10, fontWeight: 700 }}>
              {t('dept.enter')}<ChevronRight size={10} />
            </span>
          </span>
        ) : (
          <span style={{ marginLeft: 'auto', ...ELLIPSIS }}>{relativeTime(sessions[0]?.timestamp, t)}</span>
        )}
      </div>
    </div>
  )
}

// ── Org chart ───────────────────────────────────────────────────────────────

export interface OrgChartProps {
  onSelectDept: (deptId: string) => void
  /** Drill into the department with a fresh employee card waiting there. */
  onNewSessionInDept: (deptId: string) => void
}

export default function OrgChart({ onSelectDept, onNewSessionInDept }: OrgChartProps) {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const allSessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const addNewDept = useDepartmentStore(s => s.addDepartment)

  const [deptSearch, setDeptSearch] = useState('')
  const [showAddDept, setShowAddDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptDir, setNewDeptDir] = useState('')
  const [statsDeptId, setStatsDeptId] = useState<string | null>(null)
  const [statsPos, setStatsPos] = useState({ x: 0, y: 0 })
  const [width, setWidth] = useState(0)

  // Callback ref (not useRef) because the tree only mounts once there is at
  // least one department — a mount-time effect would observe nothing forever.
  const [treeEl, setTreeEl] = useState<HTMLDivElement | null>(null)

  // Track the tree width so the connector coordinates can be computed exactly:
  // a CSS-percentage bus would drift away from the card centres by the gap.
  useEffect(() => {
    if (!treeEl) return
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? 0
      if (next > 0) setWidth(next)
    })
    observer.observe(treeEl)
    setWidth(treeEl.clientWidth)
    return () => observer.disconnect()
  }, [treeEl])

  const sessionsByDept = useMemo(() => {
    const map: Record<string, SessionListItem[]> = {}
    for (const dept of departments) {
      const slug = dirToSlug(dept.directory)
      map[dept.id] = allSessions
        .filter(s => s.projectSlug === slug)
        .sort((a, b) => b.timestamp - a.timestamp)
    }
    return map
  }, [departments, allSessions])

  const filteredDepts = useMemo(() => {
    if (!deptSearch.trim()) return departments
    const q = deptSearch.toLowerCase()
    return departments.filter(d => d.name.toLowerCase().includes(q) || d.directory.toLowerCase().includes(q))
  }, [departments, deptSearch])

  // Past DENSE_FROM cards on screen the whole tree compacts so it still fits.
  const dense = filteredDepts.length >= DENSE_FROM
  const layout = useMemo(
    () => computeLayout(width, filteredDepts.length, dense),
    [width, filteredDepts.length, dense],
  )

  const closeAdd = () => { setShowAddDept(false); setNewDeptName(''); setNewDeptDir('') }

  const handleAdd = () => {
    if (!newDeptName.trim() || !newDeptDir.trim()) return
    const dept = addNewDept({ name: newDeptName.trim(), directory: newDeptDir.trim(), color: ACCENT })
    closeAdd()
    // Land straight in the new department so the first employee can be recruited.
    onSelectDept(dept.id)
  }

  const handleBrowseDir = async () => {
    const p = await window.electronAPI.fsShowOpenDialog()
    if (!p) return
    setNewDeptDir(p)
    if (!newDeptName.trim()) setNewDeptName(baseName(p))
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !showAddDept) {
        e.preventDefault()
        setShowAddDept(true)
      }
      if (e.key === 'Escape' && showAddDept) closeAdd()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showAddDept])

  useEffect(() => {
    if (!statsDeptId) return
    const close = () => setStatsDeptId(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [statsDeptId])

  const totalStaff = departments.reduce((sum, d) => sum + (sessionsByDept[d.id]?.length ?? 0), 0)
  const totalMessages = departments.reduce(
    (sum, d) => sum + (sessionsByDept[d.id] ?? []).reduce((n, s) => n + (s.messageCount ?? 0), 0),
    0,
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-chat)' }}>
      <div style={{
        // Wider pane once the tree needs several columns; a narrow pane falls back
        // to a single column rather than forcing a horizontal scrollbar.
        maxWidth: dense ? 1360 : 1180,
        minWidth: CARD_MIN_FULL + 48,
        margin: '0 auto',
        padding: '18px 24px 40px',
      }}>
        {/* Toolbar — department search + create */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search size={12} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', opacity: 0.6, pointerEvents: 'none',
            }} />
            <input
              value={deptSearch}
              onChange={e => setDeptSearch(e.target.value)}
              placeholder={t('dept.searchDepts')}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '6px 30px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-hover)',
                color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            />
            {deptSearch && (
              <button
                onClick={() => setDeptSearch('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 2, display: 'flex', borderRadius: 3,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <X size={11} />
              </button>
            )}
          </div>
          <ToolbarButton onClick={() => (showAddDept ? closeAdd() : setShowAddDept(true))} primary title={t('dept.addTitle')}>
            <Plus size={13} />{t('dept.add')}
          </ToolbarButton>
        </div>

        {/* Create-department panel */}
        {showAddDept && (
          <div style={{
            marginBottom: 22, padding: '14px 16px', borderRadius: 12,
            border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)',
            display: 'flex', flexDirection: 'column', gap: 9,
            animation: 'slideUp 0.15s ease',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{t('dept.addTitle')}</div>
            <input
              autoFocus
              placeholder={t('dept.namePlaceholder')}
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') closeAdd(); if (e.key === 'Enter') handleAdd() }}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                placeholder={t('dept.dirPlaceholder')}
                value={newDeptDir}
                onChange={e => setNewDeptDir(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') closeAdd(); if (e.key === 'Enter') handleAdd() }}
                style={{
                  flex: 1, minWidth: 0,
                  padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                }}
              />
              <button
                onClick={handleBrowseDir}
                title={t('dept.selectWorkingDir')}
                style={{
                  padding: '6px 9px', borderRadius: 7, border: '1px dashed var(--border)',
                  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'flex', flexShrink: 0,
                }}
              >
                <FolderOpen size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleAdd}
                disabled={!newDeptName.trim() || !newDeptDir.trim()}
                style={{
                  flex: 1, padding: '7px 12px', borderRadius: 7, border: 'none',
                  background: (!newDeptName.trim() || !newDeptDir.trim())
                    ? 'rgba(99,102,241,0.25)'
                    : 'linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))',
                  color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: (!newDeptName.trim() || !newDeptDir.trim()) ? 'not-allowed' : 'pointer',
                }}
              >
                {t('dept.create')}
              </button>
              <button
                onClick={closeAdd}
                style={{
                  padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                }}
              >
                {t('dept.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Empty state — no department at all */}
        {departments.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '56px 20px', textAlign: 'center' }}>
            <div style={{
              width: 76, height: 76, borderRadius: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.16)',
            }}>
              <Building2 size={32} style={{ color: ACCENT, opacity: 0.45 }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {t('dept.noSelection')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', opacity: 0.8, lineHeight: 1.65, maxWidth: 280 }}>
                {t('dept.noSelectionHint')}
              </div>
            </div>
            <ToolbarButton onClick={() => setShowAddDept(true)} primary>
              <Plus size={13} />{t('dept.add')}
            </ToolbarButton>
          </div>
        ) : (
          <div ref={setTreeEl}>
            {/* Company node — centred above a single row, pushed left over the rail otherwise */}
            <div style={{
              display: 'flex',
              justifyContent: layout && !layout.single ? 'flex-start' : 'center',
              paddingLeft: layout && !layout.single ? Math.max(0, layout.spineX - 24) : 0,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 18px', borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.16), rgba(139,92,246,0.10))',
                border: '1px solid rgba(99,102,241,0.34)',
                boxShadow: '0 6px 22px rgba(99,102,241,0.16)',
              }}>
                <span style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.9))',
                  boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
                }}>
                  <Building2 size={20} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                    {t('dept.company')}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {t('dept.companyStaff', { depts: departments.length, staff: totalStaff })}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8, paddingLeft: 14, borderLeft: '1px solid rgba(99,102,241,0.28)' }}>
                  {[
                    { icon: <Users size={12} />, value: totalStaff, title: t('dept.staff') },
                    { icon: <MessageSquare size={12} />, value: totalMessages, title: t('dept.msgCount') },
                  ].map(stat => (
                    <span key={stat.title} title={stat.title} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ display: 'flex', color: '#818cf8' }}>{stat.icon}</span>
                      {sessionsLoading ? '·' : stat.value}
                    </span>
                  ))}
                </span>
              </div>
            </div>

            {/* Department rows hanging off the trunk */}
            {layout && (() => {
              const { cardWidth, cardLeft, spineX, single, metrics } = layout
              let cardIndex = 0
              return layout.rows.map((size, rowIndex) => {
                const isLastRow = rowIndex === layout.rows.length - 1
                const centers = rowCenters(size, cardWidth, cardLeft)
                const cards = filteredDepts.slice(cardIndex, cardIndex + size)
                cardIndex += size
                return (
                  <div
                    key={rowIndex}
                    style={{ position: 'relative', paddingBottom: isLastRow ? 0 : metrics.rowGap }}
                  >
                    {single ? (
                      <>
                        <VLine x={spineX} top={0} height={metrics.trunk} />
                        <HLine
                          from={Math.min(spineX, centers[0])}
                          to={Math.max(spineX, centers[centers.length - 1])}
                          top={metrics.trunk}
                        />
                      </>
                    ) : (
                      <>
                        {/* Rail: runs the height of every row but the last (which stops at its bus) */}
                        <VLine x={spineX} top={0} height={isLastRow ? metrics.trunk : undefined} stretch={!isLastRow} />
                        <HLine from={spineX} to={centers[centers.length - 1]} top={metrics.trunk} />
                      </>
                    )}
                    {centers.map((x, i) => <VLine key={i} x={x} top={metrics.trunk} height={metrics.drop} />)}

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${size}, ${cardWidth}px)`,
                      gap: GAP,
                      marginLeft: cardLeft,
                      paddingTop: metrics.trunk + metrics.drop,
                    }}>
                      {cards.map(dept => {
                        const sessions = sessionsByDept[dept.id] ?? []
                        return (
                          <DeptCard
                            key={dept.id}
                            dept={dept}
                            sessions={sessions}
                            sessionsLoading={sessionsLoading}
                            hasActiveSession={sessions.some(s => s.sessionId === currentSessionId)}
                            dense={dense}
                            onEnter={() => onSelectDept(dept.id)}
                            onRecruit={() => onNewSessionInDept(dept.id)}
                            onStats={e => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              setStatsPos({ x: rect.right + 8, y: rect.top })
                              setStatsDeptId(statsDeptId === dept.id ? null : dept.id)
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })
            })()}

            {/* Width not measured yet — lay the cards out without connectors */}
            {!layout && filteredDepts.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(filteredDepts.length, MAX_COLS_FULL)}, minmax(0, 1fr))`,
                gap: GAP,
                marginTop: METRICS_FULL.trunk + METRICS_FULL.drop,
              }}>
                {filteredDepts.map(dept => {
                  const sessions = sessionsByDept[dept.id] ?? []
                  return (
                    <DeptCard
                      key={dept.id}
                      dept={dept}
                      sessions={sessions}
                      sessionsLoading={sessionsLoading}
                      hasActiveSession={sessions.some(s => s.sessionId === currentSessionId)}
                      dense={dense}
                      onEnter={() => onSelectDept(dept.id)}
                      onRecruit={() => onNewSessionInDept(dept.id)}
                      onStats={e => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setStatsPos({ x: rect.right + 8, y: rect.top })
                        setStatsDeptId(statsDeptId === dept.id ? null : dept.id)
                      }}
                    />
                  )
                })}
              </div>
            )}

            {filteredDepts.length === 0 && (
              <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, opacity: 0.65 }}>
                {t('dept.noSearchResults')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Department stats popover */}
      {statsDeptId && (() => {
        const dept = departments.find(d => d.id === statsDeptId)
        if (!dept) return null
        const sessions = sessionsByDept[dept.id] ?? []
        const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)
        const todayStart = new Date().setHours(0, 0, 0, 0)
        const todayCount = sessions.filter(s => s.timestamp >= todayStart).length
        return (
          <div
            style={{
              position: 'fixed',
              left: Math.min(statsPos.x, window.innerWidth - 240),
              top: Math.min(statsPos.y, window.innerHeight - 220),
              zIndex: 200,
              background: 'var(--glass-bg-deep)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${dept.color || 'var(--bg-active)'}`,
              borderRadius: 10,
              padding: '12px 16px',
              minWidth: 200,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              animation: 'slideUp 0.15s ease',
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: dept.color || ACCENT, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{dept.name}</span>
              <button
                onClick={() => setStatsDeptId(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            {[
              { label: t('dept.staff'), value: sessions.length },
              { label: t('dept.statsToday'), value: todayCount },
              { label: t('dept.msgCount'), value: totalMessages },
              { label: t('dept.statsLastActive'), value: relativeTime(sessions[0]?.timestamp, t) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--bg-hover)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, opacity: 0.6, ...ELLIPSIS }}>
              {dept.directory}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onClick={() => { onSelectDept(dept.id); setStatsDeptId(null) }}
                style={{
                  flex: 1, padding: '4px 8px', borderRadius: 5,
                  border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.10)',
                  color: '#818cf8', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('dept.enter')}
              </button>
              <button
                onClick={() => {
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
                  a.download = `${dept.name.replace(/[^a-z0-9]/gi, '_')}_employees.json`
                  a.click()
                  URL.revokeObjectURL(url)
                  setStatsDeptId(null)
                }}
                style={{
                  flex: 1, padding: '4px 8px', borderRadius: 5,
                  border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
                  color: '#22c55e', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('dept.exportSessions')}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
