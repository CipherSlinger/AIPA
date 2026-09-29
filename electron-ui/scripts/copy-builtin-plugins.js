// Copy bundled nav plugins (plain HTML/CSS/JS, not compiled by tsc) into dist
// so default-plugins.ts can install them into ~/.aipa/plugins on startup.
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'src', 'main', 'plugins', 'builtin')
const dst = path.join(__dirname, '..', 'dist', 'main', 'plugins', 'builtin')

fs.rmSync(dst, { recursive: true, force: true })
fs.cpSync(src, dst, { recursive: true })
console.log('copied builtin plugins to dist/main/plugins/builtin')
