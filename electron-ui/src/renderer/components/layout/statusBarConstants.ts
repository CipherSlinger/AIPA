// StatusBar constants and utilities — extracted from StatusBar.tsx (Iteration 313)

import React from 'react'

export function Separator() {
  return React.createElement('div', {
    style: {
      width: 1,
      height: 12,
      background: 'rgba(255,255,255,0.06)',
      borderRadius: 1,
      margin: '0 4px',
      flexShrink: 0,
    },
  })
}

export function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) {
    const remainSecs = secs % 60
    return remainSecs > 0 ? `${mins}m ${remainSecs}s` : `${mins}m`
  }
  const hrs = Math.floor(mins / 60)
  const remainMins = mins % 60
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`
}

export function fmtNumber(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
