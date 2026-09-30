// Workflow card for the Employees page grid — same card language as the agent tiles.
import React, { useEffect, useState } from 'react'
import { Play, Copy, Edit3, Trash2, Users2 } from 'lucide-react'
import type { Workflow } from '../../types/app.types'
import { useT } from '../../i18n'
import { useUiStore, useChatStore } from '../../store'
import { getPresetStepText } from './workflowConstants'
import { cardStyle } from './EmployeesShared'

const ICON_PALETTE = ['#6366f1', '#a78bfa', '#ec4899', '#fbbf24', '#4ade80', '#67e8f9', '#818cf8', '#f87171']

function iconColor(icon: string): string {
  let hash = 0
  for (let i = 0; i < icon.length; i++) hash = (hash * 31 + icon.charCodeAt(i)) >>> 0
  return ICON_PALETTE[hash % ICON_PALETTE.length]
}

interface WorkflowCardProps {
  wf: Workflow
  onDuplicate: (wf: Workflow) => void
  onDelete: (id: string) => void
}

function IconAction({ title, onClick, danger, active, children }: {
  title: string
  onClick: (e: React.MouseEvent) => void
  danger?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const color = danger ? '#f87171' : '#818cf8'
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${active ? color : 'var(--glass-border)'}`,
        background: active ? color : hovered ? `${color}1f` : 'var(--bg-primary)',
        color: active ? '#fff' : hovered ? color : 'var(--text-muted)',
        cursor: 'pointer', transition: 'all 0.15s ease', padding: 0,
      }}
    >
      {children}
    </button>
  )
}

export default function WorkflowCard({ wf, onDuplicate, onDelete }: WorkflowCardProps) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!confirmDelete) return
    const timer = setTimeout(() => setConfirmDelete(false), 2500)
    return () => clearTimeout(timer)
  }, [confirmDelete])

  const displayName = wf.presetKey ? t(`workflow.preset.${wf.presetKey}`) : wf.name
  const displayDesc = wf.presetKey ? t(`workflow.preset.${wf.presetKey}Desc`) : wf.description
  const color = iconColor(wf.icon)

  const run = (e: React.MouseEvent) => {
    e.stopPropagation()
    let count = 0
    wf.steps.forEach((step, idx) => {
      const prompt = getPresetStepText(wf.presetKey, idx, 'prompt', t, step.prompt)
      if (prompt.trim()) {
        useChatStore.getState().addToQueue(prompt, { workflowId: wf.id, stepIndex: idx })
        count++
      }
    })
    if (count > 0) useUiStore.getState().addToast('info', t('workflow.running', { name: displayName, count: String(count) }))
  }

  return (
    <div
      onClick={() => useUiStore.getState().openWorkflowDetail(wf.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...cardStyle(hovered, false, color), padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 148 }}
    >
      {/* Top row: icon + hover actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          width: 42, height: 42, borderRadius: 12, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}1a`, border: `1px solid ${color}40`, flexShrink: 0,
          transform: hovered ? 'scale(1.05)' : 'none', transition: 'transform 0.18s ease',
        }}>
          {wf.icon}
        </span>
        <div style={{ display: 'flex', gap: 4, opacity: hovered || confirmDelete ? 1 : 0, transition: 'opacity 0.15s ease' }}>
          <IconAction title={t('employees.edit')} onClick={e => { e.stopPropagation(); useUiStore.getState().openWorkflowEditor(wf.id) }}>
            <Edit3 size={12} />
          </IconAction>
          <IconAction title={t('employees.duplicate')} onClick={e => { e.stopPropagation(); onDuplicate(wf) }}>
            <Copy size={12} />
          </IconAction>
          <IconAction
            title={confirmDelete ? t('employees.confirmDelete') : t('employees.delete')}
            danger
            active={confirmDelete}
            onClick={e => {
              e.stopPropagation()
              if (confirmDelete) onDelete(wf.id)
              else setConfirmDelete(true)
            }}
          >
            <Trash2 size={12} />
          </IconAction>
        </div>
      </div>

      {/* Name + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </div>
        {displayDesc && (
          <div
            title={displayDesc}
            style={{
              fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 3,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {displayDesc}
          </div>
        )}
      </div>

      {/* Footer: meta + run */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 10.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: '#a5b4fc', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 10, padding: '1px 7px', fontWeight: 600, flexShrink: 0 }}>
            {t('employees.steps', { count: wf.steps.length })}
          </span>
          {wf.teamwork && <Users2 size={11} style={{ flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {wf.runCount > 0 ? t('employees.runs', { count: wf.runCount }) : t('employees.neverRun')}
          </span>
        </div>
        <button
          onClick={run}
          disabled={!wf.steps.length}
          title={t('employees.run')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, height: 24, padding: '0 10px', borderRadius: 8, flexShrink: 0,
            border: 'none', fontSize: 11, fontWeight: 600, cursor: wf.steps.length ? 'pointer' : 'not-allowed',
            background: hovered ? 'linear-gradient(135deg, rgba(99,102,241,0.92), rgba(139,92,246,0.92))' : 'rgba(99,102,241,0.12)',
            color: hovered ? '#fff' : '#818cf8', transition: 'all 0.15s ease',
          }}
        >
          <Play size={10} fill="currentColor" />
          {t('employees.run')}
        </button>
      </div>
    </div>
  )
}
