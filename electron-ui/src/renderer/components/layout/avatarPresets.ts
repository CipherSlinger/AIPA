// Preset avatar definitions (Luo Xiaohei theme)
// Iteration 413

export interface AvatarPreset {
  id: string
  emoji: string
  bg: string
  border: string
  nameKey: string  // i18n key
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'xiaohei', emoji: '\u{1F408}\u200D\u2B1B', bg: '#1a1a2e', border: '#4a4a6a', nameKey: 'avatar.xiaohei' },
  { id: 'xiaobai', emoji: '\u26AA', bg: '#f0f0f0', border: '#d0d0d0', nameKey: 'avatar.xiaobai' },
  { id: 'wuxian', emoji: '\u{1F52E}', bg: '#1e3a5f', border: '#4a8bc2', nameKey: 'avatar.wuxian' },
  { id: 'luozhu', emoji: '\u{1F33F}', bg: '#1a3a2e', border: '#4a8a6a', nameKey: 'avatar.luozhu' },
  { id: 'bidou', emoji: '\u{1F525}', bg: '#5a2a0e', border: '#c27a3a', nameKey: 'avatar.bidou' },
  { id: 'fengxi', emoji: '\u{1F300}', bg: '#3a1a5e', border: '#8a4ac2', nameKey: 'avatar.fengxi' },
  { id: 'argen', emoji: '\u{1F31F}', bg: '#5a4a1e', border: '#c2b24a', nameKey: 'avatar.argen' },
  { id: 'tianhu', emoji: '\u2601\uFE0F', bg: '#2a3a4e', border: '#6a8aaa', nameKey: 'avatar.tianhu' },
]
