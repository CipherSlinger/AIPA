# PRD：头像选择器弹层遮挡修复
_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-03_

## 一句话定义
修复 AvatarPicker 弹层被侧边栏会话列表遮挡的 bug，确保用户可以正常选择头像。

## 背景与动机
用户反馈（P1 级别，2026-04-04）：头像选择器（AvatarPicker）在侧边栏底部弹出时，弹层被相邻的 Sidebar 会话列表区域遮盖，无法正常操作。

**根因分析**：
- AvatarPicker 以 `position: absolute` 渲染，`zIndex: 200`，挂载在 NavRail 内的 avatar 容器 `<div style={{ position: 'relative' }}>` 下
- NavRail 的父容器（AppShell 布局）和 Sidebar 容器 `<div style={{ overflow: 'hidden' }}>` 各自形成独立的层叠上下文
- z-index 只在同一层叠上下文内有效，NavRail 内部的 z-index: 200 无法穿透到 Sidebar 的层叠上下文之上
- Sidebar 容器的 `overflow: hidden` 可能裁切掉弹层的溢出部分

## 目标用户
所有 AIPA 用户 — 头像选择是基础个性化功能，影响全量用户。

## 用户故事
作为 AIPA 用户，
我希望点击侧边栏底部的头像后能正常看到并操作头像选择面板，
以便快速切换我喜欢的头像。

## 功能范围

### In Scope（本版本包含）
1. **AvatarPicker 弹层脱离 NavRail DOM 树**：使用 React Portal 将 AvatarPicker 渲染到 `document.body`，不再受 NavRail 父容器的 overflow 和层叠上下文限制
2. **弹层定位计算**：基于 avatar 按钮的 `getBoundingClientRect()` 动态计算弹层位置（弹层出现在 avatar 按钮上方），确保不超出视口
3. **z-index 统一**：Portal 渲染后使用 `zIndex: 10000`（与应用内其他 Portal 弹层保持一致层级）
4. **视觉一致性保持**：修复后弹层的外观、动画、点击外部关闭、Escape 关闭行为不变

### Out of Scope（本版本不包含）
- 头像预设扩展（新增头像选项）：与本 bug 无关
- NavRail 整体 z-index 层叠重构：范围过大，本次仅解决 AvatarPicker 单点问题
- 其他弹出组件的同类问题排查：可作为后续技术债务清理

## 功能详述

### Portal 渲染方案
**描述**：将 AvatarPicker 的渲染方式从 NavRail 内部的 `position: absolute` 改为通过 `ReactDOM.createPortal()` 渲染到 `document.body`。

**交互逻辑**：
1. 用户点击 NavRail 底部的 avatar 按钮 → `showAvatarPicker` 状态切换为 true
2. AvatarPicker 通过 Portal 渲染到 body 层
3. 弹层位置通过 avatar 按钮的 `getBoundingClientRect()` 计算：
   - `left` = 按钮左边缘 x 坐标
   - `bottom` = `window.innerHeight - 按钮顶部 y 坐标 + 6px 间距`
4. 点击外部或按 Escape 关闭弹层（现有逻辑不变，已使用 `document.addEventListener`，Portal 模式下自然兼容）

**边界条件**：
- 窗口尺寸变化时：弹层应保持在 avatar 按钮上方。可在 Portal 内监听 resize 事件或关闭弹层
- NavRail 折叠/展开状态切换时：弹层位置需适配 NavRail 宽度变化
- 弹层超出视口上边缘时：降级显示在按钮下方（当前 NavRail 高度足够，此场景概率极低）

**验收标准**：
- [ ] 侧边栏打开状态下，点击 NavRail 底部头像按钮，AvatarPicker 弹层完整显示，不被 Sidebar 遮挡
- [ ] 侧边栏关闭状态下，AvatarPicker 弹层同样完整显示
- [ ] NavRail 展开模式和收缩模式下弹层都能正确定位
- [ ] 点击弹层外部区域，弹层关闭
- [ ] 按 Escape 键，弹层关闭
- [ ] 选择头像后弹层关闭，头像正确切换
- [ ] 弹层打开和关闭的动画效果与修复前一致

## 非功能需求
- **性能**：Portal 渲染不引入额外的 re-render，AvatarPicker 仍使用 `React.lazy` 懒加载
- **可访问性**：弹层的 focus 管理不变，keyboard navigation 正常
- **兼容性**：Windows 10/11，Electron 39+

## 成功指标
- 用户不再报告头像选择器被遮挡的问题
- AvatarPicker 在所有侧边栏状态下均可正常操作

## 优先级
- **P0**：Portal 渲染 + 位置计算 — 这是 bug 修复的核心
- **P1**：窗口 resize 时重新定位或关闭弹层

## 技术备注

**涉及文件清单**：
| 文件 | 变更类型 | 风险等级 |
|------|----------|----------|
| `src/renderer/components/layout/AvatarPicker.tsx` | 重构渲染方式，改用 Portal | 中 |
| `src/renderer/components/layout/NavRail.tsx` | 传入 anchor ref 供定位计算 | 低 |

**不涉及 i18n 变更**（纯 bug 修复，无新增用户可见文本）。

**不涉及 IPC / 后端变更**。

## 依赖与风险
| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| ReactDOM.createPortal API | 前端 | 低（React 标准 API） |
| NavRail 布局结构 | 前端 | 低（仅新增 ref 传递） |

## 开放问题
- [ ] 是否需要统一项目内所有弹层组件的 Portal 策略（StatusBarModelPicker、StatusBarPersonaPicker 等），还是仅修复 AvatarPicker？建议：本次仅修 AvatarPicker，后续视需要逐步迁移。

## 执行顺序建议
- P0 bugfix，应最优先执行
- 预估改动量小（约 30-50 行），属于快速收益项
