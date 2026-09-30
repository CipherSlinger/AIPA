/**
 * Reader/writer for the MCP section of `~/.codex/config.toml`.
 *
 * Codex keeps MCP servers in TOML tables, with sub-tables for map values:
 *
 *   [mcp_servers.demo]
 *   command = "npx"
 *   args = ["-y", "@demo/server"]
 *
 *   [mcp_servers.demo.env]
 *   FOO = "bar"
 *
 * `enabled = false` marks a server as disabled (Codex lists it but never
 * launches it), which is the Codex equivalent of Claude's `disabled: true`.
 *
 * The app's MCP UI speaks the Claude shape ({ command, args, env, url, type,
 * disabled }), so this module converts both ways. Edits are surgical: only the
 * `[mcp_servers.*]` region is touched — every other table in the file (model,
 * approval_policy, projects, …) and every key we don't own stays byte-identical.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export interface CodexMcpServer {
  name: string
  /** stdio transport */
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  /** streamable HTTP transport */
  url?: string
  headers?: Record<string, string>
  bearerTokenEnvVar?: string
  /** false => Codex skips the server entirely */
  enabled: boolean
}

/** Top-level keys this module owns inside a `[mcp_servers.<name>]` table. */
const MANAGED_KEYS = ['command', 'args', 'cwd', 'url', 'bearer_token_env_var', 'enabled'] as const
/** Sub-tables this module owns. Anything else in the table is preserved. */
const MANAGED_SUBTABLES = ['env', 'http_headers'] as const

export function getCodexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

export function getCodexConfigPath(): string {
  return path.join(getCodexHome(), 'config.toml')
}

// ── Public API ───────────────────────────────────────

/** Read every `[mcp_servers.<name>]` table out of `~/.codex/config.toml`. */
export function readCodexMcpServers(): CodexMcpServer[] {
  const configPath = getCodexConfigPath()
  if (!fs.existsSync(configPath)) return []

  let content: string
  try {
    content = fs.readFileSync(configPath, 'utf-8')
  } catch {
    return []
  }

  const lines = content.split('\n')
  const blocks = scanMcpBlocks(lines)

  const servers: CodexMcpServer[] = []
  for (const block of blocks.values()) {
    if (block.header < 0) continue
    const server: CodexMcpServer = { name: block.name, enabled: true }

    for (const entry of block.keys) {
      const value = parseTomlValue(entry.value)
      switch (entry.key) {
        case 'command': if (typeof value === 'string') server.command = value; break
        case 'cwd': if (typeof value === 'string') server.cwd = value; break
        case 'url': if (typeof value === 'string') server.url = value; break
        case 'bearer_token_env_var': if (typeof value === 'string') server.bearerTokenEnvVar = value; break
        case 'enabled': if (value === false) server.enabled = false; break
        case 'args':
          if (Array.isArray(value)) server.args = value.map(String)
          else if (typeof value === 'string') server.args = value.split(/\s+/).filter(Boolean)
          break
      }
    }

    for (const sub of block.subTables) {
      const name = sub.path.join('.')
      if (name !== 'env' && name !== 'http_headers') continue
      const rows: Record<string, string> = {}
      for (let i = sub.header + 1; i <= sub.end; i++) {
        const kv = splitKeyValue(lines[i])
        if (!kv) continue
        const value = parseTomlValue(kv.value)
        rows[kv.key] = typeof value === 'string' ? value : String(value)
      }
      if (name === 'env') server.env = rows
      else server.headers = rows
    }

    servers.push(server)
  }

  return servers
}

/**
 * Add a server, or replace the transport of an existing one. Keys and
 * sub-tables this module does not own (timeouts, OAuth settings, …) survive.
 */
export function upsertCodexMcpServer(server: CodexMcpServer): void {
  patchServer(server.name, {
    command: server.command === undefined ? null : tomlString(server.command),
    args: server.args === undefined ? null : tomlArray(server.args),
    cwd: server.cwd === undefined ? null : tomlString(server.cwd),
    url: server.url === undefined ? null : tomlString(server.url),
    bearer_token_env_var: server.bearerTokenEnvVar === undefined ? null : tomlString(server.bearerTokenEnvVar),
    // Enabled is Codex's default — only write the key when disabling, matching
    // what `codex mcp add` itself produces.
    enabled: server.enabled ? null : 'false',
  }, [
    { name: 'env', rows: Object.entries(server.env ?? {}) },
    { name: 'http_headers', rows: Object.entries(server.headers ?? {}) },
  ])
}

