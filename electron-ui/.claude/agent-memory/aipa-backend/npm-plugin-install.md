---
name: npm-plugin-install
description: plugin:install:npm — why npm-cli.js is spawned instead of npm, the scoped-path bug the old installNpmPlugin had, and the two-copy validator rule
metadata:
  type: project
---

`plugin:install:npm` (wave 93C) is the only IPC channel that mutates the user's **global npm tree**. Three non-obvious constraints shape it:

- **npm is run as `node <npm-cli.js>` with an argv array, never as `npm`.** On Windows `execFile('npm', …)` is ENOENT and `execFile('npm.cmd', …)` is EINVAL without a shell; `shell: true` is exactly what a package-name channel must not use. `npm-cli.js` lives at `path.dirname(process.execPath)/node_modules/npm/bin/npm-cli.js`; Electron needs `ELECTRON_RUN_AS_NODE=1` in the child env to run it. The override env var is `AIPA_NPM_CLI`.
- **`installNpmPlugin` used to resolve scoped packages to the whole global root.** `packageName.split('@')[0]` is `''` for `@scope/name`, so it registered `node_modules` itself. Correct resolution is `path.join(root, ...(name.startsWith('@') ? name.split('/') : [name]))` — `resolvePackageDir` in `src/main/plugins/npm-install.ts`.
- **The validator exists twice on purpose.** `src/main/plugins/npm-package-name.ts` is authoritative; `src/renderer/lib/pluginInstallInput.ts` mirrors its pattern string byte-for-byte so the Install button can be disabled with a reason before any process starts. They cannot share a file: `tsconfig.main.json` has `rootDir: src/main` and `tsconfig.json` includes only `src/renderer` + `src/preload`, and there is no `src/shared` (same constraint as [[automation-job-effort]]). Main still validates on its own for every invoke.

**Why:** the channel is long-running (npm can take a minute) and must answer refusals as data — `invalid_package_name | npm_not_found | install_failed | manifest_missing` — because the Settings form has to say which step failed. It never throws across the boundary.

**How to apply:** any new capability that shells out to a package manager or other `.cmd` shim on Windows should reuse the `npmRunnerFor` / `npmEnv` (allowlisted env) / `execFile` + `shell: false` shape in `plugin-manager.ts`. Pure policy stays in `npm-install.ts` with dips injected via `NpmInstallDeps`; that is what lets the wave93C harness run the whole flow with a stubbed npm and never touch the real global tree.