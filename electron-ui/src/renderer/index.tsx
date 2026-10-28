import React from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from './i18n'
import App from './App'

console.log('[AIPA] index.tsx module loaded — mounting React')

// Lazy panels are imported by content-hashed file name. When the renderer is
// rebuilt while the app is running (npm run build:renderer), the running page's
// in-memory import map still points at the previous hashes, so every panel the
// user opens fails with "Failed to fetch dynamically imported module" and the
// ErrorBoundary retries forever. Reloading re-reads index.html and picks up the
// new asset map. Guarded so a genuinely broken build cannot reload-loop.
const PRELOAD_RELOAD_KEY = 'aipa:preload-error-reload-at'
const PRELOAD_RELOAD_COOLDOWN_MS = 15000

window.addEventListener('vite:preloadError', () => {
  let lastReload = 0
  try {
    lastReload = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) || 0)
  } catch { /* sessionStorage unavailable — cooldown unknown */ }
  if (Date.now() - lastReload < PRELOAD_RELOAD_COOLDOWN_MS) return
  try { sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now())) } catch { }
  console.warn('[AIPA] Lazy chunk failed to load (app files changed on disk) — reloading to pick up the new build')
  window.location.reload()
})

try {
  const root = createRoot(document.getElementById('root')!)
  root.render(
    <I18nProvider>
      <App />
    </I18nProvider>
  )
} catch (err: unknown) {
  // React failed to mount -- show a minimal recovery page (no React dependency)
  const rootEl = document.getElementById('root')!
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack || '' : ''
  rootEl.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#1e1e1e;color:#cccccc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px;">
      <div style="font-size:20px;font-weight:600;color:#ff6b6b;margin-bottom:16px;">AIPA failed to start</div>
      <pre style="max-width:600px;max-height:200px;overflow:auto;background:#2a2a2a;padding:12px;border-radius:8px;font-size:12px;color:#e0e0e0;white-space:pre-wrap;word-break:break-word;margin-bottom:20px;">${message}\n\n${stack}</pre>
      <div style="display:flex;gap:8px;">
        <button onclick="location.reload()" style="padding:8px 24px;border:1px solid #555;border-radius:6px;background:#333;color:#fff;cursor:pointer;font-size:13px;">Reload App</button>
        <button onclick="window.electronAPI&&window.electronAPI.prefsResetAll?window.electronAPI.prefsResetAll().then(()=>location.reload()):location.reload()" style="padding:8px 24px;border:1px solid #555;border-radius:6px;background:#333;color:#fff;cursor:pointer;font-size:13px;">Reset Preferences</button>
      </div>
    </div>
  `
  // Hide splash if it's still showing
  const splash = document.getElementById('aipa-splash')
  if (splash) splash.style.display = 'none'
  if ((window as any).__aipaSplashTimer) clearTimeout((window as any).__aipaSplashTimer)
}
