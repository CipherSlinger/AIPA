/**
 * URLs for nav plugins, served from the app's own `aipa-plugin:` scheme.
 *
 * Each plugin gets its own host — `aipa-plugin://p-<slug>-<hash>/<abs path>` —
 * so every plugin runs in a distinct origin. That is what keeps two plugins
 * from reading each other's `localStorage`, and it keeps them away from the
 * renderer's own origin (which a `file://` iframe with `allow-same-origin`
 * would not).
 *
 * The host is derived from the manifest id, so it is stable across reloads and
 * survives a plugin being moved on disk.
 */
import * as crypto from 'crypto'

/**
 * Stable URL host for a plugin id.
 *
 * The readable slug is truncated and the hash of the full id is appended, so
 * ids that differ only in case or punctuation (`My.Plugin` vs `my-plugin`)
 * cannot collide onto the same origin.
 */
export function pluginHost(pluginId: string): string {
  const slug = pluginId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'plugin'
  const hash = crypto.createHash('sha1').update(pluginId).digest('hex').slice(0, 8)
  return `p-${slug}-${hash}`
}

/** Percent-encode an absolute filesystem path for use as a URL path. */
export function encodePluginPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .split('/')
    .map(encodeURIComponent)
    .join('/')
}

/** `aipa-plugin://<host>/<encoded absolute path>` for a plugin's entry file. */
export function pluginUrl(pluginId: string, entryPath: string): string {
  return `aipa-plugin://${pluginHost(pluginId)}/${encodePluginPath(entryPath)}`
}

/**
 * Turn a URL pathname back into a filesystem path.
 *
 * Dot segments are preserved here on purpose: the protocol handler resolves the
 * result and then checks containment, so `..` must reach that check rather than
 * being silently normalised away by the URL parser.
 */
export function decodePluginPath(pathname: string): string {
  return pathname
    .replace(/^\/+/, '')
    .split('/')
    .map(segment => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join('/')
}