# 用户反馈

## [BUG] Windows 下点开终端报错：node-pty 原生模块缺失

**现象**：在 Windows 上运行 `node_modules/.bin/electron dist/main/index.js` 后，点击打开终端面板时报错：
```
Error: Cannot find module '../build/Debug/pty.node'
Require stack:
- node_modules\node-pty\lib\windowsPtyAgent.js
- node_modules\node-pty\lib\windowsTerminal.js
- node_modules\node-pty\lib\index.js
- dist\main\pty\pty-manager.js
```

**原因**：node-pty 的 Windows 原生二进制（`pty.node`）未为当前 Electron 版本重新编译，`build/Debug/pty.node` 文件缺失。

**修复方向**：
- 在 Windows 构建流程中执行 `npm run rebuild-pty`（`electron-rebuild -f -w node-pty`）
- 或在打包时将已编译的 pty.node 正确复制到 build 目录
- 参考 CLAUDE.md：node-pty binaries 需从 VS Code 捆绑的 node-pty 复制，或针对 Electron v39+ 重新编译

---

## [UI] "投入度" 中文翻译修改为 "思考深度"

**位置**：StatusBar 的 Effort Level 选择器，以及 Settings > Behavior 中的对应开关。

**修改**：将所有 `投入度` 改为 `思考深度`，英文 key 不变（`effort.*`）。

---

## [UI] AI角色 重命名为 "Agents"，且描述文字未跟随系统语言

**问题 1**：Workflows 侧边栏中的"AI角色"区块名称修改为"Agents"（中文界面显示"Agents"，英文界面同样显示"Agents"，不翻译）。

**问题 2**：AI角色（Personas）和工作流（Workflows）的描述文字（description 字段内容）未跟随系统语言切换，始终显示为固定语言，需接入 i18n 或在切换语言时重新渲染。

---

_反馈时间：2026-04-02_
