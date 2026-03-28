import React, { useMemo } from 'react'
import { MessageCircle, Code2, ListChecks, FileText, Languages, Lightbulb, ArrowRight, Layers, LucideIcon } from 'lucide-react'
import { useT } from '../../i18n'

interface FollowUpSuggestion {
  id: string
  label: string
  prompt: string
  icon: LucideIcon
}

interface Props {
  lastAssistantContent: string
  onSelect: (prompt: string) => void
}

/**
 * Analyzes the last assistant message and returns 2-3 contextual follow-up suggestions.
 * Uses simple pattern matching — no API call needed.
 */
function generateSuggestions(content: string, t: (key: string) => string): FollowUpSuggestion[] {
  const suggestions: FollowUpSuggestion[] = []
  const lower = content.toLowerCase()
  const lines = content.split('\n')

  // Detect content patterns
  const hasCodeBlock = /```[\s\S]*?```/.test(content)
  const hasNumberedList = /^\s*\d+[\.\)]\s/m.test(content)
  const hasBulletList = /^\s*[-*]\s/m.test(content)
  const hasTable = /\|.*\|.*\|/m.test(content)
  const hasSteps = hasNumberedList && (lower.includes('step') || lower.includes('first') || lower.includes('then'))
  const hasSummary = lower.includes('summary') || lower.includes('in conclusion') || lower.includes('to summarize') || lower.includes('in short')
  const hasExplanation = lower.includes('because') || lower.includes('this means') || lower.includes('in other words')
  const hasPros = lower.includes('pros') || lower.includes('advantages') || lower.includes('benefits')
  const hasCons = lower.includes('cons') || lower.includes('disadvantages') || lower.includes('drawbacks')
  const hasComparison = (hasPros && hasCons) || lower.includes('compared to') || lower.includes('versus') || lower.includes(' vs ')
  const isLongResponse = content.length > 1500
  const hasEmail = lower.includes('subject:') || lower.includes('dear ') || lower.includes('hi ') && lower.includes('regards')
  const hasReport = lower.includes('report') || lower.includes('analysis') || lower.includes('findings')
  const hasTranslation = lower.includes('translation') || lower.includes('translated')

  // Priority-based suggestion generation
  if (hasCodeBlock) {
    suggestions.push({
      id: 'explain-code',
      label: t('followUp.explainCode'),
      prompt: t('followUp.explainCodePrompt'),
      icon: Code2,
    })
  }

  if (hasSteps) {
    suggestions.push({
      id: 'more-detail-steps',
      label: t('followUp.elaborateSteps'),
      prompt: t('followUp.elaborateStepsPrompt'),
      icon: ListChecks,
    })
  }

  if (hasSummary || isLongResponse) {
    suggestions.push({
      id: 'key-takeaways',
      label: t('followUp.keyTakeaways'),
      prompt: t('followUp.keyTakeawaysPrompt'),
      icon: Lightbulb,
    })
  }

  if (hasComparison) {
    suggestions.push({
      id: 'recommend',
      label: t('followUp.recommend'),
      prompt: t('followUp.recommendPrompt'),
      icon: ArrowRight,
    })
  }

  if (hasEmail) {
    suggestions.push({
      id: 'make-formal',
      label: t('followUp.makeFormal'),
      prompt: t('followUp.makeFormalPrompt'),
      icon: FileText,
    })
  }

  if (hasReport) {
    suggestions.push({
      id: 'make-concise',
      label: t('followUp.makeConcise'),
      prompt: t('followUp.makeConcisePrompt'),
      icon: Layers,
    })
  }

  if (hasTranslation) {
    suggestions.push({
      id: 'improve-translation',
      label: t('followUp.improveTranslation'),
      prompt: t('followUp.improveTranslationPrompt'),
      icon: Languages,
    })
  }

  if (hasNumberedList || hasBulletList) {
    if (!hasSteps) {
      suggestions.push({
        id: 'expand-points',
        label: t('followUp.expandPoints'),
        prompt: t('followUp.expandPointsPrompt'),
        icon: ListChecks,
      })
    }
  }

  if (hasTable) {
    suggestions.push({
      id: 'add-to-table',
      label: t('followUp.addToTable'),
      prompt: t('followUp.addToTablePrompt'),
      icon: Layers,
    })
  }

  // Always available generic suggestions (fill up to 3)
  const generic: FollowUpSuggestion[] = [
    {
      id: 'continue',
      label: t('followUp.continueLabel'),
      prompt: t('followUp.continuePrompt'),
      icon: ArrowRight,
    },
    {
      id: 'simplify',
      label: t('followUp.simplify'),
      prompt: t('followUp.simplifyPrompt'),
      icon: MessageCircle,
    },
    {
      id: 'give-example',
      label: t('followUp.giveExample'),
      prompt: t('followUp.giveExamplePrompt'),
      icon: Lightbulb,
    },
  ]

  // Fill remaining slots with generic suggestions
  while (suggestions.length < 3) {
    const next = generic.shift()
    if (!next) break
    if (!suggestions.find(s => s.id === next.id)) {
      suggestions.push(next)
    }
  }

  return suggestions.slice(0, 3)
}

export default function FollowUpChips({ lastAssistantContent, onSelect }: Props) {
  const t = useT()

  const suggestions = useMemo(
    () => generateSuggestions(lastAssistantContent, t),
    [lastAssistantContent, t]
  )

  if (suggestions.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
        padding: '4px 16px 4px',
        flexWrap: 'wrap',
      }}
    >
      {suggestions.map((s) => {
        const Icon = s.icon
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.prompt)}
            title={s.prompt}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 14px',
              background: 'var(--action-btn-bg)',
              border: '1px solid var(--action-btn-border)',
              borderRadius: 20,
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 500,
              transition: 'color 150ms ease, border-color 150ms ease, background 150ms ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget
              el.style.color = 'var(--accent)'
              el.style.borderColor = 'var(--accent)'
              el.style.background = 'var(--popup-item-hover)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget
              el.style.color = 'var(--text-muted)'
              el.style.borderColor = 'var(--action-btn-border)'
              el.style.background = 'var(--action-btn-bg)'
            }}
          >
            <Icon size={13} />
            <span>{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}
