/**
 * npm package-spec validation for `plugin:install:npm`.
 *
 * This is the authoritative copy. `src/renderer/lib/pluginInstallInput.ts`
 * mirrors it verbatim (same pattern string, same check order) only so the
 * Install button can be disabled, with a reason, before any process starts.
 * The renderer copy is convenience-only: this one runs on every invoke, after
 * the renderer's copy has already been bypassed by whoever called the channel.
 *
 * What is accepted: `name`, `@scope/name`, each with an optional `@version`
 * (a semver or a dist-tag). What is refused: empty input, whitespace, leading
 * `-` (would be read by npm as a flag), absolute/UNC/`~` paths, `..`, and any
 * character outside the registry's set — `; & | $ ` quotes, `<>`, backslash,
 * wildcards, `:`, `=`. None of this is a substitute for passing the spec as a
 * single argv element, which `npm-install-plan.ts` does.
 */

/** Canonical pattern. Kept as source text so both copies can be compared. */
export const NPM_PACKAGE_SPEC_SOURCE =
  '^(?:@[A-Za-z0-9][A-Za-z0-9._-]*/)?[A-Za-z0-9][A-Za-z0-9._-]*(?:@[A-Za-z0-9][A-Za-z0-9._-]*)?$'

const SPEC_RE = new RegExp(NPM_PACKAGE_SPEC_SOURCE)
const DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/
const UNC_ABSOLUTE = /^(?:\\\\|\/\/)/
const POSIX_ABSOLUTE = /^\//
const HOME_ABSOLUTE = /^~/
const ALLOWED_CHARS = /^[@A-Za-z0-9._/-]+$/
const MAX_SPEC_LENGTH = 214

export type PackageSpecRefusal =
  | 'empty'
  | 'too_long'
  | 'absolute_path'
  | 'leading_dash'
  | 'path_traversal'
  | 'whitespace'
  | 'invalid_chars'
  | 'invalid_shape'

export interface PackageSpec {
  /** `name` or `@scope/name`, without the version. */
  packageName: string
  /** The `@version` half, or null when none was given. */
  version: string | null
  /** The trimmed spec, exactly as it should be handed to npm as one argv entry. */
  spec: string
}

export type PackageSpecCheck =
  | { ok: true; spec: PackageSpec }
  | { ok: false; reason: PackageSpecRefusal }

export function checkNpmPackageSpec(input: unknown): PackageSpecCheck {
  if (typeof input !== 'string') return { ok: false, reason: 'empty' }
  const raw = input.trim()
  if (!raw) return { ok: false, reason: 'empty' }
  if (raw.length > MAX_SPEC_LENGTH) return { ok: false, reason: 'too_long' }
  // A folder path is refused before the character test so the user is told the
  // real problem instead of "unsupported character: \".
  if (DRIVE_ABSOLUTE.test(raw) || UNC_ABSOLUTE.test(raw) || POSIX_ABSOLUTE.test(raw) || HOME_ABSOLUTE.test(raw)) {
    return { ok: false, reason: 'absolute_path' }
  }
  if (raw.startsWith('-')) return { ok: false, reason: 'leading_dash' }
  if (raw.includes('..')) return { ok: false, reason: 'path_traversal' }
  if (/\s/.test(raw)) return { ok: false, reason: 'whitespace' }
  if (!ALLOWED_CHARS.test(raw)) return { ok: false, reason: 'invalid_chars' }
  if (!SPEC_RE.test(raw)) return { ok: false, reason: 'invalid_shape' }

  // The last `@` separates the version. A scoped name starts with `@` at index
  // 0, so only an index above 0 is a version separator.
  const at = raw.lastIndexOf('@')
  const packageName = at > 0 ? raw.slice(0, at) : raw
  const version = at > 0 ? raw.slice(at + 1) : null
  if (!packageName || version === '') return { ok: false, reason: 'invalid_shape' }

  return { ok: true, spec: { packageName, version, spec: raw } }
}