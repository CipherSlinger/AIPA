// OrgChart — the company diagram at the top of the 「部门」 view.
//
// The tree has three levels and this file draws two of them:
//
//   company      one section per company record, with its own HQ card
//     department the cards hanging off that HQ
//       team     a small drawn sub-tree under the card (level toggle)
//
// Employees (sessions) are deliberately *not* listed at this level — a team chip
// shows a headcount, and clicking any card or chip drills into that node's
// roster, where the figures live. A node with no company parent still renders,
// under a generic HQ section, which is how every pre-template install looked.
//
// Within a section the tree re-flows as the nodes are added, so it never
// degenerates into a long ribbon of cards. Two shapes, picked from how many
// departments there are and how much room the pane has:
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
  FolderOpen, LayoutGrid, Plus, Search, X,
} from 'lucide-react'
import { useChatStore, useDepartmentStore, useSessionStore, type Department } from '../../store'
import { useI18n } from '../../i18n'
import { ToolbarButton } from '../workflows/EmployeesShared'
import {
  baseName, childrenOf, deptDisplayName, kindOf,
  positionDisplayTitle, teamsOf,
} from './deptUtils'
import { groupSessionsByResolvedDept } from './deptBrief.data'
import OrgSection, { type OrgSectionProps } from './OrgSection'
import { CARD_MIN_FULL, DENSE_FROM } from './orgLayout'
import DeptTemplatePicker from './DeptTemplatePicker'
import { hasChosenDeptSetup } from './deptPresets'
import { DeleteDeptPopover, DeptStatsPopover, EmptyOrgState } from './OrgPopovers'

const ACCENT = '#6366f1'

/** A stable emoji still lives in deptUtils for the archive ledger, which shows
 * a folder's identity in a table and has no room for a portrait. The chart
 * itself no longer uses it. */

/** One HQ and the departments under it, as the chart assembles them. */
interface SectionGroup extends Omit<OrgSectionProps, 'teamsByDept' | 'sessionsByDept' | 'sessionsLoading'
  | 'currentSessionId' | 'width' | 'dense' | 'onSelectDept' | 'onRecruit' | 'onStats' | 'onDelete'> {
  key: string
  departments: Department[]
}

// ── Org chart ───────────────────────────────────────────────────────────────

export interface OrgChartProps {
  onSelectDept: (deptId: string) => void
  /** Drill into the department with a fresh employee card waiting there. */
  onNewSessionInDept: (deptId: string) => void
}

