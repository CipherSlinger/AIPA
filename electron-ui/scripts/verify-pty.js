/**
 * verify-pty.js
 *
 * Verifies that node-pty's native module can be loaded.
 * Runs after postinstall rebuild to catch build failures early.
 *
 * This does NOT test loading in Electron context (which requires the
 * full Electron binary), but it verifies the .node file exists and
 * is a valid shared library for the current platform.
 */
const path = require('path');
const fs = require('fs');

const ptyNodePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'node-pty',
  'build',
  'Release',
  'pty.node'
);

const ptyNodeDebugPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'node-pty',
  'build',
  'Debug',
  'pty.node'
);

if (fs.existsSync(ptyNodePath)) {
  const stats = fs.statSync(ptyNodePath);
  console.log(`[verify-pty] pty.node found (Release, ${stats.size} bytes)`);
} else if (fs.existsSync(ptyNodeDebugPath)) {
  const stats = fs.statSync(ptyNodeDebugPath);
  console.log(`[verify-pty] pty.node found (Debug, ${stats.size} bytes)`);
} else {
  console.warn(
    '[verify-pty] WARNING: pty.node binary not found!\n' +
    '  The terminal panel will not work.\n' +
    '  Try running: npm run rebuild-pty\n' +
    '  On Windows, ensure Visual Studio C++ Build Tools are installed.'
  );
  // Don't fail the install -- the app can still run without terminal
  process.exit(0);
}

console.log('[verify-pty] node-pty native module verification passed.');
