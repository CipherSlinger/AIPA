import { useEffect, useState } from 'react'
import { todayLocalDay } from '../components/tasks/taskUi'

/**
 * The local calendar day, kept honest for a view that stays open.
 *
 * A due marker is a comparison against "today", and a component that reads the
 * clock once at mount would keep calling yesterday's day "Today" until some
 * unrelated event re-rendered it. This returns the current day and re-renders
 * exactly when the local day rolls over (plus when the window regains focus,
 * because a machine asleep across midnight misses the timer).
 */
export function useToday(): string {
  const [today, setToday] = useState(todayLocalDay)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      // One extra second so the timer never lands a hair before midnight and
      // computes the same day twice.
      timer = setTimeout(() => {
        setToday(todayLocalDay())
        schedule()
      }, Math.max(1000, nextMidnight.getTime() - now.getTime() + 1000))
    }
    const sync = () => {
      setToday(prev => {
        const next = todayLocalDay()
        return prev === next ? prev : next
      })
      schedule()
    }

    schedule()
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  return today
}
