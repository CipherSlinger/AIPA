import React from 'react'
import { Bot } from 'lucide-react'
import { useT } from '../../i18n'

interface Persona {
  emoji: string
  color: string
  name: string
  presetKey?: string
}

interface WelcomeHeroProps {
  greeting: string
  displayName: string | undefined
  activePersona: Persona | undefined
  accentTint: string
}

/**
 * Hero section of the welcome screen: icon, greeting, date, subtitle.
 * Extracted from WelcomeScreen.tsx (Iteration 454).
 */
export default function WelcomeHero({ greeting, displayName, activePersona, accentTint }: WelcomeHeroProps) {
  const t = useT()

  return (
    <>
      {/* Hero icon */}
      <div className="onboard-icon" style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
        boxShadow: '0 0 32px rgba(99,102,241,0.4), 0 8px 24px rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, boxSizing: 'border-box',
      }}>
        {activePersona
          ? <span style={{ fontSize: 36, lineHeight: 1 }}>{activePersona.emoji}</span>
          : <Bot size={38} color="#e0e7ff" strokeWidth={1.5} />
        }
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          <span style={{
            background: 'linear-gradient(135deg, #e0e7ff, #c4b5fd)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {displayName ? t('welcome.greetingWithName', { greeting: t(greeting), name: displayName }) : t(greeting)}
          </span>
        </div>
        {activePersona && (
          <div style={{ fontSize: 13, color: activePersona.color, marginTop: 4, fontWeight: 500 }}>
            {t('persona.personaGreeting', { name: activePersona.presetKey ? t(`persona.preset.${activePersona.presetKey}`) : activePersona.name })}
          </div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 360, lineHeight: 1.6 }}>
          {t('welcome.subtitle')}
        </div>
      </div>
    </>
  )
}
