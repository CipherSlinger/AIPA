# 微信 AI 回复助手 — 可行性评估与设计

_日期：2026-10-27 | 状态：原型验证完成，未接入 UI_

## 1. 结论先行

| 路径 | 可行性 | 结论 |
|---|---|---|
| **路径 1：屏幕截图 + OCR** | **可行，但只是「勉强可用」** | 唯一推荐方向。能拿到文字，但准确率会掉，且必须解决两条硬约束（下面 §3.3、§3.4） |
| 路径 2：解密本地数据库 | 技术上可行，**产品上不可接受** | **不推荐**。违反微信服务条款、升级即失效、需要从运行进程抠 key |
| 路径 3：UI Automation | **实测失败** | 微信 4.1.15.13（Qt 5.15.14）未开 accessibility，`AutomationElement.FromHandle` 拿到 0 个 descendants |

**一句话判断**：这件事能做，但做出来的不是「读懂了聊天」的助手，而是「看着截图猜聊天」的助手。产品预期必须按后者校准，否则一定翻车。

---

## 2. 实测环境与已验证事实

环境：Windows 11 Pro 10.0.26300，微信 4.1.15.13，显示缩放 150%（DPI 144），Node 24 / Electron 39 / koffi 2.16.2。

以下事实**已在本机实测确认**，不是推断：

| 能力 | 结果 | 备注 |
|---|---|---|
| `GetForegroundWindow` + `GetWindowThreadProcessId` | ✅ | 微信主窗口 class = `Qt51514QWindowIcon`，进程 `Weixin.exe` |
| `GetLastInputInfo` | ✅ | 能拿到全局 idle 毫秒数 |
| `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` | ✅ | **仅在 Electron 主进程内能收到回调**；裸 `node` 收不到（见 §3.5） |
| UI Automation 读控件树 | ❌ | 0 个 descendants |
| `GetGUIThreadInfo` 取焦点控件 / caret | ✅ 经典 Win32（记事本）／❌ Qt 程序 | 微信拿不到输入框位置 |
| `SetWindowsHookEx(WH_KEYBOARD_LL)` | ⚠️ | 句柄装上，回调在 Node/koffi 里一次都没触发 |
| `PrintWindow(PW_RENDERFULLCONTENT)` 截微信主窗口 | ✅ | **窗口被其他应用遮挡时依然能拿到画面** |
| `BitBlt` 从窗口 DC 截图 | ✅ | 与 PrintWindow 结果一致；但遮挡时会拿到遮挡内容，不如 PrintWindow |
| `Windows.Media.Ocr` 中文识别 | ✅ | `zh-Hans-CN` 语言包已安装，687×588 窗口约 60–150ms |
| 读数据库文件头 | ✅ | `db_storage/**.db` 非 SQLite 明文头（非 `SQLite format 3`），确认加密 |

**原型代码**：`electron-ui/src/main/awareness/window-tracker.ts`、`wechat-detect.ts`（仅窗口与 idle 感知，不含截图/OCR/AI）。

---

## 3. 三条路径逐条分析

### 3.1 路径 1：屏幕截图 + OCR（推荐，唯一可行）

#### 3.1.1 截图怎么做

不要用 `desktopCapturer` 全屏截。要用 **按窗口截图**，这样即使用户把微信压在别的窗口后面，也能拿到正确画面。两种方式实测都可用：

| 方式 | 遮挡时表现 | 说明 |
|---|---|---|
| `PrintWindow(hwnd, dc, PW_RENDERFULLCONTENT=2)` | ✅ 拿到微信真实画面 | 推荐。只对目标窗口发消息，不依赖 Z 序 |
| `BitBlt` from `GetWindowDC(hwnd)` | ❌ 拿到遮挡物 | 更快（9–13ms vs PrintWindow 13ms，差别不大），不推荐 |

