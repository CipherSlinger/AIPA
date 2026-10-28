---
name: plugin-harness-notes
description: 用截图 harness 验证 builtin 插件时的两个坑——已安装副本的版本门控，以及插件暗色主题对应的 pref 值
metadata:
  type: project
---

# Builtin 插件 + 截图 harness 的两个坑

1. **已安装副本不会跟随源码更新。** `default-plugins.ts` 只有在打包的
   `plugin.json` 版本**更高**时才覆盖 `~/.aipa/plugins/<dir>`。所以改完插件源码、
   跑 `npm run build` 之后，harness 仍然读取旧副本。对策：bump `version`，
   或在每次 harness 前 `rm -rf ~/.aipa/plugins/<dir>`（下次启动会自动重装最新包）。
2. **插件暗色主题的 pref 值是 `theme: 'vscode'`**（或 `'system'` + 系统暗色），
   不是 `'dark'`。写 `'dark'` 时 `PluginHostView` 会按浅色处理，插件收到
   `aipa:theme: light`，看起来像暗色没生效。

**Why:** 这两点都不在插件代码里，第一次做视觉验证时分别造成了"改了没生效"和"暗色无效"的假象。
**How to apply:** 任何改动 `electron-ui/src/main/plugins/builtin/**` 并用 scratch harness 截图时先检查这两项。
