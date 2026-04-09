/**
 * SpeculationStatusBar — compact non-blocking banner shown above the input bar
 * while a speculative execution is running or ready for review.
 *
 * States:
 *   running  → pulsing progress banner + Abort button
 *   ready    → file count badge + View Changes / Accept / Reject buttons
 *   accepting → merging spinner (local UI state while speculationAccept resolves)
 */
import React, { useState } from 'react'
import { Zap, Sparkles, Loader, X, Check, FileEdit } from 'lucide-react'
import type { SpeculationStatus, SpeculationState } from '../../hooks/useSpeculation'
import { useUiStore } from '../../store'

interface SpeculationStatusBarProps {
  status: SpeculationStatus
  result: SpeculationState | null
  onAccept: () => Promise<void>
  onReject: () => void
  onAbort: () => void
}

export default function SpeculationStatusBar({
  status,
  result,
  onAccept,
  onReject,
  onAbort,
}: SpeculationStatusBarProps) {
  const [accepting, setAccepting] = useState(false)
  const setSidebarTab = useUiStore(s => s.setSidebarTab)
  const setSidebarOpen = useUiStore(s => s.setSidebarOpen)

  if (status === 'idle' || status === 'accepted' || status === 'rejected') return null

  const handleAccept = async () => {
    setAccepting(true)
    try {
      await onAccept()
    } finally {
      setAccepting(false)
    }
  }

  const handleViewChanges = () => {
    setSidebarTab('changes')
    setSidebarOpen(true)
  }

  const fileCount = result?.changedFiles?.length ?? 0

  // ── Shared banner wrapper style ──────────────────────────────────────────
  const bannerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 16px',
    background: 'rgba(139,92,246,0.08)',
    borderLeft: '3px solid #8b5cf6',
    fontSize: 11,
    flexShrink: 0,
    minHeight: 32,
  }

  // ── Running state ────────────────────────────────────────────────────────
  if (status === 'running') {
    return (
      <div style={bannerStyle}>
        <Zap
          size={12}
          style={{
            color: '#8b5cf6',
            flexShrink: 0,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <span style={{ flex: 1, color: 'var(--text-muted)' }}>
          正在预测响应…
        </span>
        <button
          onClick={onAbort}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 8px',
            fontSize: 10,
            background: 'transparent',
            border: '1px solid rgba(139,92,246,0.35)',
            borderRadius: 5,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'border-color 150ms, color 150ms',
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--error)'
            e.currentTarget.style.color = 'var(--error)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
          title="中止预测"
        >
          <X size={9} />
          中止
        </button>
      </div>
    )
  }

  // ── Accepting state (local spinner while IPC resolves) ───────────────────
  if (accepting) {
    return (
      <div style={bannerStyle}>
        <Loader
          size={12}
          style={{
            color: '#8b5cf6',
            flexShrink: 0,
            animation: 'spin 1s linear infinite',
          }}
        />
        <span style={{ flex: 1, color: 'var(--text-muted)' }}>
          正在合并变更…
        </span>
      </div>
    )
  }

  // ── Ready state (status === 'ready') ─────────────────────────────────────
  if (status === 'ready' && result) {
    return (
      <div style={bannerStyle}>
        <Sparkles size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />
        <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
          预测完成
          {fileCount > 0 && (
            <>
              {' · '}
              <span style={{ color: '#8b5cf6', fontWeight: 600 }}>
                <FileEdit size={9} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />
                已修改 {fileCount} 个文件
              </span>
            </>
          )}
        </span>

        {/* View Changes */}
        {fileCount > 0 && (
          <button
            onClick={handleViewChanges}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 8px',
              fontSize: 10,
              background: 'transparent',
              border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: 5,
              color: '#8b5cf6',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            title="在侧边栏查看文件变更"
          >
            查看变更
          </button>
        )}

        {/* Accept */}
        <button
          onClick={handleAccept}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 600,
            background: 'rgba(34,197,94,0.15)',
            border: '1px solid rgba(34,197,94,0.4)',
            borderRadius: 5,
            color: '#22c55e',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.25)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.15)' }}
          title="接受预测结果，将文件变更合并到工作目录"
        >
          <Check size={9} />
          接受
        </button>

        {/* Reject */}
        <button
          onClick={onReject}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 8px',
            fontSize: 10,
            background: 'transparent',
            border: '1px solid rgba(248,113,113,0.35)',
            borderRadius: 5,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'border-color 150ms, color 150ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--error)'
            e.currentTarget.style.color = 'var(--error)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(248,113,113,0.35)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
          title="拒绝预测结果，丢弃所有变更"
        >
          <X size={9} />
          拒绝
        </button>
      </div>
    )
  }

  return null
}