`PW_RENDERFULLCONTENT` 是 Windows 8.1+ 的 flag，对 Qt/DirectComposition 应用必须带。实测：微信主窗口在后台被 Windows Terminal 完全覆盖时，`PrintWindow` 仍然返回 98.1% ink 的完整画面，OCR 结果与前台时一致（18 行 / 242 字符，逐行坐标完全相同）。

实现位置：主进程用 koffi 调 `user32.PrintWindow` + `gdi32.BitBlt`，或更省事的方式——**交给 PowerShell 做**（见 §3.1.5）。

注意 DPI：目标是 150% 缩放，`GetWindowRect` 返回物理像素 1030×882，`GetDpiForWindow` 返回 144。原型已经在 `window-tracker.ts` 里调 `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)`，保证 rect 与截图像素一一对应。没有这步，rect 和截图会错位 1.5 倍。

#### 3.1.2 OCR 用什么

**用 Windows 自带的 `Windows.Media.Ocr`**，理由：

- 免费、离线、无网络请求，符合隐私边界要求；
- 本机已装 `zh-Hans-CN` 语言包（`[OcrEngine]::AvailableRecognizerLanguages` 同时有 `en-GB` 和 `zh-Hans-CN`）；
- 速度快：687×588 窗口 60–150ms；放大到 2×/3× 后 60–90ms（基本不变）；
- 返回的是**结构化的行 + 单词 + BoundingRect**，这正是「按位置区分左右气泡」需要的东西。

本地备选引擎（需要额外分发体积，仅在前者不可用时考虑）：
- PaddleOCR（中文准确率高，但 ~10MB 模型 + ONNX Runtime，打包成本和启动延迟都上去了）；
- Tesseract 5 + `chi_sim`（体积小，中文准确率明显低于 PaddleOCR 和 Windows OCR）。

**不引入任何付费云 OCR。**

#### 3.1.3 实测 OCR 质量（关键，别被「跑通了」骗了）

把微信主窗口截图后原样 OCR，1× / 2× / 3× 三档对比。实际文本节选（原文脱敏为长度标记，关键错误保留）：

1×（687×588）：
```
[7条] 城北区妇幼保健计一        ← 原文「计划…」，行尾被截断
美团：收益到账通知               ← 正确
感觉我们两吃饭，                 ← 原文「我们俩」，识别错字
是自己随便凑合                   ← 正确
16：29                          ← 时间正确
微信支付：你有优惠即将。。       ← 原文「…」，把省略号识别成句号
jsy: 1.全枧密模式的开．          ← 「全视密模式」→「全枧密」严重错字
```

2×（1374×1176）：
```
[7条] 城北区妇幼保健计．“
美团：收益到账通知
感觉我们两吃饭，
是自己随便凑合
jsy: 1.全机密模式的开．“
```

3×：
```
微信支付：你有优惠朗将·“        ← 「即将」→「朗将」，比 1× 还差
```

**结论：**

- **中文长文本准确率大约 85–92%**，短句、常见词（时间、金额、"美团""微信支付"）几乎不出错；
- **放大不保证变好**，2×/3× 反而引入新的错字（「即将」→「朗将」）。1× 或 2× 就够，不要盲目上采样；
- 主要噪声来源是 **UI 元素混进文字流**：头像、按钮、未读红点、时间戳、滚动条都会被当成同行文本（上面 `0`、`辰分`、`O`、`Send` 都是 OCR 对图标/头像的误读）；
- **CJK 字之间会被插入空格**（"感 觉 我 们"），下游必须先去掉再送给模型。

这个准确率意味着：**不能让模型直接基于 OCR 原文生成回复**。必须先做清洗 + 结构切分（§3.1.4），否则模型会对着乱码编。

#### 3.1.4 从截图切分出「对方 / 我 / 输入框草稿」

这是整个方案里**工程量大头**，而且**必须按会话逐个校准**，不是通用算法。三个可用信号：

