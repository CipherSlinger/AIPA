// "What would this trigger actually do?" — the debounced next-run preview.
//
// The answer is main's own next-run maths, not a renderer formula, so an
// interval and a cron answer through the same path and neither can disagree
// with the save that follows. This hook owns the debounce and the request
// sequence; `TriggerFields` only renders the result.

import { useEffect, useRef, useState } from 'react'
import type { AutomationTriggerData } from '../../../../preload'
import { PREVIEW_DEBOUNCE_MS, type SchedulePreviewState } from './types'

export function useSchedulePreview(trigger: AutomationTriggerData): SchedulePreviewState {
  const [preview, setPreview] = useState<SchedulePreviewState>({ kind: 'idle' })
  // Monotonic request id. Only the answer to the newest request may be shown, so
  // a slow reply for an earlier trigger can never overwrite a newer one.
  const previewSeq = useRef(0)

  // Ask main what this trigger would actually do. The preview is main's own
  // next-run maths, not a renderer formula, so an interval and a cron answer
  // through the same path and neither can disagree with the save that follows.
  useEffect(() => {
    // A file change has no calendar; the watch hint under the fields says so.
    if (trigger.kind === 'watch') {
      previewSeq.current += 1
      setPreview({ kind: 'idle' })
      return
    }
    const seq = previewSeq.current + 1
    previewSeq.current = seq
    // The form no longer matches what is on screen: clear it immediately rather
    // than leave times that describe the previous schedule under the new one.
    setPreview({ kind: 'pending' })
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await window.electronAPI.automationPreviewSchedule(trigger)
          if (seq !== previewSeq.current) return
          if (result.ok) setPreview({ kind: 'runs', runs: result.runs })
          // Main says a watch trigger has no calendar; that cannot happen here
          // (the branch above returns first), but treat it as "nothing to show".
          else if (result.error === 'not_applicable') setPreview({ kind: 'idle' })
          else setPreview({ kind: 'invalid', error: result.error })
        } catch {
          if (seq !== previewSeq.current) return
          // An outage is not a verdict on the schedule. Show no time and let Save
          // through; main validates again when it saves.
          setPreview({ kind: 'unavailable' })
        }
      })()
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      // A reply that lands after this trigger is gone must not be shown.
      if (previewSeq.current === seq) previewSeq.current = seq + 1
    }
  }, [trigger])

  return preview
}
