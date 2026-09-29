/**
 * patch-node-pty.js
 *
 * Patches node-pty's windowsPtyAgent.js to add the missing 7th argument
 * (useConptyDll) to the conpty startProcess() call. This was required for
 * node-pty 0.10.1 when using conpty.node binaries expecting 7 arguments.
 * Modern node-pty (1.0+) natively passes this argument.
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

// node-pty 1.0+ natively passes this._useConptyDll as the 7th argument
if (content.includes('this._useConptyDll') || content.includes(newCall)) {
  console.log('[patch-node-pty] Already patched or natively supported, nothing to do.');
  process.exit(0);
}

if (!content.includes(oldCall)) {
  console.log('[patch-node-pty] Legacy startProcess call not found, node-pty API is up to date.');
  process.exit(0);
}

content = content.replace(oldCall, newCall);
fs.writeFileSync(filePath, content, 'utf-8');
console.log('[patch-node-pty] Successfully patched windowsPtyAgent.js (added useConptyDll=false).');
