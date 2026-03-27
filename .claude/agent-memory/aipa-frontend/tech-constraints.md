# 技术约束与已知债务

## 硬性约束（不可改变）
- **electron-store 必须保持 v8（CJS）**：v10+ 是 ESM-only，会破坏 main 进程
- **node-pty 二进制来自 VS Code**：不要从源码重建，除非明确要求
- **`useConpty: true` 硬编码**：跨平台时应改为 `process.platform === 'win32'`

## 已知技术债务（截至 2026-03-25）
- `config-manager.ts:32` 硬编码加密 key `'claude-code-ui-secret-2024'`（非真实安全）
- `store/index.ts:53` `appendTextDelta` O(n²) 字符串拼接
- `stream-bridge.ts:61` 将完整 `process.env` 泄漏给子进程
- `ipc/index.ts` 所有 handler 缺乏输入验证（路径遍历风险）
- `main/index.ts` 缺少 CSP headers
- `main/index.ts:27` `sandbox: false`（安全隐患）
- `getCliPath()` 在 3 个文件中重复（pty-manager、stream-bridge、ipc/index.ts）
- 零自动化测试
- 200+ 内联 `style={{}}`，无共享 UI 组件库

## 重要文件行数参考（可能已变化，使用前验证）
- `src/main/ipc/index.ts` — ~241 行
- `src/main/pty/stream-bridge.ts` — ~298 行
- `src/main/config/config-manager.ts` — ~62 行
- `src/renderer/store/index.ts` — ~249 行
- `src/renderer/hooks/useStreamJson.ts` — ~261 行
- `src/renderer/types/app.types.ts` — ~85 行
- `src/preload/index.ts` — ~99 行

## 延期工作（尚未完成）
- appendTextDelta O(n²) 修复（改为数组累积）
- react-virtuoso 消息列表虚拟化
- 文件拖拽到 ChatPanel
- SessionList 搜索 UI
- 会话导出按钮
- TypeScript strict mode
- Vitest 测试 + CI pipeline
- 命令面板组件
