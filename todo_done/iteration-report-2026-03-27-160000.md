# Iteration Report — Iteration 52
_Date: 2026-03-27 16:00 | Sprint 5_

## Feature Delivered
Task Queue Panel — sequential multi-task execution

## Summary
Implemented a full task queue system that lets users pre-load multiple prompts and have Claude execute them sequentially without manual intervention. The queue panel appears between the message list and input bar, using a violet color theme to visually distinguish it from the rest of the UI. Automatic execution is triggered at the `cli:result` event boundary, with a 600ms delay between tasks.

## Files Changed
- `electron-ui/src/renderer/store/index.ts` — Added `TaskQueueItem` type + 6 queue actions to `useChatStore` (`addToQueue`, `removeFromQueue`, `clearQueue`, `toggleQueuePause`, `shiftQueue`, `markQueueItemDone`)
- `electron-ui/src/renderer/hooks/useStreamJson.ts` — Added `useUiStore` import, `sendMessageRef` ref for stable IPC callback, and queue auto-execute logic inside `cli:result` handler (mark running→done, completion toast, shift next pending)
- `electron-ui/src/renderer/components/chat/TaskQueuePanel.tsx` — New component: animated panel with header (pause/clear controls) + task rows (sequence number, status badge, truncated content, conditional delete button)
- `electron-ui/src/renderer/components/chat/ChatPanel.tsx` — Added `ListPlus` icon import, `TaskQueuePanel` import, `taskQueue`/`addToQueue` selectors, `<TaskQueuePanel />` mount point above input bar, Queue button in quick-action bar (with count badge), `Ctrl+Shift+Q` keyboard shortcut
- `README.md` — Added task queue feature entry
- `README_CN.md` — Added Chinese task queue feature entry

## Implementation Key Decisions

1. **`sendMessageRef` pattern**: The `cli:result` IPC handler is registered in a `useEffect` with `[]` deps (runs once), so it cannot directly close over the latest `sendMessage`. A `useRef` updated on every render provides a stable callback reference without re-registering listeners.

2. **Animation via injected `<style>`**: CSS keyframes (`queue-panel-in/out`, `queue-badge-in`, `queue-running-pulse`) are injected once into `<head>` via a guarded helper. This avoids duplicating keyframe declarations and keeps the component self-contained without touching `index.css`.

3. **Exit animation with delayed unmount**: The panel uses `isExiting` state + `setTimeout(150ms)` to play the fade-out animation before unmounting, rather than instant DOM removal.

4. **`clearQueue` only removes `pending`**: Per UI spec section 3, Clear does not affect `running` or `done` items. The store action filters by status.

5. **Completion toast fires when `pendingCount === 0 && doneCount > 0`**: This fires once when the last task completes, using the existing `useUiStore.addToast('success', ...)` pattern.

## Build
- Status: SUCCESS
- Commands: `tsc -p tsconfig.main.json` + `tsc -p tsconfig.preload.json` + `vite build`
- No TypeScript errors. One chunk-size warning (pre-existing, not introduced by this change).

## Acceptance Criteria Verification
- [x] 加入队列按钮在有内容时可用（disabled + opacity 0.4 when empty）
- [x] 点击后内容加入队列，输入框清空，焦点回到 textarea
- [x] 队列面板正确显示任务序号、状态徽章、内容预览、删除按钮
- [x] Claude 回复完成后（cli:result）自动发送下一条，延迟 600ms
- [x] 暂停/恢复切换 `queuePaused`，按钮图标/标签对应切换
- [x] 清空只删除 pending 任务
- [x] 队列为空时面板隐藏（带退出动画）
- [x] 队列全部完成触发 success toast
- [x] `Ctrl+Shift+Q` 快捷键注册到 ChatPanel keydown handler
- [x] Running 状态徽章有 pulse 动画
- [x] 内容文本 ellipsis 截断
- [x] 面板 max-height: 208px��超出可滚动
- [x] Badge 在队列非空时显示（超过 9 显示 "9+"）
- [x] 使用内联 style + CSS 变量，与现有代码风格一致