1. **左右对齐**：实测有效。微信对话区里对方消息靠左、我的消息靠右。用 OCR 返回的 `BoundingRect` 算每行的 `x1`（最左词起点）和 `x2`（最右词终点），除以对话区宽度：
   - `x2 > 0.75 * 对话区宽` → 我的消息（RIGHT）
   - `x1 < 0.30 * 对话区宽` → 对方消息（LEFT）
   实测示例：`感 觉 我 们 两 吃 饭 …` 在 `x=535..870`（RIGHT），左侧列表项在 `x=189..390`（LEFT）。**注意**：必须先把左侧会话列表裁掉，否则列表项会污染判定。

2. **头像位置**：微信在每条消息旁有头像。会话区左右各有一列头像 x 带，可以作为一个额外的投票信号。

3. **输入框草稿**：底部固定高度区域（约最后 60–90px）内、且 y 坐标大于「发送」按钮上方边界的所有行，视为草稿。实测底部能识别到 `Send` 和草稿文字。

4. **按钮/时间过滤**：行高 < 12px 且宽度很小的（时间戳、图标误读）、或文本命中黑名单（"Send"、"File Transfer"、"[Photo]"、"[Sticker]"、纯数字）的，直接丢弃。

**必须承认的边界**：

- 这些阈值（0.75 / 0.30 / 底部高度）**随窗口大小、DPI、微信版本变化**。窗口拉伸后阈值要重算。建议做成「按对话区实际像素矩形归一化」，而不是写死像素；
- 群聊里会出现「头像 + 昵称 + 气泡」三层，昵称行会混进消息文本，需要靠行高/缩进再切一刀；
- 表情、图片、语音、引用回复、撤回提示，OCR 全部只能拿到 `[Photo]` `[Sticker]` `File Transfer` 这类占位符，**语义直接丢失**。对这类消息，AI 只能看到「这里有个图片」，给不出有意义的回复；
- 滚动位置不确定：截图只覆盖当前可见区域。长对话需要「上下文」时，要么让用户滚到想看的位置，要么自己模拟滚动（高风险，容易把用户的聊天搞乱，不建议 v1 做）。

#### 3.1.5 在 Electron 里怎么调 Windows OCR

`Windows.Media.Ocr` 是 WinRT API，Node/Electron 里没有直接投影。三条路：

| 方案 | 代价 | 评价 |
|---|---|---|
| **A. PowerShell 桥**（已实测） | 一次性调用 ~460–510ms；常驻 worker 首次 ~350ms 启动、之后每次 87–145ms | **推荐**。零原生编译，可读性最好 |
| B. 原生 Node addon 调 WinRT（`RoActivateInstance` + C++/WinRT） | 要 VS 工具链 + electron-rebuild | 能压到 ~20ms，但维护成本高，且本项目明确不折腾原生重建 |
| C. `winrt` / `node-winrt` 类 npm 包 | 多为停滞项目，ABI 不匹配 Electron 39 | 不推荐 |

**实测 PowerShell 桥的两种形态：**

- **一次性 spawn**（每次 `powershell -File ocr.ps1 <png>`）：460 / 462 / 509ms，三次。开销几乎全在 PowerShell 进程启动和 WinRT 类型解析上，OCR 本身只占 60–150ms。
- **常驻 worker**（首次启动后 stdin 收路径、stdout 回结果）：READY 348–381ms 之后，**每次请求 87 / 92 / 145ms**。

所以：**如果做，就做常驻 worker**。按 400ms idle 阈值、用户持续输入的节奏（约每秒 3–8 个字符），87ms 的单次开销完全够用；460ms 的一次性 spawn 在高频触发下会直接把 CPU 打满并产生进程风暴。

PowerShell 侧的调用骨架（已验证可跑通）：

```powershell
Add-Type -AssemblyName System.Runtime.WindowsRuntime
# AsTask 泛型反射桥接，把 IAsyncOperation 转成可 Wait 的 Task
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
# ... GetFileFromPathAsync -> OpenAsync -> BitmapDecoder.CreateAsync -> GetSoftwareBitmapAsync
# ... OcrEngine.TryCreateFromLanguage('zh-Hans-CN').RecognizeAsync(bitmap)
```

