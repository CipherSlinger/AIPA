/**
 * npm install policy for `plugin:install:npm`.
 *
 * Pure by construction: no `fs`, no `child_process`, no logger, no Electron.
 * Every side effect is injected through {@link NpmInstallDeps}, which is what
 * lets the wave93C harness run the whole flow with a stubbed package manager
 * instead of touching this machine's global npm tree.
 *
 * Security rules encoded here:
 *  - the package spec is validated again, after the renderer's copy has
 *    already been bypassed (see `npm-package-name.ts`);
 *  - npm is invoked as `node <npm-cli.js> install -g <spec>` with an argv
 *    array — never a shell string, never a shell opt-in;
 *  - the child receives an allowlisted environment, not the whole of ours;
 *  - nothing is installed unless a plugin manifest exists in the installed
 *    package. A package that installed fine but carries no manifest is a
 *    refusal (`manifest_missing`), never a registered plugin pointed at
 *    node_modules.
 */
import * as path from 'path'
import { checkNpmPackageSpec, type PackageSpecRefusal } from './npm-package-name'

/** How npm was reached. `npm-cli-js` is the normal path on every platform. */
export interface NpmRunner {
  command: string
  prefixArgs: string[]
  env: Record<string, string>
  via: 'npm-cli-js' | 'npm-binary'
}

export type NpmInstallReason =
  | 'invalid_package_name'
  | 'npm_not_found'
  | 'install_failed'
  | 'manifest_missing'

export interface InstalledNpmPlugin {
  /** Manifest id when the package ships a nav-plugin manifest, else its name. */
  id: string
  name: string
  version?: string
  source: string
}

export type NpmInstallResult =
  | { ok: true; plugin: InstalledNpmPlugin }
  | { ok: false; reason: NpmInstallReason; detail: string }

/** File names that make a directory a plugin, in preference order. */
export const NPM_MANIFEST_FILES = ['claude-plugin.json', 'plugin.json', 'manifest.json'] as const

export const NPM_INSTALL_TIMEOUT_MS = 300_000
const NPM_ROOT_TIMEOUT_MS = 30_000
const MAX_DETAIL_LENGTH = 600

