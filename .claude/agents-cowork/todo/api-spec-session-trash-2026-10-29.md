# API Spec: 删除对话进入“最近删除”（可恢复 30 天）
_Date: 2026-10-29 | wave 69A | Backend_

删除对话不再当场删掉 JSONL（Claude）或 JSONL/线程目录（Codex），而是把属于该会话的**所有**文件一起移入
`<userData>/trash/sessions/`，在 `<userData>/trash/sessions.json` 记一条，30 天内可在
`src/renderer/components/workflows/TrashSection.tsx` 的“最近删除”里恢复。工作流/技能原有的行为不变。

## 变更的 IPC Channel

### `session:delete`（行为与返回值都变了）
**方向**：renderer → main（invoke）
**参数**：`{ sessionId: string, title?: string }`（仍接受裸字符串 `sessionId` 以兼容旧调用）
**返回**：`{ success: true, entry }` 或 `{ success: false, error: string, code }`
**说明**：先找 Claude 与 Codex 两边的所有文件，全部移动成功才记账；任一移动失败会把已移动的移回并返回失败。
`title` 只是显示文本（删除时从侧边栏行传入），没有时 UI 回退显示 sessionId，不会凭空生成标题。
**失败码**：`not_found`（两边都没找到，替代原来的 `false`）、`invalid_session`、`outside_sessions`、
`move_failed`、`write_failed`。
**不抛异常**：拒绝也 resolve。

## 新增 IPC Channels

### `session:trash:list`
**方向**：renderer → main（invoke）
**参数**：无
**返回**：`{ ok: true, entries: TrashedSessionInfoData[], retentionDays: number }` 或 `{ ok: false, code, error }`
**说明**：按 `deletedAt` 倒序。每条含 `available`（所有 payload 仍在 trash 内且存在）与 `purgeAt`
（`deletedAt + 30 天`）。

### `session:trash:restore`
**方向**：renderer → main（invoke）
**参数**：`id: string`
**返回**：`{ ok: true, entry }` 或 `{ ok: false, code, error }`
**说明**：先校验所有原始路径都空着再动任何文件；任一被占用返回 `target_exists`，两边都不动。恢复后清掉
reader 的摘要缓存，`session:list` 无需重启即可看到该对话。
**失败码**：`not_found`、`outside_sessions`、`outside_trash`、`folder_missing`、`target_exists`、`move_failed`。

### `session:trash:purge`
**方向**：renderer → main（invoke）
**参数**：无
**返回**：`{ ok: true, removed: number, failed: number }` 或 `{ ok: false, code, error }`
**说明**：只删 trash 目录内、且已过 30 天的条目；恰好到界的保留。单条失败计入 `failed` 并留待下次，不中断其余。
App 启动时与打开“最近删除”面板时都会调用（best effort）。

### `session:trash:remove`
**方向**：renderer → main（invoke）
**参数**：`id: string`
**返回**：`{ ok: true, entry }` 或 `{ ok: false, code, error }`
**说明**：永久删除一条（payload + 清单行）。清单里指向 trash 之外的路径一律拒绝（`outside_trash`），整条不删一半。

## 类型（`src/preload/index.ts`，已导出）

```ts
interface TrashedSessionItemData { originalPath: string; trashedPath: string }
interface TrashedSessionEntryData {
  id: string
  sessionId: string
  title?: string                 // 可能不存在，UI 回退到 sessionId
  engine: 'claude' | 'codex' | 'both'
  items: TrashedSessionItemData[]
  deletedAt: number
}
interface TrashedSessionInfoData extends TrashedSessionEntryData {
  available: boolean
  purgeAt: number
}
type SessionTrashErrorCode =
  | 'not_found' | 'invalid_session' | 'outside_sessions' | 'outside_trash'
  | 'folder_missing' | 'target_exists' | 'move_failed' | 'write_failed' | 'delete_failed'
```

桥接方法：`sessionsTrashList()`、`sessionsTrashRestore(id)`、`sessionsTrashPurge()`、`sessionsTrashRemove(id)`；
`sessionDelete(id, title?)` 的返回类型改为 `SessionDeleteResultData`。

## 前端对接注意事项

- `sessionDelete` 现在返回对象而不是 boolean：**只有 `success: true` 才从侧边栏列表移除该行**，否则行还在磁盘上。
- 恢复成功后请通过 `listSessionsShared()` + `useSessionStore.getState().setSessions(...)` 刷新侧边栏
  （TrashSection 已这样做）。
- 新增文案在 `.scratch/i18n-fragments/wave69a-session-trash.json`（`sessionTrash.*` 命名空间），键集英中一致。
- `TrashSection` 的 `buildTrashRows(skills, workflows, sessions?)` 第三个参数可省略，旧调用不受影响；
  `TrashKind` 增加了 `'session'`。
