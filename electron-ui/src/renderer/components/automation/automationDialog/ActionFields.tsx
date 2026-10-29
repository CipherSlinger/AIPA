// What the job does: a workflow, a prompt, or an installed skill.
//
// The skill branch keeps its three separate facts — still loading, unreadable,
// and really empty / no match — because an empty dropdown would say the wrong
// one. Extracted verbatim from `AutomationDialog.tsx`; the payload builder and
// the identity rules stay in `../skillSelection.ts`.

import { useMemo } from 'react'
import { useI18n } from '../../../i18n'
import type { SkillInfoData } from '../../../../preload'
import { INPUT_STYLE } from '../../settings/settingsConstants'
import { SECONDARY, WARNING, smallButtonStyle } from '../automationStyles'
import type { WorkflowOption } from './types'
import { Hint, WarningNote, labelStyle } from './shared'
import { useSkillBody } from './useDialogData'

export interface ActionFieldsProps {
  actionKind: 'workflow' | 'prompt' | 'skill'
  onActionKindChange: (kind: 'workflow' | 'prompt' | 'skill') => void
  workflows: WorkflowOption[]
  workflowId: string
  onWorkflowIdChange: (id: string) => void
  prompt: string
  onPromptChange: (prompt: string) => void
  initialPromptClipped?: boolean
  editing: boolean
  skillQuery: string
  onSkillQueryChange: (query: string) => void
  skills: SkillInfoData[] | null
  skillsUnreadable: boolean
  skillList: SkillInfoData[]
  skillSource: '' | 'personal' | 'project'
  skillDir: string
  setSkillSource: (source: '' | 'personal' | 'project') => void
  setSkillDir: (dir: string) => void
}

export function ActionFields({
  actionKind,
  onActionKindChange,
  workflows,
  workflowId,
  onWorkflowIdChange,
  prompt,
  onPromptChange,
  initialPromptClipped,
  editing,
  skillQuery,
  onSkillQueryChange,
  skills,
  skillsUnreadable,
  skillList,
  skillSource,
  skillDir,
  setSkillSource,
  setSkillDir,
}: ActionFieldsProps) {
  const { t } = useI18n()
  const skillBody = useSkillBody(actionKind, skillSource, skillDir, skills)

  // Matches the three facts the row shows; a user searching "weekly" is looking
  // at a description, not only at a folder name.
  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase()
    if (!query) return skillList
    return skillList.filter(skill =>
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      skill.skillDir.toLowerCase().includes(query))
  }, [skillList, skillQuery])
  // An edit that keeps a skill the user has since deleted is not silently
  // switched to another one: the warning names what is stored, and main still
  // refuses to save an identity it cannot resolve.
  const storedSkillMissing = skillSource !== '' &&
    skills !== null &&
    !skills.some(skill => skill.source === skillSource && skill.skillDir === skillDir)

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{t('automation.field.action')}</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {(['workflow', 'prompt', 'skill'] as const).map(kind => (
          <button
            key={kind}
            onClick={() => onActionKindChange(kind)}
            style={{
              ...smallButtonStyle,
              borderColor: actionKind === kind ? 'rgba(99,102,241,0.55)' : 'var(--border)',
              color: actionKind === kind ? 'var(--accent-text)' : SECONDARY,
              background: actionKind === kind ? 'rgba(99,102,241,0.12)' : 'transparent',
            }}
          >
            {kind === 'workflow'
              ? t('automation.action.workflow')
              : kind === 'skill'
                ? t('automation.action.skill')
                : t('automation.action.prompt')}
          </button>
        ))}
      </div>

      {actionKind === 'workflow' ? (
        workflows.length === 0 ? (
          <div style={{ fontSize: 11, color: WARNING, lineHeight: 1.5 }}>{t('automation.action.noWorkflows')}</div>
        ) : (
          <select
            value={workflowId}
            onChange={e => onWorkflowIdChange(e.target.value)}
            style={INPUT_STYLE}
          >
            {workflows.map(w => (
              <option key={w.id} value={w.id}>
                {`${w.icon ?? ''} ${w.name}`.trim()}
              </option>
            ))}
          </select>
        )
      ) : actionKind === 'skill' ? (
        <div>
          <input
            value={skillQuery}
            onChange={e => onSkillQueryChange(e.target.value)}
            placeholder={t('automation.skill.searchPlaceholder')}
            style={INPUT_STYLE}
            spellCheck={false}
          />
          {skills === null && !skillsUnreadable ? (
            <div style={{ fontSize: 11, color: SECONDARY, marginTop: 6 }}>
              {t('automation.skill.loading')}
            </div>
          ) : skillsUnreadable ? (
            <Hint marginTop={6} style={{ color: WARNING }}>
              {t('automation.skill.unreadable')}
            </Hint>
          ) : filteredSkills.length === 0 ? (
            // Two different facts, said differently: nothing is installed
            // (the dropdown would otherwise be an empty box), versus a
            // search that matched nothing among the installed skills.
            <Hint marginTop={6}>
              {skillList.length === 0 ? t('automation.skill.empty') : t('automation.skill.noMatch')}
            </Hint>
          ) : (
            <div style={{
              maxHeight: 168, overflowY: 'auto', marginTop: 6,
              border: '1px solid var(--border)', borderRadius: 6,
            }}>
              {filteredSkills.map((skill, index) => {
                const selected = skill.source === skillSource && skill.skillDir === skillDir
                return (
                  <button
                    key={`${skill.source}:${skill.skillDir}`}
                    type="button"
                    onClick={() => { setSkillSource(skill.source); setSkillDir(skill.skillDir) }}
                    // The description is clipped to one line here; the full
                    // text is one hover away rather than a second click.
                    title={skill.description || undefined}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 8px', cursor: 'pointer',
                      background: selected ? 'rgba(99,102,241,0.12)' : 'transparent',
                      border: 'none',
                      borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 600, minWidth: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{skill.name}</span>
                      <span style={{ fontSize: 10, color: SECONDARY, flexShrink: 0 }}>
                        {skill.source === 'personal' ? t('skills.personal') : t('skills.project')}
                      </span>
                    </div>
                    {skill.description && (
                      <div style={{
                        fontSize: 10, color: SECONDARY, marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{skill.description}</div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          {storedSkillMissing && (
            <WarningNote marginTop={6}>
              {t('automation.skill.missingHint', { name: skillDir || 'SKILL.md' })}
            </WarningNote>
          )}
          {/* A SKILL.md with no body is a legitimate draft, so this states
              the consequence and leaves Save on: the file may be filled in
              before the first run, and blocking the save would lose the
              schedule the user just built. */}
          {skillBody === 'empty' && (
            <WarningNote marginTop={6}>
              {t('automation.skill.emptyBody')}
            </WarningNote>
          )}
          <Hint marginTop={6}>
            {t('automation.skill.hint')}
          </Hint>
        </div>
      ) : (
        <>
          <textarea
            value={prompt}
            onChange={e => onPromptChange(e.target.value)}
            placeholder={t('automation.action.promptPlaceholder')}
            rows={4}
            maxLength={4000}
            style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          {/* The caller clips before handing the text over; the editor's own
              maxLength cannot tell the user that the source was longer. */}
          {initialPromptClipped && !editing && (
            <Hint style={{ color: WARNING }}>
              {t('automation.prompt.clippedHint')}
            </Hint>
          )}
        </>
      )}
    </div>
  )
}