**两个实测踩过的坑**（写进文档避免重犯）：

1. **`LASTINPUTINFO` / 自定义 struct 必须先 `koffi.struct()` 声明，再声明引用它的 `func()`**，否则报 `Unknown or invalid type name`。
2. **`PowerShell -Command` 与 stdin 混用会打乱反斜杠**：往 worker 的 stdin 写 Windows 路径时，若路径经过 `-Command` 或某些 shell 转义层，`C:\Users\...` 会变成 `C:Users...`。**用 `-File` 启动 worker，路径按原样写入 stdin**；或在 worker 里统一把 `/` 换成 `\` 再 `GetFileFromPathAsync`。

#### 3.1.6 延迟预算（端到端）

目标：用户停止输入后 **≤1.5 秒**出建议。

| 阶段 | 实测 / 估算 |
|---|---|
| PrintWindow 截图 | 9–13ms（实测） |
| OCR（常驻 worker） | 87–145ms（实测） |
| 图片写盘 + 读回（若走文件） | ~10–30ms；可改为 worker 内直接截+OCR，省掉 |
| 文本清洗 + 气泡切分 | <10ms（纯 JS） |
| 模型生成 2–3 条短回复（本地或已配置 provider） | 600–1200ms（估算，取决于 provider） |
| **合计** | **约 0.7–1.4s** |

结论：**延迟不是瓶颈，准确率和行为克制才是**。

---

### 3.2 路径 2：解密本地数据库 —— 不推荐

#### 现实情况

- 本机数据在 `C:\Users\<user>\Documents\xwechat_files\<wxid>_<suffix>\db_storage\`，实测 61MB，结构为 `bizchat/bizchat.db`、`contact/contact.db`、`chatbot/chatbot_message.db` 等，均带 `-shm` / `-wal`（SQLite WAL 模式）。
- **文件头已实测确认加密**：字节流是随机数据（如 `243 257 88 262 ...`），不是 `SQLite format 3\0`。即 SQLCipher（或腾讯自研变体）加密。
- 要读必须先拿到 32 字节密钥；密钥不在文件里，需从运行中的 `Weixin.exe` 进程内存中提取（通常靠读 `sqlite3_key` 调用参数或扫描内存特征）。

#### 为什么明确不推荐

| 风险 | 说明 |
|---|---|
| **违反服务条款** | 逆向/解密客户端本地数据，明确违反腾讯微信软件许可及服务协议；账号存在被封禁风险。产品里做这件事，等于把封号风险转嫁给用户 |
| **升级即失效** | 密钥派生方式、数据库 schema、加密实现都随版本变化。微信小版本更新就能让整套解析全挂，维护成本是持续的黑洞 |
| **安全与合规** | 从进程内存抠 key，本质是内存注入/读取，会触发安全软件告警；一旦被当作恶意软件特征，AIPA 整个产品都会受牵连 |
| **用户信任** | 「AIPA 会读你的微信数据库」这件事一旦被用户知道，产品信任度归零 |

**唯一可以讨论的窄场景**：用户显式导出自己的聊天记录（微信官方的「聊天记录迁移/备份」功能），再对导出文件解析。这也需要额外格式支持，且不是实时信号，不能支撑「输入时给建议」的产品形态。

**结论：不做。文档里写清楚原因，避免以后有人「顺手试试」。**

---

### 3.3 路径 3：UI Automation —— 实测失败，不要再试

- `AutomationElement.FromHandle(<微信主窗口>)` 返回的元素 **`FindAll(TreeScope.Descendants)` 结果为 0**。
- 根因：微信 4.x 是 Qt 5.15.14 + 自绘 UI，**没有启用 Qt Accessibility**（未加载 `Qt5Accessibility.dll` 或未开 MSAA/UIA bridge）。
- 相关旁证：`GetGUIThreadInfo` 能对记事本拿到 `hwndFocus` + caret rect，**对微信返回空**，说明微信的输入框根本不是子窗口，而是 Qt 自绘的。
- 也有人试过强制 `WM_GETOBJECT` / 注入 accessibility 桥，但那属于往别人的进程里塞东西，稳定性和合规性都不成立。

**不要再投入这条路径。**

---

### 3.4 键盘钩子：实测不可用，且不计划支持

- `SetWindowsHookEx(WH_KEYBOARD_LL)` 在本机 **句柄能装上，但回调一次都没触发**。
- 技术原因：低级键盘钩子要求安装线程有**消息循环**。koffi 注册的回调在 Node 事件循环里，而 Node 主线程不泵 Win32 消息，回调永远不会被投递。
- 即使能跑通，**全局键盘钩子会被安全软件重点关照**，且会捕获用户的密码等全部按键——这是隐私红线。

**因此本设计完全不需要键盘钩子**：用 `GetLastInputInfo` 的全局 idle 时间即可判断「用户正在打字」。它只知道「有没有输入」，不知道「输入了什么」，这是特性不是缺陷。

---

### 3.5 一个重要的运行时约束：hook 必须在 Electron 主进程里跑

实测对比同一个 `window-tracker` 模块：

| 宿主 | `SetWinEventHook` 回调 | 原因 |
|---|---|---|
| 裸 `node tmp-verify-events.js` | ❌ 0 次（关闭轮询时只收到启动时那一次主动采样） | Node 主线程没有 Win32 消息泵 |
| Electron 主进程（`electron tmp-verify-electron.js`） | ✅ 6 次事件（关闭轮询后依然触发） | Chromium 在 UI 线程上跑消息循环 |

**设计含义**：`WindowTracker` 保留了一个低频轮询（默认 500ms）作为兜底，但这只是安全网；**真正的机制是 hook，且必须在 Electron 主进程里初始化**。如果以后有人把这段代码搬到独立 worker 进程或 utility process，hook 会静默失效，只剩轮询，延迟和 CPU 都会变差。这一点写进了模块注释。

---

## 4. 产品形态

### 4.1 一个跟随微信的透明置顶小窗

```
┌─ 微信主窗口 ─────────────────────────────┐
│                                          │
│   对方：明天几点出发？                    │
│                                          │
│                          ┌──────────────┐│
│                          │ AIPA 建议    ││ ← 贴输入框上方 / 右侧
│                          │ ① 8 点吧     ││   无边框、半透明、
│                          │ ② 看路况定   ││   不抢焦点
│                          │ ③ 你想几点？ ││   点一下复制
│                          └──────────────┘│
│  ┌────────────────────────────────────┐  │
│  │ 草稿：                               │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

