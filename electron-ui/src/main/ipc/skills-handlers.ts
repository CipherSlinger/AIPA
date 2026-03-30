import { ipcMain } from 'electron'
import { createLogger } from '../utils/logger'
import fs from 'fs'
import path from 'path'
import os from 'os'

const log = createLogger('ipc:skills')

interface SkillInfo {
  name: string
  description: string
  source: 'personal' | 'project'
  dirPath: string
  fileName: string
}

function parseSkillMd(content: string): { name?: string; description?: string; body: string } {
  // Parse YAML frontmatter from SKILL.md
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!fmMatch) {
    const firstLine = content.split('\n').find(l => l.trim()) || ''
    return { body: content, description: firstLine.replace(/^#+\s*/, '').slice(0, 120) }
  }
  const frontmatter = fmMatch[1]
  const body = fmMatch[2]
  let name: string | undefined
  let description: string | undefined
  for (const line of frontmatter.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)/)
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '')
    const descMatch = line.match(/^description:\s*(.+)/)
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '')
  }
  if (!description) {
    const firstLine = body.split('\n').find(l => l.trim()) || ''
    description = firstLine.replace(/^#+\s*/, '').slice(0, 120)
  }
  return { name, description, body }
}

function scanSkillsDir(dir: string, source: 'personal' | 'project'): SkillInfo[] {
  const skills: SkillInfo[] = []
  if (!fs.existsSync(dir)) return skills
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Look for SKILL.md inside directory
        const skillPath = path.join(dir, entry.name, 'SKILL.md')
        if (fs.existsSync(skillPath)) {
          try {
            const content = fs.readFileSync(skillPath, 'utf-8')
            const parsed = parseSkillMd(content)
            skills.push({
              name: parsed.name || entry.name,
              description: parsed.description || '',
              source,
              dirPath: path.join(dir, entry.name),
              fileName: entry.name,
            })
          } catch {
            // Skip unreadable files
          }
        }
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        // Top-level SKILL.md
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8')
          const parsed = parseSkillMd(content)
          skills.push({
            name: parsed.name || path.basename(dir),
            description: parsed.description || '',
            source,
            dirPath: dir,
            fileName: entry.name,
          })
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch (err) {
    log.debug('scanSkillsDir error:', String(err))
  }
  return skills
}

export function registerSkillsHandlers(): void {
  ipcMain.handle('skills:list', (_e, workingDir?: string) => {
    const personalDir = path.join(os.homedir(), '.claude', 'skills')
    const projectDirs: string[] = []
    if (workingDir && workingDir.trim()) {
      projectDirs.push(path.join(workingDir, '.claude', 'skills'))
    }
    const skills: SkillInfo[] = [
      ...scanSkillsDir(personalDir, 'personal'),
      ...projectDirs.flatMap(d => scanSkillsDir(d, 'project')),
    ]
    return skills
  })

  ipcMain.handle('skills:read', (_e, dirPath: string) => {
    try {
      const skillPath = path.join(dirPath, 'SKILL.md')
      if (!fs.existsSync(skillPath)) {
        // Maybe SKILL.md is in the dirPath itself (top-level)
        if (fs.existsSync(dirPath) && dirPath.endsWith('SKILL.md')) {
          return { content: fs.readFileSync(dirPath, 'utf-8') }
        }
        return { error: 'SKILL.md not found' }
      }
      return { content: fs.readFileSync(skillPath, 'utf-8') }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('skills:install', (_e, { name, content }: { name: string; content: string }) => {
    try {
      // Sanitize name for filesystem use
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
      const skillDir = path.join(os.homedir(), '.claude', 'skills', safeName)
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
      return { success: true, dirPath: skillDir }
    } catch (err) {
      log.warn('skills:install error:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('skills:fetchClawhub', async () => {
    try {
      const { net } = require('electron')
      const response = await net.fetch('https://clawhub.ai/api/v1/skills?sort=downloads&limit=50', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'AIPA/1.0' },
      })
      if (!response.ok) {
        return { error: `HTTP ${response.status}`, skills: [] }
      }
      const data = await response.json()
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        return { skills: data.items, source: 'api' }
      }
      // API returned empty -- try alternate endpoint
      const altResponse = await net.fetch('https://clawhub.ai/api/v1/skills', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'AIPA/1.0' },
      })
      if (altResponse.ok) {
        const altData = await altResponse.json()
        if (altData && Array.isArray(altData.items) && altData.items.length > 0) {
          return { skills: altData.items, source: 'api' }
        }
      }
      return { skills: [], source: 'empty', message: 'ClawhHub API returned no results' }
    } catch (err) {
      log.warn('skills:fetchClawhub error:', String(err))
      return { error: String(err), skills: [] }
    }
  })

  ipcMain.handle('skills:delete', (_e, dirPath: string) => {
    try {
      // Only allow deleting from personal skills directory
      const personalDir = path.join(os.homedir(), '.claude', 'skills')
      const resolved = path.resolve(dirPath)
      if (!resolved.startsWith(personalDir)) {
        return { error: 'Can only delete personal skills' }
      }
      if (fs.existsSync(resolved)) {
        fs.rmSync(resolved, { recursive: true, force: true })
      }
      return { success: true }
    } catch (err) {
      log.warn('skills:delete error:', String(err))
      return { error: String(err) }
    }
  })
}
