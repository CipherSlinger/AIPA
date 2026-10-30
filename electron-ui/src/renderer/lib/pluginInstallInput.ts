/**
 * Plugin install policy for Settings → Plugins: what a package name may look
 * like, when each Install button is enabled and why it is not, and the words
 * each outcome is reported in.
 *
 * Rules, in the order they are enforced:
 *
 *  1. A package name is `name` or `@scope/name`, optionally followed by
 *     `@version` (a semver or a dist-tag). Nothing else is a package: empty
 *     input, leading `-`, absolute/UNC/`~` paths and `..` are refused with
 *     their own reason, then anything outside `[@A-Za-z0-9._/-]` and finally
 *     anything that does not match the full shape.
 *  2. The spec is passed to npm as exactly one argv element. The string is
 *     never assembled into a shell command, so the validator's job is to keep
 *     nonsense out of the registry request — not to escape it.
 *  3. The button is disabled (with the reason shown) while the input is
 *     invalid, while a previous install is running, and — for the local tab —
 *     while no folder has been picked. Nothing is ever installed on mount.
 *  4. The same validation runs again in the main process
 *     (`src/main/plugins/npm-package-name.ts`). THIS COPY IS CONVENIENCE
 *     ONLY: it disables a button and explains why. The main-process copy is
 *     the one that decides, because a renderer is not trusted to be the one
 *     calling the channel.
 *
 * No React, no DOM, no IPC at module scope: everything here is deterministic
 * so the wave93C harness can compare it against the main-process copy sample
 * by sample.
 */

/** Canonical pattern; identical to `NPM_PACKAGE_SPEC_SOURCE` in main. */
export const NPM_PACKAGE_SPEC_SOURCE =
  '^(?:@[A-Za-z0-9][A-Za-z0-9._-]*/)?[A-Za-z0-9][A-Za-z0-9._-]*(?:@[A-Za-z0-9][A-Za-z0-9._-]*)?$'

const SPEC_RE = new RegExp(NPM_PACKAGE_SPEC_SOURCE)
const DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/
const UNC_ABSOLUTE = /^(?:\\\\|\/\/)/
const POSIX_ABSOLUTE = /^\//
const HOME_ABSOLUTE = /^~/
const ALLOWED_CHARS = /^[@A-Za-z0-9._/-]+$/
const MAX_SPEC_LENGTH = 214

/** Same vocabulary as `PackageSpecRefusal` in the main process. */
export type NpmSpecRefusal =
  | 'empty'
  | 'too_long'
  | 'absolute_path'
  | 'leading_dash'
  | 'path_traversal'
  | 'whitespace'
  | 'invalid_chars'
  | 'invalid_shape'

export type NpmSpecCheck =
  | { ok: true; spec: string; packageName: string; version: string | null }
  | { ok: false; reason: NpmSpecRefusal }

export function checkNpmPackageSpec(input: unknown): NpmSpecCheck {
  if (typeof input !== 'string') return { ok: false, reason: 'empty' }
  const raw = input.trim()
  if (!raw) return { ok: false, reason: 'empty' }
  if (raw.length > MAX_SPEC_LENGTH) return { ok: false, reason: 'too_long' }
  if (DRIVE_ABSOLUTE.test(raw) || UNC_ABSOLUTE.test(raw) || POSIX_ABSOLUTE.test(raw) || HOME_ABSOLUTE.test(raw)) {
    return { ok: false, reason: 'absolute_path' }
  }
  if (raw.startsWith('-')) return { ok: false, reason: 'leading_dash' }
  if (raw.includes('..')) return { ok: false, reason: 'path_traversal' }
  if (/\s/.test(raw)) return { ok: false, reason: 'whitespace' }
  if (!ALLOWED_CHARS.test(raw)) return { ok: false, reason: 'invalid_chars' }
  if (!SPEC_RE.test(raw)) return { ok: false, reason: 'invalid_shape' }

  const at = raw.lastIndexOf('@')
  const packageName = at > 0 ? raw.slice(0, at) : raw
  const version = at > 0 ? raw.slice(at + 1) : null
  if (!packageName || version === '') return { ok: false, reason: 'invalid_shape' }
  return { ok: true, spec: raw, packageName, version }
}

// ── Installing mode ────────────────────────────────────────────────────────
export const INSTALL_MODES = ['local', 'npm'] as const
export type InstallMode = typeof INSTALL_MODES[number]

export function isInstallMode(value: unknown): value is InstallMode {
  return typeof value === 'string' && (INSTALL_MODES as readonly string[]).includes(value)
}

// ── Why the button is (not) enabled ────────────────────────────────────────
export type InstallGateReason = NpmSpecRefusal | 'no_folder' | 'busy'

export interface InstallGate {
  enabled: boolean
  reason: InstallGateReason | null
}

export function npmInstallGate(input: string, busy: boolean): InstallGate {
  if (busy) return { enabled: false, reason: 'busy' }
  const checked = checkNpmPackageSpec(input)
  if (!checked.ok) return { enabled: false, reason: checked.reason }
  return { enabled: true, reason: null }
}

export function localInstallGate(folder: string, busy: boolean): InstallGate {
  if (busy) return { enabled: false, reason: 'busy' }
  if (!folder.trim()) return { enabled: false, reason: 'no_folder' }
  return { enabled: true, reason: null }
}

