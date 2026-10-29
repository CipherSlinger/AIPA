// The dialog's three read-only IPC subscriptions, extracted unchanged.
//
//   useChainJobs     — one read of the job list, for the chain selects.
//   useInstalledSkills — the skill picker's list, re-read when the working
//                        directory (and therefore the project skill root) changes.
//   useSkillBody     — whether the chosen SKILL.md has a body, cached for the
//                        dialog's lifetime so a keystroke never touches the disk.
//
// A list that cannot be read is not an empty list in every case: the callers
// keep that distinction, which is why each hook returns its own `unreadable`
// flag (or `unknown`) rather than collapsing a failure into `[]`.

import { useEffect, useRef, useState } from 'react'
import type { AutomationJobData, SkillInfoData } from '../../../../preload'
import { skillBodyState, type SkillBodyState } from '../skillSelection'

export function useChainJobs(): {
  chainJobs: AutomationJobData[] | null
  chainJobsUnreadable: boolean
} {
  const [chainJobs, setChainJobs] = useState<AutomationJobData[] | null>(null)
  const [chainJobsUnreadable, setChainJobsUnreadable] = useState(false)

  // One read, on open. A list that cannot be read is not an empty list: the
  // selects then show the stored choice as unidentifiable rather than as
  // "Nothing", and the chain is still sent back unchanged on save.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await window.electronAPI.automationList()
        if (cancelled) return
        setChainJobs(Array.isArray(result?.jobs) ? result.jobs : [])
      } catch {
        if (!cancelled) setChainJobsUnreadable(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { chainJobs, chainJobsUnreadable }
}

export function useInstalledSkills(workingDir: string): {
  skills: SkillInfoData[] | null
  skillsUnreadable: boolean
} {
  // `null` means "not read yet"; an empty array is the real answer "no skills
  // are installed", which the picker must say instead of showing an empty box.
  const [skills, setSkills] = useState<SkillInfoData[] | null>(null)
  const [skillsUnreadable, setSkillsUnreadable] = useState(false)

  // Installed skills, read once per working directory. Re-read when the
  // directory changes because the project root it names is part of the list;
  // a skill installed while this dialog is open is picked up on the next open
  // rather than by polling the disk from here.
  useEffect(() => {
    let cancelled = false
    setSkills(null)
    setSkillsUnreadable(false)
    void (async () => {
      try {
        const list = await window.electronAPI.skillsList(workingDir || undefined)
        if (cancelled) return
        setSkills(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setSkillsUnreadable(true)
      }
    })()
    return () => { cancelled = true }
  }, [workingDir])

  return { skills, skillsUnreadable }
}

export function useSkillBody(
  actionKind: 'workflow' | 'prompt' | 'skill',
  skillSource: '' | 'personal' | 'project',
  skillDir: string,
  skills: SkillInfoData[] | null,
): SkillBodyState {
  // Whether the chosen SKILL.md has anything for a run to send. Read once per
  // chosen skill, cached for this dialog's lifetime: a keystroke in the picker
  // must never touch the disk. Unknown covers "not read yet", "read failed"
  // and "no such skill" — none of them may be reported as an empty file.
  const [skillBody, setSkillBody] = useState<SkillBodyState>('unknown')
  const skillBodyCache = useRef<Map<string, SkillBodyState>>(new Map())
  useEffect(() => {
    if (actionKind !== 'skill' || !skillSource) {
      setSkillBody('unknown')
      return
    }
    const chosen = skills?.find(skill =>
      skill.source === skillSource && skill.skillDir === skillDir)
    if (!chosen) {
      setSkillBody('unknown')
      return
    }
    const key = `${chosen.source}\u0000${chosen.skillDir}`
    const cached = skillBodyCache.current.get(key)
    if (cached) {
      setSkillBody(cached)
      return
    }
    let cancelled = false
    setSkillBody('unknown')
    void (async () => {
      try {
        const result = await window.electronAPI.skillsRead(chosen.dirPath)
        if (cancelled) return
        const state = skillBodyState(typeof result?.content === 'string' ? result.content : null)
        skillBodyCache.current.set(key, state)
        setSkillBody(state)
      } catch {
        if (!cancelled) setSkillBody('unknown')
      }
    })()
    return () => { cancelled = true }
  }, [actionKind, skillSource, skillDir, skills])

  return skillBody
}