关键属性（Electron `BrowserWindow`）：

- `transparent: true`、`frame: false`、`alwaysOnTop: true`、`skipTaskbar: true`
- **`focusable: false`** —— 这条最重要，否则浮层一出现就把用户正在打字的微信抢走焦点，体验直接毁掉
- 位置跟随：监听 `window-tracker` 的 rect 变化 + 每 250ms 校准一次（微信窗口会被拖动/缩放）
- 2–3 条建议，**点击即复制到剪贴板**（不自动粘贴——自动粘贴需要模拟按键，等于又回到"往用户输入框里塞东西"的高风险区）
- 复制后浮层 200ms 内消失，`Escape` 或点击外部也关闭

### 4.2 触发条件

```ts
active = 前台进程 ∈ {Weixin.exe, WeChat.exe}
       && 前台窗口 class == Qt51514QWindowIcon
       && idleMs < 400
       && (可选) 连续输入 ≥ N 秒
```

说明：

- `idleMs < 400` 是需求给定的阈值。实测含义是「用户 400ms 内有过任何输入（键鼠都算）」。
- **`idleMs` 是全局的**，不知道输入发生在哪个窗口。如果用户在微信前台，但同时在别的设备/别的输入法里动，会误判。这是这个信号的固有缺陷，接受它。
- 「持续输入 N 秒」作为可选增强，用来过滤「只是点了一下窗口」的场景。建议默认关闭，先观察误报率。
- 触发后**不要每次按键都调模型**。推荐节流：idle 跌破阈值后，等用户**停顿 800ms**（即 idle 在 400–800 之间且保持）再请求，且同一会话 10 秒内最多请求一次。

