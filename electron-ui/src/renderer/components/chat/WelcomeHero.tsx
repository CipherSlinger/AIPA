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
        width: 64, height: 64, borderRadius: '50%', background: accentTint,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {activePersona
          ? <span style={{ fontSize: 36, lineHeight: 1 }}>{activePersona.emoji}</span>
          : <Bot size={38} color="var(--accent)" strokeWidth={1.5} />
        }
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, color: 'var(--text-bright)', fontWeight: 700, letterSpacing: '-0.02em' }}>
          {displayName ? t('welcome.greetingWithName', { greeting: t(greeting), name: displayName }) : t(greeting)}
        </div>
        {activePersona && (
          <div style={{ fontSize: 13, color: activePersona.color, marginTop: 4, fontWeight: 500 }}>
            {t('persona.personaGreeting', { name: activePersona.presetKey ? t(`persona.preset.${activePersona.presetKey}`) : activePersona.name })}
          </div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, opacity: 0.7 }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8, maxWidth: 360, lineHeight: 1.7 }}>
          {t('welcome.subtitle')}
        </div>
      </div>
    </>
  )
}