/** Flip `enabled` on an existing server without touching its transport. */
export function setCodexMcpServerEnabled(name: string, enabled: boolean): boolean {
  const exists = readCodexMcpServers().some(s => s.name === name)
  if (!exists) return false
  patchServer(name, { enabled: enabled ? null : 'false' })
  return true
}

/** Delete a server and all of its sub-tables. */
export function removeCodexMcpServer(name: string): boolean {
  const configPath = getCodexConfigPath()
  if (!fs.existsSync(configPath)) return false

  const lines = readLines(configPath)
  const block = scanMcpBlocks(lines).get(name)
  if (!block || block.header < 0) return false

  // Swallow one trailing blank line so repeated removals don't leave a gap.
  let end = block.end
  if (lines[end + 1] !== undefined && lines[end + 1].trim() === '') end += 1

  lines.splice(block.header, end - block.header + 1)
  writeLines(configPath, lines)
  return true
}

// ── Editing ──────────────────────────────────────────

/**
 * Apply a set of key edits (and optional sub-table replacement) to one server
 * table, creating the table when it does not exist yet.
 *
 * A `null` value deletes the key; keys missing from `sets` are left untouched.
 */
function patchServer(
  name: string,
  sets: Record<string, string | null>,
  replaceSubTables?: Array<{ name: string; rows: Array<[string, string]> }>,
): void {
  const configPath = getCodexConfigPath()
  const lines = fs.existsSync(configPath) ? readLines(configPath) : []
  const block = scanMcpBlocks(lines).get(name)

  if (!block || block.header < 0) {
    const fresh = [`[mcp_servers.${tomlKey(name)}]`]
    for (const [key, value] of Object.entries(sets)) {
      if (value !== null) fresh.push(`${key} = ${value}`)
    }
    for (const sub of replaceSubTables ?? []) {
      if (sub.rows.length === 0) continue
      fresh.push('', `[mcp_servers.${tomlKey(name)}.${sub.name}]`)
      for (const [k, v] of sub.rows) fresh.push(`${tomlKey(k)} = ${tomlString(v)}`)
    }
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') lines.push('')
    lines.push(...fresh)
    writeLines(configPath, lines)
    return
  }

  // Rebuild just this server's region (own table + sub-tables) and splice it
  // back, so unrelated tables and formatting elsewhere stay untouched.
  const own: string[] = [`[mcp_servers.${tomlKey(name)}]`]
  const seen = new Set<string>()
  for (const entry of block.keys) {
    seen.add(entry.key)
    if ((MANAGED_KEYS as readonly string[]).includes(entry.key)) {
      const next = sets[entry.key]
      if (next === undefined) own.push(lines[entry.index])
      else if (next !== null) own.push(`${entry.key} = ${next}`)
    } else {
      own.push(lines[entry.index])   // keys we don't own survive verbatim
    }
  }
  for (const key of MANAGED_KEYS) {
    if (seen.has(key) || sets[key] === undefined || sets[key] === null) continue
    own.push(`${key} = ${sets[key]}`)
  }

  // Sub-tables, in their original order: managed ones are re-emitted from the
  // caller's data (dropped when empty), anything else is kept verbatim.
  const region = lines.slice(block.header, block.end + 1)
  const rebuilt = [...own]
  for (const sub of block.subTables) {
    const subName = sub.path.join('.')
    if ((MANAGED_SUBTABLES as readonly string[]).includes(subName)) {
      const replacement = replaceSubTables?.find(s => s.name === subName)
      if (!replacement || replacement.rows.length === 0) continue
      rebuilt.push('', `[mcp_servers.${tomlKey(name)}.${subName}]`)
      for (const [k, v] of replacement.rows) rebuilt.push(`${tomlKey(k)} = ${tomlString(v)}`)
    } else {
      rebuilt.push(...region.slice(sub.header - block.header, sub.end - block.header + 1))
    }
  }
  // Sub-tables the caller added that the table did not have before.
  for (const sub of replaceSubTables ?? []) {
    if (sub.rows.length === 0 || block.subTables.some(s => s.path.join('.') === sub.name)) continue
    rebuilt.push('', `[mcp_servers.${tomlKey(name)}.${sub.name}]`)
    for (const [k, v] of sub.rows) rebuilt.push(`${tomlKey(k)} = ${tomlString(v)}`)
  }
  // Preserve the blank line that separated this table from the next one.
  if (region[region.length - 1].trim() === '') rebuilt.push('')

  const next = [...lines.slice(0, block.header), ...rebuilt, ...lines.slice(block.end + 1)]
  writeLines(configPath, next)
}

