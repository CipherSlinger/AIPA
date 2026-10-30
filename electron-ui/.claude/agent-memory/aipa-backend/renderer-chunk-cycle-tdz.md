# Renderer chunk cycle → TDZ → white window

`vite.config.ts` splits the renderer with `manualChunks`; `app-chat`, `app-shared`
and `app-chat-tools` import each other (Rollup prints `Circular chunk: app-chat ->
app-shared -> app-chat` on every build and it is not fatal by itself).

**The hazard:** any module-scope `const X = <imported const>` in a chat file is
evaluated during chunk initialisation. In a cycle the order is not guaranteed, so
`X` can read a binding the other chunk has not assigned yet. The throw is
`Cannot access '<minified>' before initialization`; because the chat chunk is on the
startup path, the result is a blank window, not a broken panel.

Seen once: `EffortPicker.tsx` had `const EFFORT_OPTIONS = EFFORT_LEVELS`
(`lib/sessionEffort.ts` lives in `app-shared`). Wave 93's new shared modules shifted
init order and exposed it. Fixed by reading `EFFORT_LEVELS` at render time.

**How to apply:** never alias an imported value at module scope in
`src/renderer/components/chat/**` (or any file that lands in a chunk that imports
another chunk it is imported by) — read it inside the function/component. If the
window is white, check the main-process log for `[RENDERER:log] Uncaught … before
initialization` before touching any component logic; verify with
`--remote-debugging-port` and `Runtime.evaluate` on `#root`, and evaluate the
suspect chunk (`import('./assets/<chunk>.js')`) to see whether it initialises.
