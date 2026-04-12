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
    padding: '5px 14px',
    background: 'rgba(99,102,241,0.08)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(99,102,241,0.20)',
    borderTop: '2px solid rgba(99,102,241,0.35)',
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
            color: '#818cf8',
            flexShrink: 0,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <span style={{ flex: 1, color: 'rgba(255,255,255,0.70)' }}>
          正在预测响应…
        </span>
        <button
          onClick={onAbort}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 8px',
            fontSize: 11,
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#fca5a5'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
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
            color: '#818cf8',
            flexShrink: 0,
            animation: 'spin 1s linear infinite',
          }}
        />
        <span style={{ flex: 1, color: 'rgba(255,255,255,0.70)' }}>
          正在合并变更…
        </span>
      </div>
    )
  }

  // ── Ready state (status === 'ready') ─────────────────────────────────────
  if (status === 'ready' && result) {
    return (
      <div style={bannerStyle}>
        <Sparkles size={12} style={{ color: '#818cf8', flexShrink: 0 }} />
        <span style={{ color: 'rgba(255,255,255,0.70)', flex: 1, fontSize: 11 }}>
          预测完成
          {fileCount > 0 && (
            <>
              {' · '}
              <span style={{ color: 'rgba(255,255,255,0.70)', fontWeight: 600 }}>
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
              fontSize: 11,
              background: 'transparent',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 8,
              color: 'rgba(165,180,252,0.85)',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)' }}
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
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 8,
            color: '#4ade80',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.22)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.12)' }}
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
            fontSize: 11,
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#fca5a5'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
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