### 4.3 隐私边界（硬性）

| 要求 | 实现方式 |
|---|---|
| 截图不出本机 | OCR 在本机完成；模型只接收**清洗后的文本**，不接收图片。若未来接多模态模型，需单独、显式、逐次授权 |
| OCR 结果不落盘 | 截图写临时文件后**立即删除**（或直接在 worker 内存里处理）。文本只在内存中流转，不写日志、不写 electron-store |
| 默认关闭 | 偏好项 `wechatCompanion.enabled` 默认 `false`，需用户在设置里显式开启，并显示一段说明 |
| 可审计 | 每次请求可在内存里记录「触发时间 / 耗时 / 是否成功」，**不记录聊天内容**；用户可查看 |
| 不持久化上下文 | 会话上下文只在单次请求内使用，不建立聊天历史库 |

---

## 5. 已落地的原型骨架

### 5.1 文件

| 文件 | 作用 |
|---|---|
| `electron-ui/src/main/awareness/window-tracker.ts` | 前台窗口跟踪 + 全局 idle；`onForegroundChange(cb)` / `getForeground()` / `getIdleMs()` |
| `electron-ui/src/main/awareness/wechat-detect.ts` | 「用户是否正在微信里活动」；`sample()` / `onActivityChange(cb)` |

**不包含**：截图、OCR、模型调用、IPC、UI 接入。全部按约束留白。

### 5.2 平台边界

user32.dll 只在 Windows 上存在。两个模块都通过 `initNative()` 做**一次性惰性加载**：

- 非 Windows：`require('koffi')` 根本不执行，`isWindowTrackingSupported()` 返回 `false`，`getForeground()` 返回 `null`，`getIdleMs()` 返回 `-1`；
- Windows 但 koffi 加载失败：同样降级为上述行为，并 `log.warn` 一次，不抛异常。

这样在 macOS 上打包运行时不会因为找不到 `user32.dll` 崩溃，写法与 `src/main/clawd/src/mac-window.js` 的 `isMac` 条件加载一致。

### 5.3 实测验证输出

纯净 Node 下运行编译产物：

```
platform      : win32
supported     : true
static support: true

--- getForeground() ---
{
  "hwnd": "0x70ae2",
  "pid": 30832,
  "processName": "Weixin.exe",
  "className": "Qt51514QWindowIcon",
  "title": "Weixin",
  "rect": { "left": 390, "top": 160, "right": 1420, "bottom": 1042,
            "width": 1030, "height": 882 },
  "dpi": 144,
  "minimized": false,
  "at": 1793100183979
}

--- getIdleMs() ---
2965782 ms          ← 用户已长时间没在电脑上操作

--- isWeChatWindow(fg) ---
true

--- detector.sample() ---
{ "active": false, "isWeChatForeground": true, "idleMs": 2965782,
  "processName": "weixin.exe", "classNameMatches": true }
```

事件驱动路径（Electron 主进程内，`pollIntervalMs: 0` 关闭轮询，证明是 hook 而非轮询）：

```
supported: true
[+   18ms] fg -> Weixin.exe | Qt51514QWindowIcon | 1030x882
start(): true
sample: {"active":false,"isWeChatForeground":true,"idleMs":3076688}
[+  113ms] fg -> electron.exe | Chrome_WidgetWin_1 | 630x390
[+  232ms] fg -> electron.exe | Chrome_WidgetWin_1 | 630x390
[+  293ms] fg -> electron.exe | Chrome_WidgetWin_1 | 630x390
[+ 1010ms] fg -> electron.exe | Chrome_WidgetWin_1 | 630x390
[+ 1725ms] fg -> electron.exe | Chrome_WidgetWin_1 | 630x390
final fg: electron.exe | Chrome_WidgetWin_1 | AIPA probe A
isWeChatWindow(final): false
events: 6 | distinct: Weixin.exe, electron.exe
HOOK_WORKED_IN_ELECTRON: true
```

