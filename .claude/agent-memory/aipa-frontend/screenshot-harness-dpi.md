---
name: screenshot-harness-dpi
description: PrintWindow-based screenshot scripts on Windows are DPI-unaware and silently crop the right edge of the window at 150% scaling — it looks like a UI clipping bug.
metadata:
  type: project
---

`shot.ps1` (Temp\aipa-shot) captures a window with `GetWindowRect` + `PrintWindow(PW_RENDERFULLCONTENT)` from a DPI-unaware PowerShell. At 150% display scaling `GetWindowRect` returns DIP-sized coordinates (window 1280x752 client -> 1295x767 with borders), while `PrintWindow` draws the window at physical resolution (1920x1128). The bitmap is too small, so the right ~625 px of the render is simply missing.

**Why:** this produced a "real screenshot" that appeared to show the org chart's cards clipped at the pane's right edge (2026-10-28). Measurement proved the layout fit with 24-324 px slack; the cut was the bitmap edge, and the toolbar's "New Department" button was cut too, which gave it away.

**How to apply:** never trust a PrintWindow screenshot of an Electron window at this machine's scaling. Capture through the harness instead (`win.show()` then `win.webContents.capturePage()`), or size the bitmap from `GetClientRect` x `devicePixelRatio` and mark the PowerShell process DPI-aware. Before "fixing" a clipping report, read the PNG dimensions: a capture narrower than `innerWidth * scale` is a crop, not a layout bug.