export default function OrgChart({ onSelectDept, onNewSessionInDept }: OrgChartProps) {
  const { t, resolvedLocale } = useI18n()
  const departments = useDepartmentStore(s => s.departments)
  const allSessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const homeDir = useSessionStore(s => s.homeDir)
  // A manual filing moves a conversation between cards, so the chart subscribes.
  const filings = useDepartmentStore(s => s.filings)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const addNewDept = useDepartmentStore(s => s.addDepartment)
  const removeDepartment = useDepartmentStore(s => s.removeDepartment)

  const [deptSearch, setDeptSearch] = useState('')
  const [showAddDept, setShowAddDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptDir, setNewDeptDir] = useState('')
  // Template picker. `presetSeed` is the company type the picker opens on — the
  // empty state's cards each seed their own, the toolbar entry seeds none.
  const [showPresets, setShowPresets] = useState(false)
  const [presetSeed, setPresetSeed] = useState<string | undefined>(undefined)
  const [statsDeptId, setStatsDeptId] = useState<string | null>(null)
  const [statsPos, setStatsPos] = useState({ x: 0, y: 0 })
  // Deletion is confirmed in a popover, not in the card: the card clips its own
  // overflow, and a department with teams takes them with it — the count of what
  // is about to disappear has to be visible before the click that does it.
  const [deleteDeptId, setDeleteDeptId] = useState<string | null>(null)
  const [deletePos, setDeletePos] = useState({ x: 0, y: 0 })
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
    // One pass over the session list instead of one pass per department: the
    // owning department is resolved once, through the shared resolver (a manual
    // filing wins over the folder; a filing to a deleted node joins no card).
    const { byDept } = groupSessionsByResolvedDept(allSessions, {
      departments,
      filings,
      homeDir,
    })
    for (const id of Object.keys(byDept)) {
      byDept[id].sort((a, b) => b.timestamp - a.timestamp)
    }
    return byDept
  }, [departments, allSessions, filings, homeDir])

  const teamsByDept = useMemo(() => {
    const map: Record<string, Department[]> = {}
    for (const dept of departments) map[dept.id] = teamsOf(departments, dept.id)
    return map
  }, [departments])

  /** The sections to draw: one per company, plus the legacy top-level one. */
  const groups = useMemo<SectionGroup[]>(() => {
    const companies = departments.filter(d => kindOf(d) === 'company')
    const out: SectionGroup[] = companies.map(company => ({
      key: company.id,
      title: deptDisplayName(company, resolvedLocale),
      node: company,
      departments: childrenOf(departments, company.id).filter(d => kindOf(d) !== 'team'),
    }))
    // Departments with no company above them — every install that predates
    // templates. They keep the generic HQ they have always had.
    const orphans = departments.filter(d => !d.parentId && kindOf(d) === 'department')
    if (orphans.length > 0) out.push({ key: '__top', title: t('dept.company'), departments: orphans })
    return out
  }, [departments, t, resolvedLocale])

  const q = deptSearch.trim().toLowerCase()
  /** A department matches on its own name, or on any team's name or position. */
  const sectionDepts = useMemo(() => {
    const out: Record<string, Department[]> = {}
    for (const group of groups) {
      if (!q) { out[group.key] = group.departments; continue }
      out[group.key] = group.departments.filter(d => {
        const name = deptDisplayName(d, resolvedLocale)
        if (name.toLowerCase().includes(q) || d.directory.toLowerCase().includes(q)) return true
        if ((teamsByDept[d.id] ?? []).some(team =>
          deptDisplayName(team, resolvedLocale).toLowerCase().includes(q))) return true
        return (d.positions ?? []).some(p =>
          positionDisplayTitle(p, resolvedLocale).toLowerCase().includes(q))
      })
    }
    return out
  }, [groups, q, teamsByDept, resolvedLocale])

  // Past DENSE_FROM cards in a row the whole tree compacts so it still fits.
  // Taken across sections so two companies do not render at two densities.
  const dense = useMemo(
    () => Object.values(sectionDepts).some(list => list.length >= DENSE_FROM),
    [sectionDepts],
  )
  const visibleCount = useMemo(
    () => Object.values(sectionDepts).reduce((n, list) => n + list.length, 0),
    [sectionDepts],
  )

  // First run: a brand-new install lands on an empty chart with nothing to click
  // that explains itself, so open the picker once. Waiting for sessions to finish
  // loading matters — that is what tells us whether to offer "reuse my existing
  // folders". After any choice (`blank` included) the flag silences this for good.
  useEffect(() => {
    if (departments.length > 0 || sessionsLoading || hasChosenDeptSetup()) return
    setPresetSeed(undefined)
    setShowPresets(true)
  }, [departments.length, sessionsLoading])

  const closeAdd = () => { setShowAddDept(false); setNewDeptName(''); setNewDeptDir('') }

  const handleAdd = () => {
    if (!newDeptName.trim() || !newDeptDir.trim()) return
    // A hand-made department joins whichever company already exists, so it lands
    // among the cards rather than in a second, orphaned section.
    const loneCompany = departments.filter(d => kindOf(d) === 'company').length === 1
      ? departments.find(d => kindOf(d) === 'company')
      : undefined
    const dept = addNewDept({
      name: newDeptName.trim(),
      directory: newDeptDir.trim(),
      color: ACCENT,
      kind: 'department',
      parentId: loneCompany?.id,
    })
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

  useEffect(() => {
    if (!deleteDeptId) return
    const close = () => setDeleteDeptId(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [deleteDeptId])

  const openStats = React.useCallback((deptId: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setStatsPos({ x: rect.right + 8, y: rect.top })
    setStatsDeptId(prev => (prev === deptId ? null : deptId))
  }, [])

  const openDelete = React.useCallback((deptId: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDeletePos({ x: rect.right + 8, y: rect.top })
    setDeleteDeptId(deptId)
  }, [])

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
        {/* Toolbar — department search, level toggle, create */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{t('dept.addTitle')}</div>
              <button
                onClick={() => { closeAdd(); setPresetSeed(undefined); setShowPresets(true) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--accent-text)', fontSize: 11,
                }}
              >
                <LayoutGrid size={11} />{t('dept.presets.fromTemplate')}
              </button>
            </div>
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

        {/* Empty state — no node at all. The fastest way out is a ready-made
            company, so the company types are offered right here instead of buried
            behind the "new department" form. */}
        {departments.length === 0 ? (
          <EmptyOrgState onPickPreset={id => { setPresetSeed(id); setShowPresets(true) }} />
        ) : (
          <div ref={setTreeEl}>
            {groups.map(group => (
              <OrgSection
                key={group.key}
                title={group.title}
                node={group.node}
                departments={sectionDepts[group.key] ?? []}
                teamsByDept={teamsByDept}
                sessionsByDept={sessionsByDept}
                sessionsLoading={sessionsLoading}
                currentSessionId={currentSessionId}
                width={width}
                dense={dense}
                onSelectDept={onSelectDept}
                onRecruit={onNewSessionInDept}
                onStats={openStats}
                onDelete={openDelete}
              />
            ))}

            {visibleCount === 0 && (
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
        return (
          <DeptStatsPopover
            dept={dept}
            sessions={sessionsByDept[dept.id] ?? []}
            position={statsPos}
            onClose={() => setStatsDeptId(null)}
            onEnter={() => onSelectDept(dept.id)}
          />
        )
      })()}

      {showPresets && (
        <DeptTemplatePicker
          initialPresetId={presetSeed}
          onClose={() => setShowPresets(false)}
          onApplied={() => setShowPresets(false)}
        />
      )}

      {/* Delete confirmation. The folders stay on disk — deleting a node only
          drops its record, which is what keeps this recoverable: nothing the
          department ever wrote is destroyed. */}
      {deleteDeptId && (() => {
        const node = departments.find(d => d.id === deleteDeptId)
        if (!node) return null
        return (
          <DeleteDeptPopover
            node={node}
            departments={departments}
            position={deletePos}
            onCancel={() => setDeleteDeptId(null)}
            onConfirm={() => { removeDepartment(node.id); setDeleteDeptId(null) }}
          />
        )
      })()}
    </div>
  )
}