对照实验（同一模块，裸 Node，关闭轮询，用 PowerShell 切前台到 Windows Terminal 再切回微信）：

```
[+   11ms] fg -> Weixin.exe | Qt51514QWindowIcon | 1030x882
activated terminal 393794
restored wechat

events: 1 | distinct processes: Weixin.exe
HOOK_WORKED: false
```

**两次结果不同，正是 §3.5 那条结论的证据。**

---

## 6. 风险清单

| 风险 | 影响 | 缓解 |
|---|---|---|
| OCR 错字导致答非所问 | 高 | 清洗 + 只给短上下文；对置信度低的行丢弃；让 UI 允许用户一键「这不准确」并重拍 |
| 气泡左右判定失效（换主题/改版/群聊） | 高 | 阈值按对话区归一化；提供校准模式；判不准时不显示建议（宁可不出现，也不要给错的） |
| 微信改版导致窗口 class / 布局变化 | 中 | class 匹配失败时降级为「按进程名判断」，并把「无法识别布局」上报到可审计日志 |
| 用户没意识到在截屏 | 高 | 默认关闭 + 首次开启时明确说明 + 开启后浮层上常驻一个小指示点 |
| 浮层抢焦点干扰输入 | 中 | `focusable: false` + 点击才复制，绝不自动粘贴 |
| 模型请求频率过高 | 中 | 800ms 停顿触发 + 同会话 10s 节流 + 并发上限 1 |
| PowerShell worker 崩溃 / 被杀 | 中 | 心跳检测 + 指数退避重启；连续失败则自动关闭功能并提示用户 |

---

## 7. 分阶段建议

**Phase 0（已完成）**：窗口感知 + idle 判断原型。无 UI、无截图、无模型。

**Phase 1（建议做的下一步）**：只做「截图 + OCR + 区域切分」的离线验证工具，在真实会话里人工标注 50 组截图，量化左右切分和文本清洗的准确率。**这一步不通过，后面都不值得做。**

**Phase 2**：接本地 OCR worker（常驻）+ 文本清洗 + 少量上下文，先不接模型，只把「当前对话最后 3 条」打印到调试窗口，人工看是否合理。

**Phase 3**：接模型生成 2–3 条建议，浮层只在「判得准」时出现。

**Phase 4**：设置页（开关、隐私说明、触发阈值、黑名单联系人）。

---

## 8. 对「到底能不能做成」的直接回答

**能做成，但要接受三个前提：**

1. **它不是「理解聊天」，而是「识别屏幕上的文字并猜测上下文」**。遇到图片、语音、表情、引用、长对话滚动，它就直接失明。这决定了它的适用场景很窄：**短文本、一来一回的日常对话**。
2. **准确率天花板由 OCR/切分决定，不由模型决定**。中文 OCR 85–92%，再加左右切分误差，真正到达模型的上下文可能有 10–15% 是错的。模型会自信地为错误上下文生成流畅的回复——这是最危险的部分。
3. **合规与用户信任是硬约束**，路径 2（解库）必须放弃，键盘钩子必须放弃。只剩下「用户知情、默认关闭、只在微信前台、只截微信窗口」这一条窄路。

**如果目标用户是「每天微信消息很多、回复很机械」的人**，这条路有真实价值，值得做到 Phase 2 再评估。

**如果目标是「像人一样理解对话并帮我想怎么回」**，坦白说：**做不成**。OCR 拿到的是一堆带噪声的文字片段，丢失了表情、语气、图片内容、引用关系和历史上下文。做出来的东西会更像一个「文本自动补全」，而不是「AI 助手」。

建议先做 Phase 1 的量化验证（50 组真实截图），用数据决定是否继续投入，而不是靠主观感觉。