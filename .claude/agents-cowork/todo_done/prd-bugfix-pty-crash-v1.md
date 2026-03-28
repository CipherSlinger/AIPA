# PRD: Fix PTY Terminal Crash (node-pty startProcess API mismatch)

**Author**: agent-leader
**Date**: 2026-03-27
**Priority**: P0 (Critical Bug)
**Status**: Ready for Development

---

## Problem Statement

Clicking the terminal icon in the sidebar or status bar opens a terminal panel, but the terminal is non-functional (blank, no output). The console shows:

```
Error occurred in handler for 'pty:create': Error: Usage: pty.startProcess(file, cols, rows, debug, pipeName, inheritCursor, useConptyDll)
    at new WindowsPtyAgent (node_modules/node-pty/lib/windowsPtyAgent.js:75:36)
```

## Root Cause

The conpty.node native binary was copied from VS Code and has a **newer API signature** than what node-pty 0.10.1's JavaScript wrapper expects:

- **JS wrapper** (windowsPtyAgent.js line 75): calls `startProcess(file, cols, rows, debug, pipeName, conptyInheritCursor)` -- **6 arguments**
- **Native binary** (conpty.node): expects `startProcess(file, cols, rows, debug, pipeName, inheritCursor, useConptyDll)` -- **7 arguments**

The native binary throws because it doesn't receive the `useConptyDll` 7th argument.

## Fix Options

### Option A: Patch windowsPtyAgent.js (Recommended)
Add the missing 7th argument `useConptyDll` (should be `false`) to the `startProcess` call at line 75 of `node_modules/node-pty/lib/windowsPtyAgent.js`. Since this is a vendored copy of node-pty, patching is acceptable.

### Option B: postinstall script
Create a postinstall script that patches the file after `npm install`.

### Recommended Approach
Use Option A: directly patch `node_modules/node-pty/lib/windowsPtyAgent.js` line 75 to pass `false` as the 7th argument. Also create a `scripts/patch-node-pty.js` file that can re-apply the patch after `npm install`.

## Fix Requirement

In `node_modules/node-pty/lib/windowsPtyAgent.js`, change line 75 from:
```javascript
term = this._ptyNative.startProcess(file, cols, rows, debug, this._generatePipeName(), conptyInheritCursor);
```
to:
```javascript
term = this._ptyNative.startProcess(file, cols, rows, debug, this._generatePipeName(), conptyInheritCursor, false);
```

Also add a `scripts/patch-node-pty.js` postinstall helper so the patch survives `npm install`.

## Acceptance Criteria

- [ ] Terminal panel opens and shows a working shell after clicking the terminal icon
- [ ] No error in console about `pty:create`
- [ ] PTY sessions can be created, receive data, and be destroyed
- [ ] Build passes with zero errors
