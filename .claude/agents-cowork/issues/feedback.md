1. 点击对话框后无法正常显示，而是提示：Something went wrong in chat panel
Minified React error #185; visit https://reactjs.org/docs/error-decoder.html?invariant=185 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
Dismiss
Reload App
Copy Error

2. 点击左侧栏终端后，终端打开但无内容，无法使用，后台显示：Error occurred in handler for 'pty:create': Error: File not found: 
    at new WindowsPtyAgent (C:\Users\osr\Desktop\AIPA\electron-ui\node_modules\node-pty\lib\windowsPtyAgent.js:41:33)
    at new WindowsTerminal (C:\Users\osr\Desktop\AIPA\electron-ui\node_modules\node-pty\lib\windowsTerminal.js:51:24)
    at Object.spawn (C:\Users\osr\Desktop\AIPA\electron-ui\node_modules\node-pty\lib\index.js:30:12)
    at PtyManager.create (C:\Users\osr\Desktop\AIPA\electron-ui\dist\main\pty\pty-manager.js:75:32)
    at C:\Users\osr\Desktop\AIPA\electron-ui\dist\main\ipc\index.js:36:52
    at Session.<anonymous> (node:electron/js2c/browser_init:2:113107)
    at Session.emit (node:events:519:28)

3. 颜色系统只是用light和dark

4. 语言系统支持多语言，默认跟随系统 