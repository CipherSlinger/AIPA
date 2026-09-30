import React from 'react'
import {
  Activity,
  Blocks,
  CalendarDays,
  Gauge,
  NotebookPen,
  Puzzle,
  Sliders,
  Sparkles,
  Terminal,
  LucideIcon,
} from 'lucide-react'

const PLUGIN_ICON_MAP: Record<string, LucideIcon> = {
  Blocks,
  Puzzle,
  Terminal,
  Activity,
  Gauge,
  Sliders,
  Sparkles,
  NotebookPen,
  CalendarDays,
}

/** Resolve a plugin manifest's Lucide icon name to a component. */
export function getPluginIconComponent(iconName?: string, fallback: LucideIcon = Blocks): LucideIcon {
  return (iconName && PLUGIN_ICON_MAP[iconName]) || fallback
}

export function getPluginIcon(iconName?: string, size = 18) {
  const Comp = getPluginIconComponent(iconName)
  return <Comp size={size} strokeWidth={1.5} />
}

/** Manifest name for the current UI language (`nameEn` when English, else `name`). */
export function getPluginDisplayName(manifest: { name: string; nameEn?: string }, locale: 'en' | 'zh-CN'): string {
  return locale === 'en' && manifest.nameEn ? manifest.nameEn : manifest.name
}
