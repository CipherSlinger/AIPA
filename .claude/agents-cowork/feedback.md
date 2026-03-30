1. 打开终端可以正常显示，但为什么后台还是会显示提示信息：PS C:\Users\osr\Desktop\AIPA\electron-ui> node_modules/.bin/electron dist/main/index.js

innerError Error: Cannot find module '../build/Debug/pty.node'
Require stack:
- C:\Users\osr\Desktop\AIPA\electron-ui\node_modules\node-pty\lib\windowsPtyAgent.js
- C:\Users\osr\Desktop\AIPA\electron-ui\node_modules\node-pty\lib\windowsTerminal.js
- C:\Users\osr\Desktop\AIPA\electron-ui\node_modules\node-pty\lib\index.js
- C:\Users\osr\Desktop\AIPA\electron-ui\dist\main\pty\pty-manager.js
- C:\Users\osr\Desktop\AIPA\electron-ui\dist\main\ipc\index.js
- C:\Users\osr\Desktop\AIPA\electron-ui\dist\main\index.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1390:15)
    at s._resolveFilename (node:electron/js2c/browser_init:2:136269)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1032:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1037:22)
    at Module._load (node:internal/modules/cjs/loader:1199:37)
    at c._load (node:electron/js2c/node_init:2:18041)
    at TracingChannel.traceSync (node:diagnostics_channel:328:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:244:24)
    at Module.require (node:internal/modules/cjs/loader:1470:12)
    at require (node:internal/modules/helpers:147:16) {
  code: 'MODULE_NOT_FOUND',
  requireStack: [
    'C:\\Users\\osr\\Desktop\\AIPA\\electron-ui\\node_modules\\node-pty\\lib\\windowsPtyAgent.js',
    'C:\\Users\\osr\\Desktop\\AIPA\\electron-ui\\node_modules\\node-pty\\lib\\windowsTerminal.js',
    'C:\\Users\\osr\\Desktop\\AIPA\\electron-ui\\node_modules\\node-pty\\lib\\index.js',
    'C:\\Users\\osr\\Desktop\\AIPA\\electron-ui\\dist\\main\\pty\\pty-manager.js',
    'C:\\Users\\osr\\Desktop\\AIPA\\electron-ui\\dist\\main\\ipc\\index.js',
    'C:\\Users\\osr\\Desktop\\AIPA\\electron-ui\\dist\\main\\index.js'
  ]
  另外终端无法打开claude，且反应非常慢

2. 集成openclaw连接feishu和wechat的功能到左方新tag，命名为通道（channel）
3. 左侧方栏“定时提醒”作为特殊的“工作流”合并到“工作流”里面
4. README.md 太丑了，都是功能的堆叠列表，好好美化一下