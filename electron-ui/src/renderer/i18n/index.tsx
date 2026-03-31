import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'
import { zhCN as dateFnsZhCN } from 'date-fns/locale/zh-CN'

// Supported locales
export type Locale = 'en' | 'zh-CN' | 'system'

const translations: Record<string, Record<string, string>> = {
  'en': flattenObject(en),
  'zh-CN': flattenObject(zhCN),
}

// Flatten nested JSON: { nav: { newChat: "New Chat" } } -> { "nav.newChat": "New Chat" }
function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey))
    } else {
      result[fullKey] = String(value)
    }
  }
  return result
}

// Resolve system locale to supported locale
function resolveSystemLocale(systemLocale: string): 'en' | 'zh-CN' {
  const lower = systemLocale.toLowerCase()
  if (lower.startsWith('zh')) return 'zh-CN'
  return 'en'
}

interface I18nContextType {
  locale: Locale
  resolvedLocale: 'en' | 'zh-CN'
  setLocale: (locale: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType>({
  locale: 'system',
  resolvedLocale: 'en',
  setLocale: () => {},
  t: (key) => key,
})

export function useI18n() {
  return useContext(I18nContext)
}

// Shorthand: just the t function
export function useT() {
  return useContext(I18nContext).t
}

// Return date-fns locale object for the current resolved locale
export function useDateLocale(): Locale_DateFns | undefined {
  const { resolvedLocale } = useContext(I18nContext)
  return resolvedLocale === 'zh-CN' ? dateFnsZhCN : undefined
}

type Locale_DateFns = typeof dateFnsZhCN

interface I18nProviderProps {
  children: React.ReactNode
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>('system')
  const [systemLocale, setSystemLocale] = useState<string>('en')

  // Load saved language preference
  useEffect(() => {
    const load = async () => {
      try {
        const saved = await window.electronAPI.prefsGet('language')
        if (saved && (saved === 'en' || saved === 'zh-CN' || saved === 'system')) {
          setLocaleState(saved as Locale)
        }
      } catch { /* ignore */ }
      // Get system locale from main process
      try {
        const sysLocale = await window.electronAPI.configGetLocale()
        if (sysLocale) setSystemLocale(sysLocale)
      } catch { /* ignore */ }
    }
    load()
  }, [])

  const resolvedLocale: 'en' | 'zh-CN' = locale === 'system'
    ? resolveSystemLocale(systemLocale)
    : locale

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale)
    try {
      await window.electronAPI.prefsSet('language', newLocale)
    } catch { /* ignore */ }
  }, [])

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    // Look up in current locale, fall back to English
    let value = translations[resolvedLocale]?.[key]
      ?? translations['en']?.[key]
      ?? key

    // Simple parameter substitution: {{name}} -> value
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(paramValue))
      }
    }

    return value
  }, [resolvedLocale])

  const contextValue = useMemo(
    () => ({ locale, resolvedLocale, setLocale, t }),
    [locale, resolvedLocale, setLocale, t]
  )

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  )
}