/** The sentence for a disabled button's reason; null when it is enabled. */
export function gateMessage(gate: InstallGate): { key: string; params?: Record<string, string> } | null {
  if (gate.reason === null) return null
  if (gate.reason === 'busy') return { key: 'settingsPlugins.gate.busy' }
  if (gate.reason === 'no_folder') return { key: 'settingsPlugins.gate.noFolder' }
  return { key: REFUSAL_KEYS[gate.reason] }
}

/** Every refusal key spelled out, so a missing translation is a type error. */
const REFUSAL_KEYS: Record<NpmSpecRefusal, string> = {
  empty: 'settingsPlugins.npmRefused.empty',
  too_long: 'settingsPlugins.npmRefused.too_long',
  absolute_path: 'settingsPlugins.npmRefused.absolute_path',
  leading_dash: 'settingsPlugins.npmRefused.leading_dash',
  path_traversal: 'settingsPlugins.npmRefused.path_traversal',
  whitespace: 'settingsPlugins.npmRefused.whitespace',
  invalid_chars: 'settingsPlugins.npmRefused.invalid_chars',
  invalid_shape: 'settingsPlugins.npmRefused.invalid_shape',
}

// ── Install results ────────────────────────────────────────────────────────
/** The typed refusal reasons `plugin:install:npm` can return. */
export type NpmInstallReason =
  | 'invalid_package_name'
  | 'npm_not_found'
  | 'install_failed'
  | 'manifest_missing'

export interface NpmInstallResult {
  ok: boolean
  plugin?: { id: string; name: string; version?: string; source: string }
  reason?: NpmInstallReason | string
  detail?: string
}

const KNOWN_REASONS = new Set<string>([
  'invalid_package_name',
  'npm_not_found',
  'install_failed',
  'manifest_missing',
])

export function isNpmInstallResult(value: unknown): value is NpmInstallResult {
  return Boolean(value) && typeof value === 'object' && typeof (value as NpmInstallResult).ok === 'boolean'
}

export interface InstallMessage {
  key: string
  params: Record<string, string>
}

/**
 * The sentence for an install result. Success names the plugin; a refusal is
 * named by its reason and never claims that a plugin appeared. An unknown
 * reason is reported as a failed install rather than being swallowed.
 */
export function installResultMessage(
  result: NpmInstallResult,
  attempted: string,
): InstallMessage {
  if (result.ok && result.plugin && result.plugin.name) {
    return {
      key: 'settingsPlugins.npmResult.ok',
      params: { name: result.plugin.name, spec: attempted.trim() },
    }
  }
  const reason = KNOWN_REASONS.has(String(result.reason)) ? String(result.reason) : 'install_failed'
  return {
    key: RESULT_KEYS[reason as NpmInstallReason],
    params: { spec: attempted.trim(), detail: result.detail || '' },
  }
}

const RESULT_KEYS: Record<NpmInstallReason, string> = {
  invalid_package_name: 'settingsPlugins.npmResult.invalid_package_name',
  npm_not_found: 'settingsPlugins.npmResult.npm_not_found',
  install_failed: 'settingsPlugins.npmResult.install_failed',
  manifest_missing: 'settingsPlugins.npmResult.manifest_missing',
}

// ── Reloading nav plugins ──────────────────────────────────────────────────
export type NavReloadKind = 'none_installed' | 'unchanged' | 'changed'

export interface NavReloadSummary {
  kind: NavReloadKind
  /** How many nav plugins exist after the rescan. */
  count: number
  /** Added + removed + same-id-different-folder. */
  changed: number
}

export interface NavPluginIdentity {
  id: string
  dirPath?: string
}

/**
 * Compare the rails before and after `plugin:nav:reload`. The reload returns
 * the current list, not a diff, so "changed" is computed here: a new id, a
 * vanished id, or the same id serving from a different folder.
 */
export function navReloadSummary(before: NavPluginIdentity[], after: NavPluginIdentity[]): NavReloadSummary {
  const beforeMap = new Map(before.map(p => [p.id, p.dirPath || '']))
  const afterMap = new Map(after.map(p => [p.id, p.dirPath || '']))
  let changed = 0
  for (const [id, dir] of afterMap) {
    if (!beforeMap.has(id)) changed += 1
    else if (dir && beforeMap.get(id) && dir !== beforeMap.get(id)) changed += 1
  }
  for (const id of beforeMap.keys()) {
    if (!afterMap.has(id)) changed += 1
  }
  if (after.length === 0) return { kind: 'none_installed', count: 0, changed }
  return { kind: changed > 0 ? 'changed' : 'unchanged', count: after.length, changed }
}

export function reloadMessage(summary: NavReloadSummary): InstallMessage {
  if (summary.kind === 'none_installed') {
    return { key: 'settingsPlugins.reload.none', params: {} }
  }
  if (summary.kind === 'changed') {
    return {
      key: summary.changed === 1 ? 'settingsPlugins.reload.changed_one' : 'settingsPlugins.reload.changed_other',
      params: { changed: String(summary.changed), count: String(summary.count) },
    }
  }
  return {
    key: summary.count === 1 ? 'settingsPlugins.reload.unchanged_one' : 'settingsPlugins.reload.unchanged_other',
    params: { count: String(summary.count) },
  }
}