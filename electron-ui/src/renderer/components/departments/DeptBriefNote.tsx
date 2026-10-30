// The Brief's footnote line, shared by the panel and the spend section.
// Split out so `DeptBrief.tsx` and `DeptBriefSpend.tsx` can both use it without
// importing each other.

import type { ReactNode } from 'react'

export default function BriefNote({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5,
      paddingLeft: 9, position: 'relative',
    }}>
      <span style={{ position: 'absolute', left: 1, top: 0, color: 'var(--text-faint)' }}>·</span>
      {children}
    </div>
  )
}
