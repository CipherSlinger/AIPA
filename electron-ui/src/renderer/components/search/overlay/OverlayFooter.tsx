// The keyboard legend, and the one count that sits beside it.
//
// The count is over the loaded rows only. When a filter hides some of them the
// footer says "visible of loaded" instead of letting "3 results" read as the
// whole answer. While an answer is on screen the legend swaps for the one key
// that applies there.

import type { CSSProperties } from 'react'
import { useT } from '../../../i18n'
import type { AskState } from './askHistory'

interface Props {
  askState: AskState
  askAvailable: boolean
  /** Rows the search returned. */
  loaded: number
  /** Rows still visible after every client-side filter. */
  visible: number
}

const FOOTER_STYLE: CSSProperties = {
  padding: '7px 16px',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  fontSize: 10,
  color: 'var(--text-muted)',
  flexShrink: 0,
}

export function OverlayFooter({ askState, askAvailable, loaded, visible }: Props) {
  const t = useT()
  return (
    <div style={FOOTER_STYLE}>
      {askState === 'idle' ? (
        <>
          <span>{t('globalSearch.navHint')}</span>
          {askAvailable && <span>{t('askHistory.ctrlEnterHint')}</span>}
          {loaded > 0 && (
            <span style={{ marginLeft: 'auto' }}>
              {visible !== loaded
                // The count is over the loaded rows only. Say so, rather
                // than let "3 results" read as the whole answer.
                ? t('globalSearch.paging.footerNarrowed', {
                    visible,
                    loaded,
                  })
                : t(
                    loaded === 1
                      ? 'globalSearch.resultOne'
                      : 'globalSearch.resultsCount',
                    { count: loaded },
                  )}
            </span>
          )}
        </>
      ) : (
        <span>{t('askHistory.cancelHint')}</span>
      )}
    </div>
  )
}