/** npm's own file, as shipped next to the node that runs this process. */
export function npmCliJsCandidates(input: {
  execPath: string
  env: Record<string, string | undefined>
  pathDirs: string[]
}): string[] {
  const out: string[] = []
  const override = input.env.AIPA_NPM_CLI
  if (override) out.push(override)
  out.push(path.join(path.dirname(input.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'))
  for (const dir of input.pathDirs) {
    out.push(path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'))
  }
  return out.filter((entry, index) => out.indexOf(entry) === index)
}

/** Electron's binary runs as node when this is set; plain node ignores it. */
export function npmRunnerFor(opts: { nodePath: string; npmCliJs: string }): NpmRunner {
  const result: NpmRunner = {
    command: opts.nodePath,
    prefixArgs: [opts.npmCliJs],
    env: {},
    via: 'npm-cli-js',
  }
  if (/^electron(\.exe)?$/i.test(path.basename(opts.nodePath))) {
    result.env.ELECTRON_RUN_AS_NODE = '1'
  }
  return result
}

/** The argv that follows `npm-cli.js`. The spec is exactly one element. */
export function npmArgs(subcommand: 'install', spec: string): string[]
export function npmArgs(subcommand: 'root'): string[]
export function npmArgs(subcommand: 'install' | 'root', spec?: string): string[] {
  if (subcommand === 'root') return ['root', '-g']
  return ['install', '-g', spec ?? '', '--no-audit', '--no-fund', '--loglevel=error']
}

/**
 * Where npm put the package. Scoped names are two directories deep; the old
 * code did `packageName.split('@')[0]`, which is the empty string for every
 * `@scope/name` and resolved to the whole global node_modules directory.
 */
export function resolvePackageDir(installRoot: string, packageName: string): string {
  const segments = packageName.startsWith('@') ? packageName.split('/') : [packageName]
  return path.join(installRoot, ...segments)
}

/** First manifest file that exists, or null. Input order is preference order. */
export function pickManifestFile(existing: readonly string[]): string | null {
  for (const name of NPM_MANIFEST_FILES) {
    if (existing.includes(name)) return name
  }
  return null
}

export interface ManifestIdentity {
  kind: 'nav' | 'claude'
  id: string | null
  name: string | null
}

/** Read an id/name out of a manifest without trusting its shape. */
export function readManifestIdentity(raw: unknown): ManifestIdentity | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const manifest = raw as Record<string, unknown>
  const id = typeof manifest.id === 'string' && manifest.id.trim() ? manifest.id.trim() : null
  const name = typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : null
  // A nav plugin declares id + name + main; anything else is a legacy Claude
  // plugin manifest, which the registry keys by name.
  if (id && name && typeof manifest.main === 'string' && manifest.main.trim()) {
    return { kind: 'nav', id, name }
  }
  if (name) return { kind: 'claude', id: null, name }
  return null
}

/** Map a spawn/npm failure onto the IPC contract's refusal vocabulary. */
export function classifyNpmFailure(err: unknown): { reason: NpmInstallReason; detail: string } {
  const failure = (err ?? {}) as { code?: unknown; message?: unknown; stderr?: unknown; killed?: unknown; signal?: unknown }
  const code = typeof failure.code === 'string' ? failure.code : ''
  if (code === 'ENOENT' || code === 'EACCES') {
    return { reason: 'npm_not_found', detail: `npm could not be started (${code})` }
  }
  const stderr = typeof failure.stderr === 'string' ? failure.stderr.trim() : ''
  const message = typeof failure.message === 'string' ? failure.message : ''
  if (failure.killed === true || /timed? ?out/i.test(message)) {
    return { reason: 'install_failed', detail: `npm did not finish within ${NPM_INSTALL_TIMEOUT_MS / 1000}s` }
  }
  const detail = (stderr || message || 'npm exited with an unknown error').slice(0, MAX_DETAIL_LENGTH)
  return { reason: 'install_failed', detail }
}

/**
 * The environment a child of this app is allowed to inherit. npm needs the
 * PATH/SystemRoot/proxy set; nothing else of ours leaks in. Package-manager
 * configuration (`npm_config_*`) and a user-exported `NPM_TOKEN` are passed
 * through so private registries keep working.
 */
const ENV_ALLOWLIST = new Set([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'COMSPEC', 'ComSpec',
  'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'OS', 'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE', 'PROCESSOR_ARCHITEW6432',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'LANG', 'LC_ALL', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME',
  'NPM_TOKEN', 'NODE_EXTRA_CA_CERTS',
])
const ENV_PREFIXES = ['npm_config_', 'NPM_CONFIG_']

export function npmEnv(
  base: Record<string, string | undefined>,
  extra: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (typeof value !== 'string') continue
    if (!ENV_ALLOWLIST.has(key) && !ENV_PREFIXES.some(prefix => key.startsWith(prefix))) continue
    out[key] = value
  }
  return { ...out, ...extra }
}

export interface NpmInstallDeps {
  /** npm as this machine can reach it, or null when nothing could be found. */
  locateRunner: () => NpmRunner | null
  /** Run npm with an argv array; resolves stdout, rejects on failure. */
  exec: (runner: NpmRunner, args: string[], timeoutMs: number) => Promise<string>
  exists: (filePath: string) => boolean
  readText: (filePath: string) => string
  /** Persist the plugin and return the registry entry it produced. */
  register: (pluginDir: string, source: string) => { name: string; version?: string }
}

/**
 * Install a plugin package and return a result the renderer can explain.
 * Never throws: a refusal is data, because the renderer has to say what went
 * wrong instead of showing an invoke rejection.
 */
export async function installNpmPluginWith(packageName: string, deps: NpmInstallDeps): Promise<NpmInstallResult> {
  const checked = checkNpmPackageSpec(packageName)
  if (!checked.ok) {
    return { ok: false, reason: 'invalid_package_name', detail: refusalDetail(checked.reason) }
  }
  const spec = checked.spec.spec

  const runner = deps.locateRunner()
  if (!runner) {
    return {
      ok: false,
      reason: 'npm_not_found',
      detail: 'npm was not found next to node and no npm-cli.js was found on PATH',
    }
  }

  try {
    await deps.exec(runner, npmArgs('install', spec), NPM_INSTALL_TIMEOUT_MS)
  } catch (err) {
    const failure = classifyNpmFailure(err)
    return { ok: false, reason: failure.reason, detail: failure.detail }
  }

  let installRoot = ''
  try {
    installRoot = (await deps.exec(runner, npmArgs('root'), NPM_ROOT_TIMEOUT_MS)).trim()
  } catch (err) {
    return { ok: false, reason: 'install_failed', detail: `npm root -g failed: ${classifyNpmFailure(err).detail}` }
  }
  if (!installRoot) {
    return { ok: false, reason: 'install_failed', detail: 'npm root -g returned no directory' }
  }

  const packageDir = resolvePackageDir(installRoot, checked.spec.packageName)
  if (!deps.exists(packageDir)) {
    return {
      ok: false,
      reason: 'install_failed',
      detail: `npm finished but ${packageDir} does not exist`,
    }
  }

  const manifestFile = pickManifestFile(NPM_MANIFEST_FILES.filter(name => deps.exists(path.join(packageDir, name))))
  if (!manifestFile) {
    return {
      ok: false,
      reason: 'manifest_missing',
      detail: `The package contains none of: ${NPM_MANIFEST_FILES.join(', ')}`,
    }
  }

  let identity: ManifestIdentity | null = null
  try {
    identity = readManifestIdentity(JSON.parse(deps.readText(path.join(packageDir, manifestFile))))
  } catch {
    return { ok: false, reason: 'manifest_missing', detail: `${manifestFile} could not be read as JSON` }
  }
  if (!identity) {
    return { ok: false, reason: 'manifest_missing', detail: `${manifestFile} declares neither an id nor a name` }
  }

  const source = `npm:${spec}`
  let registered: { name: string; version?: string }
  try {
    registered = deps.register(packageDir, source)
  } catch (err) {
    return { ok: false, reason: 'install_failed', detail: `The plugin could not be registered: ${String(err).slice(0, MAX_DETAIL_LENGTH)}` }
  }
  if (!registered || !registered.name) {
    return { ok: false, reason: 'install_failed', detail: 'The plugin was installed but not registered' }
  }

  return {
    ok: true,
    plugin: {
      id: identity.id ?? registered.name,
      name: identity.name ?? registered.name,
      version: registered.version ?? checked.spec.version ?? undefined,
      source,
    },
  }
}

/** Machine-readable refusal text for the harness and the log line. */
export function refusalDetail(reason: PackageSpecRefusal): string {
  switch (reason) {
    case 'empty': return 'The package name is empty'
    case 'too_long': return 'The package name is longer than npm allows'
    case 'absolute_path': return 'A folder path is not a package name'
    case 'leading_dash': return 'A package name cannot start with -'
    case 'path_traversal': return 'A package name cannot contain ..'
    case 'whitespace': return 'A package name cannot contain whitespace'
    case 'invalid_chars': return 'A package name may contain only letters, digits, . _ - / and @'
    case 'invalid_shape': return 'A package name must look like name or @scope/name, optionally @version'
  }
}