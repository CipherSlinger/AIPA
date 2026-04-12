// PlanModeBanner — shown above the textarea when Plan Mode is active (Iteration 520)
import React from 'react'
import { ClipboardList, X } from 'lucide-react'
import { useT } from '../../i18n'

interface PlanModeBannerProps {
  onExit: () => void
}

export default function PlanModeBanner({ onExit }: PlanModeBannerProps) {
  const t = useT()
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        marginBottom: 4,
        background: 'rgba(99,102,241,0.12)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: 8,
      }}
    >
      <ClipboardList size={14} style={{ flexShrink: 0, color: '#818cf8' }} />
      <span
        style={{
          flex: 1,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.82)',
        }}
      >
        {t('plan.banner')}
      </span>
      <button
        onClick={onExit}
        title={t('plan.exitHint')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 500,
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.45)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 6,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(99,102,241,0.18)'
          e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
        }}
      >
        <X size={10} />
        {t('plan.bannerExit')}
      </button>
    </div>
  )
}
