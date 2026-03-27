# aipa-frontend Agent Memory

## Index
- [architecture.md](./architecture.md) — 组件树、IPC channel 列表、文件地图
- [build-notes.md](./build-notes.md) — 构建命令注意事项
- [tech-constraints.md](./tech-constraints.md) — 技术约束与已知债务

## Quick Reference

### 构建（重要）
`npm run build` 在此机器会 segfault，必须分步执行：
```
node_modules/.bin/tsc -p tsconfig.main.json
node_modules/.bin/tsc -p tsconfig.preload.json
node_modules/.bin/vite build
```

### 关键约束
- electron-store 必须保持 v8（CJS），v10+ 是 ESM-only 会破坏 main 进程
- node-pty 二进制来自 VS Code，不要重建
- Path alias `@/*` 映射到 `src/renderer/*`

### 高频修改文件
- `src/main/ipc/index.ts` — 几乎每个功能都需要改
- `src/preload/index.ts` — 每个新 IPC channel 都需要在这里注册
- `src/renderer/store/index.ts` — Zustand 4 个 store
- `src/renderer/hooks/useStreamJson.ts` — CLI 事件路由
