import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
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
