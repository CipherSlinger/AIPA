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
        gap: 6,
        padding: '4px 10px',
        marginBottom: 4,
        fontSize: 11,
        color: '#a78bfa',
        background: 'rgba(167, 139, 250, 0.08)',
        borderRadius: 6,
      }}
    >
      <ClipboardList size={12} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontWeight: 500, opacity: 0.9 }}>
        {t('plan.banner')}
      </span>
      <button
        onClick={onExit}
        title={t('plan.exitHint')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '1px 6px',
          fontSize: 10,
          fontWeight: 500,
          background: 'rgba(167, 139, 250, 0.15)',
          color: '#a78bfa',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          transition: 'background 150ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(167, 139, 250, 0.25)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(167, 139, 250, 0.15)' }}
      >
        <X size={10} />
        {t('plan.bannerExit')}
      </button>
    </div>
  )
}
