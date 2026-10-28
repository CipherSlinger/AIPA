/**
 * Copy the locale JSON the main process reads at runtime into the main bundle.
 *
 * `src/main/automation/workflow-plan.ts` resolves a preset workflow's prompts
 * from the renderer's own locale files, so a scheduled run speaks the same
 * language as the editor. Those files are bundled into the renderer by Vite and
 * are not on disk in a packaged app, so the two the main process needs are
 * copied next to `dist/main`.
 *
 * Source of truth stays `src/renderer/i18n/locales/*.json` — nothing is
 * duplicated in the repository, and a translation edit reaches scheduled runs
 * on the next build.
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const sourceDir = path.join(root, 'src', 'renderer', 'i18n', 'locales')
const outDir = path.join(root, 'dist', 'main', 'locales')
const locales = ['en.json', 'zh-CN.json']

fs.mkdirSync(outDir, { recursive: true })
for (const name of locales) {
  const from = path.join(sourceDir, name)
  if (!fs.existsSync(from)) {
    console.warn(`[copy-main-locales] missing ${from} — skipping`)
    continue
  }
  fs.copyFileSync(from, path.join(outDir, name))
}
console.log(`[copy-main-locales] copied ${locales.length} locale file(s) to dist/main/locales`)
