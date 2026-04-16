import React from 'react'

interface ToggleProps {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}

export default function Toggle({ value, onChange, disabled, 'aria-label': ariaLabel }: ToggleProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      style={{
        width: 36,
        height: 20,
        borderRadius: 12,
        background: value ? '#6366f1' : 'var(--bg-input)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        flexShrink: 0,
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'rgba(255,255,255,1)',
          transition: 'all 0.15s ease',
          display: 'block',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  )
}
