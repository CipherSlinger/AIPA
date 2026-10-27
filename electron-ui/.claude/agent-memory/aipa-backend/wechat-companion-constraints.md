---
name: wechat-companion-constraints
description: Verified Windows/WeChat API capabilities and hard limits for the WeChat reply-companion feature (AIPA)
metadata:
  type: project
---

The WeChat companion feature (`electron-ui/src/main/awareness/`) was scoped around these capabilities, all measured on the user's Windows 11 machine (WeChat 4.1.15.13, 150% DPI) rather than assumed:

- `PrintWindow(PW_RENDERFULLCONTENT)` captures a correct WeChat frame even when fully occluded. `BitBlt` does not.
- `Windows.Media.Ocr` with the `zh-Hans-CN` pack works offline; ~60–150ms per window, ~85–92% CJK accuracy. Upscaling 2x/3x does not reliably improve it.
- `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` callbacks fire only in a process with a Win32 message pump — Electron main yes, plain `node` no. The tracker keeps a 500ms poll as fallback.
- `GetLastInputInfo` gives global idle (keyboard + mouse, window-agnostic).
- UI Automation returns 0 descendants for WeChat (Qt, accessibility disabled) and `GetGUIThreadInfo` yields no caret — both dead ends.
- `WH_KEYBOARD_LL` handles install but callbacks never fire from koffi/Node.
- WeChat `Documents/xwechat_files/<wxid>/db_storage/*.db` are encrypted (non-SQLite header); decryption is rejected for ToS and account-ban reasons.

**Why:** The user asked for a feasibility verdict, not a sales pitch. These measurements are the evidence base for `docs/wechat-companion.md` and should not be re-derived.

**How to apply:** When this feature is revisited, start from these facts. Do not propose UI Automation, keyboard hooks, or database decryption — each was ruled out empirically or on policy grounds. See [[electron-main-ipc-conventions]] for the module-layer conventions this code follows.