function readLines(configPath: string): string[] {
  const content = fs.readFileSync(configPath, 'utf-8')
  const lines = content.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function writeLines(configPath: string, lines: string[]): void {
  const out = [...lines]
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()

  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmpPath = `${configPath}.tmp`
  fs.writeFileSync(tmpPath, out.join('\n') + '\n', 'utf-8')
  fs.renameSync(tmpPath, configPath)
}

// ── TOML scanning ────────────────────────────────────

interface ServerBlock {
  name: string
  /** Index of the `[mcp_servers.<name>]` header, or -1 when only sub-tables exist. */
  header: number
  /** Last line belonging to this server, sub-tables included. */
  end: number
  keys: Array<{ index: number; key: string; value: string }>
  subTables: Array<{ path: string[]; header: number; end: number }>
}

/**
 * Locate every `[mcp_servers.*]` table. A table runs until the next header line
 * of any kind, so sub-tables (`env`, `http_headers`) fold into their server.
 */
function scanMcpBlocks(lines: string[]): Map<string, ServerBlock> {
  const headers: Array<{ index: number; path: string[] }> = []
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseHeader(lines[i])
    if (parsed) headers.push({ index: i, path: parsed })
  }

  const blocks = new Map<string, ServerBlock>()
  for (let n = 0; n < headers.length; n++) {
    const header = headers[n]
    if (header.path[0] !== 'mcp_servers' || header.path.length < 2) continue

    const name = header.path[1]
    const end = (n + 1 < headers.length ? headers[n + 1].index : lines.length) - 1
    let block = blocks.get(name)
    if (!block) {
      block = { name, header: -1, end, keys: [], subTables: [] }
      blocks.set(name, block)
    }
    block.end = Math.max(block.end, end)

    if (header.path.length === 2) {
      block.header = header.index
      for (let i = header.index + 1; i <= end; i++) {
        const kv = splitKeyValue(lines[i])
        if (kv) block.keys.push({ index: i, key: kv.key, value: kv.value })
      }
    } else {
      block.subTables.push({ path: header.path.slice(2), header: header.index, end })
    }
  }

  return blocks
}

/** `[mcp_servers."my server".env]` → ['mcp_servers', 'my server', 'env'] */
function parseHeader(line: string): string[] | null {
  const trimmed = stripComment(line).trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null
  const inner = trimmed.startsWith('[[') ? trimmed.slice(2, -2) : trimmed.slice(1, -1)

  const parts: string[] = []
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '.') { parts.push(current.trim()); current = ''; continue }
    current += ch
  }
  parts.push(current.trim())
  return parts
}

/** Remove a trailing `# comment`, ignoring `#` inside strings. */
function stripComment(line: string): string {
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '#') return line.slice(0, i)
  }
  return line
}

function splitKeyValue(line: string): { key: string; value: string } | null {
  const clean = stripComment(line)
  const idx = clean.indexOf('=')
  if (idx < 0) return null
  const key = clean.slice(0, idx).trim().replace(/^["']|["']$/g, '')
  if (!key) return null
  return { key, value: clean.slice(idx + 1).trim() }
}

function parseTomlValue(raw: string): unknown {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return unescapeBasic(value.slice(1, -1))
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  if (value === 'true') return true
  if (value === 'false') return false
  if (value.startsWith('[')) return splitTopLevel(value.slice(1, -1)).map(parseTomlValue)
  if (value.startsWith('{')) {
    const table: Record<string, unknown> = {}
    for (const entry of splitTopLevel(value.slice(1, -1))) {
      const idx = entry.indexOf('=')
      if (idx < 0) continue
      table[entry.slice(0, idx).trim().replace(/^["']|["']$/g, '')] = parseTomlValue(entry.slice(idx + 1))
    }
    return table
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value
}

/** Split on commas that are not inside a string, array or inline table. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote: string | null = null
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      current += ch
      if (ch === '\\' && quote === '"') { current += input[i + 1] ?? ''; i += 1 }
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue }
    if (ch === '[' || ch === '{') depth += 1
    if (ch === ']' || ch === '}') depth -= 1
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function unescapeBasic(value: string): string {
  return value.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_m, esc: string) => {
    switch (esc[0]) {
      case 'n': return '\n'
      case 't': return '\t'
      case 'r': return '\r'
      case 'b': return '\b'
      case 'f': return '\f'
      case '"': return '"'
      case '\\': return '\\'
      case 'u': return String.fromCharCode(parseInt(esc.slice(1), 16))
      case 'U': return String.fromCodePoint(parseInt(esc.slice(1), 16))
      default: return esc
    }
  })
}

function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key)
}

/** JSON string escaping is a subset of TOML basic strings. */
function tomlString(value: string): string {
  return JSON.stringify(value)
}

function tomlArray(values: string[]): string {
  return `[${values.map(tomlString).join(', ')}]`
}
