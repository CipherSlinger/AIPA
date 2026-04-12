import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'
import fs from 'fs'

function getGitCommit() {
  try { return execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '..') }).toString().trim() } catch { return 'unknown' }
}

function getCLIVersion() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '../package/package.json'), 'utf-8')
    return JSON.parse(raw).version ?? 'unknown'
  } catch { return 'unknown' }
}

export default defineConfig({
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __COMMIT_HASH__: JSON.stringify(getGitCommit()),
    __CLI_VERSION__: JSON.stringify(getCLIVersion()),
  },
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-icons': ['lucide-react'],
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'rehype-highlight', 'highlight.js'],
          'vendor-terminal': ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-search', '@xterm/addon-web-links'],
          'vendor-utils': ['zustand', 'date-fns', '@tanstack/react-virtual'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})
