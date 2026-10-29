# API Spec: Department handbook for scheduled runs (wave 75A)
_Date: 2026-10-29_

## 新增 IPC Channels

### `automation:handbookSnapshotSync`
**方向**：renderer → main（invoke）
**参数**：`entries: Array<{ id: string; name: string; handbook: string }>`
**返回**：`{ ok: boolean; error?: 'entries_invalid' | 'write_failed' | 'unexpected_error' }`
**说明**：渲染进程把部门树里每个节点的 id、显示名、部门手册文本同步给主进程；主进程校验（合法 id、截断文本）后写入 `userData/department-handbooks.json`，`updatedAt` 用主进程时钟。非数组直接拒绝；空数组是"没有部门"并会落盘。这是主进程读取该快照的唯一来源，主进程从不修改它。

Preload 暴露：`window.electronAPI.automationHandbookSnapshotSync(entries)`。
渲染侧调用方：`src/renderer/components/departments/deptHandbookSync.ts`（App.tsx 在 `departments` 或界面语言变化时防抖调用）。

## 运行记录新增字段（不改 IPC 通道）

`AutomationRunRecord` / `AutomationRunRecordData` 新增 `handbook?: AutomationHandbookDigestData`：

```ts
interface AutomationHandbookDigestData {
  state: 'used' | 'no-department' | 'no-snapshot' | 'unknown-department' | 'empty'
  departmentId?: string
  departmentName?: string
  chars: number
  sourceChars: number
  truncated: boolean
  stale: boolean
  ageDays?: number
}
```

- `used`：手册已放进提示信封；`chars` 是截断后的字数，`sourceChars` 是原文长度。
- `no-department`：任务未归属部门。
- `no-snapshot`：主进程还没有可用的快照。
- `unknown-department`：快照里没有该任务所属部门（`departmentId` 是任务写的 id）。
- `empty`：部门存在但手册为空（`departmentName` 有值）。
- `stale`：快照早于 7 天，但仍然使用；`ageDays` 是整天天数。
- 跳过（skipped）的记录没有该字段；旧记录也没有，UI 应保持沉默。

聊天路径（`useStreamJson.ts` / `promptAssembly.ts`）未改动。
