import { ipcMain, shell } from 'electron'
import { createLogger } from '../../utils/logger'
import { safeHandle } from './safe-handle'

const log = createLogger('ipc')

// ----------------------------------------
// Shell handlers
// ----------------------------------------
export function registerShellHandlers(): void {
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    // Only allow http/https URLs to prevent shell command injection
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url)
      }
    } catch {
      log.warn('shell:openExternal rejected invalid URL:', url)
    }
  })

  // Fetch URL Open Graph metadata for link preview cards (Iteration 462)
  safeHandle('url:fetchMeta', async (_e, url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
      // Link previews come from chat transcripts, i.e. from content an agent
      // produced. Without this a crafted link could make the main process
      // probe loopback services or the cloud metadata endpoint from inside
      // the user's network and report the result back as a page title.
      if (isPrivateHost(parsed.hostname)) return null
      const https = require('https')
      const http = require('http')
      const mod = parsed.protocol === 'https:' ? https : http
      return await new Promise<{ title: string; description: string; favicon: string; domain: string } | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 3000)
        const req = mod.get(url, { headers: { 'User-Agent': 'AIPA/1.0' } }, (res: any) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // Follow one redirect
            clearTimeout(timer)
            resolve(null) // Simplified: don't follow redirects, just fail gracefully
            res.resume()
            return
          }
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk: string) => {
            body += chunk
            if (body.length > 50000) { res.destroy(); }
          })
          res.on('end', () => {
            clearTimeout(timer)
            try {
              const titleMatch = body.match(/<meta\s+property="og:title"\s+content="([^"]*)"/) ||
                body.match(/<meta\s+content="([^"]*)"\s+property="og:title"/) ||
                body.match(/<title[^>]*>([^<]*)<\/title>/)
              const descMatch = body.match(/<meta\s+property="og:description"\s+content="([^"]*)"/) ||
                body.match(/<meta\s+content="([^"]*)"\s+property="og:description"/) ||
                body.match(/<meta\s+name="description"\s+content="([^"]*)"/) ||
                body.match(/<meta\s+content="([^"]*)"\s+name="description"/)
              const faviconMatch = body.match(/<link[^>]+rel="(?:shortcut )?icon"[^>]+href="([^"]*)"/) ||
                body.match(/<link[^>]+href="([^"]*)"[^>]+rel="(?:shortcut )?icon"/)
              const domain = parsed.hostname
              let favicon = ''
              if (faviconMatch?.[1]) {
                favicon = faviconMatch[1].startsWith('http') ? faviconMatch[1] : `${parsed.protocol}//${domain}${faviconMatch[1].startsWith('/') ? '' : '/'}${faviconMatch[1]}`
              } else {
                favicon = `${parsed.protocol}//${domain}/favicon.ico`
              }
              resolve({
                title: titleMatch?.[1]?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"') || domain,
                description: descMatch?.[1]?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"') || '',
                favicon,
                domain,
              })
            } catch {
              resolve(null)
            }
          })
          res.on('error', () => { clearTimeout(timer); resolve(null) })
        })
        req.on('error', () => { clearTimeout(timer); resolve(null) })
        req.end()
      })
    } catch {
      return null
    }
  })
}

/** Loopback, link-local and RFC-1918 hosts must never be fetched for previews. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') return true
  // IPv6 loopback / unspecified / unique-local / link-local
  if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!v4) return false
  const [a, b] = [Number(v4[1]), Number(v4[2])]
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}
