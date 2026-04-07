// formatUtils — display formatters ported from Claude Code sourcemap: src/utils/format.ts
// Iteration 493: formatFileSize, formatNumber, formatTokens, formatSecondsShort

/**
 * Formats a byte count to a human-readable string (KB, MB, GB).
 * @example formatFileSize(1536) → "1.5KB"
 */
export function formatFileSize(sizeInBytes: number): string {
  const kb = sizeInBytes / 1024
  if (kb < 1) {
    return `${sizeInBytes} bytes`
  }
  if (kb < 1024) {
    return `${kb.toFixed(1).replace(/\.0$/, '')}KB`
  }
  const mb = kb / 1024
  if (mb < 1024) {
    return `${mb.toFixed(1).replace(/\.0$/, '')}MB`
  }
  const gb = mb / 1024
  return `${gb.toFixed(1).replace(/\.0$/, '')}GB`
}

/**
 * Formats milliseconds as seconds with 1 decimal place (e.g. 1234 → "1.2s").
 * Use for sub-minute timings where the fractional second matters (TTFT, etc.).
 */
export function formatSecondsShort(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

// Cache Intl.NumberFormat formatters for reuse (expensive to construct)
let _fmtConsistent: Intl.NumberFormat | null = null
let _fmtInconsistent: Intl.NumberFormat | null = null

function getNumberFormatter(useConsistentDecimals: boolean): Intl.NumberFormat {
  if (useConsistentDecimals) {
    if (!_fmtConsistent) {
      _fmtConsistent = new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      })
    }
    return _fmtConsistent
  } else {
    if (!_fmtInconsistent) {
      _fmtInconsistent = new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      })
    }
    return _fmtInconsistent
  }
}

/**
 * Compact number formatter: 1321 → "1.3k", 900 → "900".
 */
export function formatNumber(number: number): string {
  const useConsistentDecimals = number >= 1000
  return getNumberFormatter(useConsistentDecimals).format(number).toLowerCase()
}

/**
 * Like formatNumber but strips trailing ".0" — for token counts.
 */
export function formatTokens(count: number): string {
  return formatNumber(count).replace('.0', '')
}
