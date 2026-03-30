// StatusBar timer hooks — extracted from StatusBar.tsx (Iteration 313)

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'

const POMODORO_DURATION = 25 * 60 // 25 minutes in seconds

export function useFocusTimer() {
  const t = useT()
  const notifySound = usePrefsStore(s => s.prefs.notifySound)
  const [active, setActive] = useState(false)
  const [remaining, setRemaining] = useState(POMODORO_DURATION)
  const intervalRef = useRef<number>(0)

  const toggle = useCallback(() => {
    if (active) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = 0
      setActive(false)
      setRemaining(POMODORO_DURATION)
    } else {
      setRemaining(POMODORO_DURATION)
      setActive(true)
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    intervalRef.current = window.setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          intervalRef.current = 0
          setActive(false)
          if (notifySound !== false) {
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2MkZabnp2bl5KMhoJ+enl5e36BhYmMj5KUlpeTkI2Kh4SBfnt5eHl7foKGio6RlJaXlpOPjImGg4B9e3p5ent+goaMkJOWmJiWk5CMiYaEgX58e3t7fH+Ch4uPk5aYl5WSkI2Jh4SAf3x7e3x9f4KHi4+TlpiXlZKQjIqHhIKAf317e3x9gIOIjJCTlpeWk5GNi4mHhIJ/fXx7fH6AgYSIjJCSlZaVk5CQjouJh4SBf317fH1+gIKEiIuOkZOVlJOQjo2LiYeEg4F/fn18fn+AgoWHi46RkpSUkpCNi4qIh4SDgX9+fX5/gIGDhYmLjpCSkpGQjYyLiYiGhYOBgH5+f4CBgoSGiIuNkJGSkZCOjYyKiYiGhYOCgIB/f4CBgoSFh4qMjpCRkpGQjo2Mi4qJh4aFg4KBgH+AgoKDhYeJi42PkJGRkI+OjYyLiomIh4WEg4KBgICBgoOEhoeJi42Oj5CQj46NjIuLiomIh4aFhIOCgoGBgYKDhIWHiImLjI2Oj46OjY2Mi4uKiYiHhoWEhIODgoKCg4OEhYaHiYqLjI2Oj46OjY2Mi4uKiYmIh4aGhYWEhIODg4ODhIWGh4iJiouMjY2OjY2NjIyLi4qKiYiIh4eGhoWFhYSEhIWFhoaHiImKi4yMjY2NjY2NjIyLi4uKiomJiIiHh4aGhoaGhoaGh4eIiImKiouMjIyNjY2NjIyMi4uLi4qKiYmJiIiHh4eHh4eHh4eHiIiJiYqKi4uMjIyMjIyMjIyMi4uLi4qKioqJiYmIiIiIiIiIiIiIiIiJiYmKiouLi4yMjIyMjIyMi4uLi4uLi4uKioqKiomJiYmJiYmJiYmJiYmJiYmJiYqKioqLi4uLi4yMjIyMjIyMi4uLi4uLi4uKioqKioqJiYmJiYmJiYmJiYmJiYqKioqKi4uLi4uLjIyMjIyMjIuLi4uLi4uLioqKioqKiYmJiYmJiYmJiYmJiYqKioqKi4uLi4uLi4yMjIyMi4uLi4uLi4uLi4qKioqKioqJiYmJiYmJiYmJiYqKioqKi4uLi4uLi4uLjIyMi4uLi4uLi4uLi4qKioqKioqKiYqKioqKioqKioqKioqKi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uKioqKioqKioqKioqKioqKioqKioqLi4uLi4uLi4uLi4uLi4uLi4uLi4uLioqKioqKioqKioqKioqKioqKioqKi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4qKioqKioqK')
              audio.volume = 0.3
              audio.play().catch(() => {})
            } catch {}
          }
          useUiStore.getState().addToast('success', t('toolbar.focusTimerComplete'))
          return POMODORO_DURATION
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [active, notifySound, t])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return { active, remaining, toggle }
}

export function useStopwatch() {
  const [active, setActive] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<number>(0)
  const lastClickRef = useRef<number>(0)

  const handleClick = useCallback(() => {
    const now = Date.now()
    if (now - lastClickRef.current < 400 && !active) {
      setElapsed(0)
      lastClickRef.current = 0
      return
    }
    lastClickRef.current = now

    if (active) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = 0
      setActive(false)
    } else {
      setActive(true)
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    intervalRef.current = window.setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [active])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return { active, elapsed, handleClick }
}
