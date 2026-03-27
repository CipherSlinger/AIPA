/**
 * patch-node-pty.js
 *
 * Patches node-pty's windowsPtyAgent.js to add the missing 7th argument
 * (useConptyDll) to the conpty startProcess() call. This is required because
 * our conpty.node binary (from VS Code) expects 7 arguments, but node-pty
 * 0.10.1's JS wrapper only passes 6.
 *
 * Run after npm install: node scripts/patch-node-pty.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'node-pty',
  'lib',
  'windowsPtyAgent.js'
);

if (!fs.existsSync(filePath)) {
  console.log('[patch-node-pty] node-pty not installed, skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf-8');

const oldCall =
  'this._ptyNative.startProcess(file, cols, rows, debug, this._generatePipeName(), conptyInheritCursor);';
const newCall =
  'this._ptyNative.startProcess(file, cols, rows, debug, this._generatePipeName(), conptyInheritCursor, false);';

if (content.includes(newCall)) {
  console.log('[patch-node-pty] Already patched, nothing to do.');
  process.exit(0);
}

if (!content.includes(oldCall)) {
  console.warn(
    '[patch-node-pty] Could not find the expected startProcess call. ' +
    'node-pty may have been updated. Manual review required.'
  );
  process.exit(1);
}

content = content.replace(oldCall, newCall);
fs.writeFileSync(filePath, content, 'utf-8');
console.log('[patch-node-pty] Successfully patched windowsPtyAgent.js (added useConptyDll=false).');
