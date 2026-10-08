// Shared file-type → icon/color mapping for file listings.
//
// Extracted from FileBrowser so the plugin source preview (and any future file
// tree) renders the same icon and color for a given extension.
import type { ElementType } from 'react'
import {
  File, FileText, FileCode, FileImage, FileVideo, FileAudio, FileArchive,
  FileSpreadsheet, FileJson, Settings, Database,
} from 'lucide-react'

export interface FileIcon { Icon: ElementType; color: string }

// File type icon mapping by extension
const EXT_ICONS: Record<string, FileIcon> = {
  // Code files
  ts: { Icon: FileCode, color: '#3178c6' },
  tsx: { Icon: FileCode, color: '#3178c6' },
  js: { Icon: FileCode, color: '#f7df1e' },
  jsx: { Icon: FileCode, color: '#f7df1e' },
  py: { Icon: FileCode, color: '#3776ab' },
  rs: { Icon: FileCode, color: '#dea584' },
  go: { Icon: FileCode, color: '#00add8' },
  java: { Icon: FileCode, color: '#e76f00' },
  c: { Icon: FileCode, color: 'var(--text-muted)' },
  cpp: { Icon: FileCode, color: '#6295cb' },
  h: { Icon: FileCode, color: 'var(--text-muted)' },
  cs: { Icon: FileCode, color: '#68217a' },
  rb: { Icon: FileCode, color: '#cc342d' },
  php: { Icon: FileCode, color: '#777bb3' },
  swift: { Icon: FileCode, color: '#f05138' },
  kt: { Icon: FileCode, color: '#7f52ff' },
  vue: { Icon: FileCode, color: '#4fc08d' },
  svelte: { Icon: FileCode, color: '#ff3e00' },
  html: { Icon: FileCode, color: '#e34c26' },
  css: { Icon: FileCode, color: '#264de4' },
  scss: { Icon: FileCode, color: '#cd6799' },
  less: { Icon: FileCode, color: '#1d365d' },
  sh: { Icon: FileCode, color: '#4eaa25' },
  bat: { Icon: FileCode, color: '#4eaa25' },
  ps1: { Icon: FileCode, color: '#012456' },
  // Text / docs
  md: { Icon: FileText, color: '#519aba' },
  txt: { Icon: FileText, color: 'var(--text-muted)' },
  pdf: { Icon: FileText, color: '#e5252a' },
  doc: { Icon: FileText, color: '#2b579a' },
  docx: { Icon: FileText, color: '#2b579a' },
  rtf: { Icon: FileText, color: 'var(--text-muted)' },
  // Data / config
  json: { Icon: FileJson, color: '#f7df1e' },
  yaml: { Icon: Settings, color: '#cb171e' },
  yml: { Icon: Settings, color: '#cb171e' },
  toml: { Icon: Settings, color: '#9c4121' },
  xml: { Icon: FileCode, color: '#e37933' },
  csv: { Icon: FileSpreadsheet, color: '#217346' },
  xls: { Icon: FileSpreadsheet, color: '#217346' },
  xlsx: { Icon: FileSpreadsheet, color: '#217346' },
  sql: { Icon: Database, color: '#336791' },
  db: { Icon: Database, color: '#336791' },
  sqlite: { Icon: Database, color: '#336791' },
  // Images
  png: { Icon: FileImage, color: '#a855f7' },
  jpg: { Icon: FileImage, color: '#a855f7' },
  jpeg: { Icon: FileImage, color: '#a855f7' },
  gif: { Icon: FileImage, color: '#a855f7' },
  svg: { Icon: FileImage, color: '#ffb13b' },
  webp: { Icon: FileImage, color: '#a855f7' },
  ico: { Icon: FileImage, color: '#a855f7' },
  bmp: { Icon: FileImage, color: '#a855f7' },
  // Video
  mp4: { Icon: FileVideo, color: '#f87171' },
  mkv: { Icon: FileVideo, color: '#f87171' },
  avi: { Icon: FileVideo, color: '#f87171' },
  mov: { Icon: FileVideo, color: '#f87171' },
  webm: { Icon: FileVideo, color: '#f87171' },
  // Audio
  mp3: { Icon: FileAudio, color: '#f97316' },
  wav: { Icon: FileAudio, color: '#f97316' },
  ogg: { Icon: FileAudio, color: '#f97316' },
  flac: { Icon: FileAudio, color: '#f97316' },
  // Archives
  zip: { Icon: FileArchive, color: '#fbbf24' },
  tar: { Icon: FileArchive, color: '#fbbf24' },
  gz: { Icon: FileArchive, color: '#fbbf24' },
  rar: { Icon: FileArchive, color: '#fbbf24' },
  '7z': { Icon: FileArchive, color: '#fbbf24' },
}

export function getFileIcon(name: string): FileIcon {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : ''
  return EXT_ICONS[ext] ?? { Icon: File, color: 'var(--text-muted)' }
}
