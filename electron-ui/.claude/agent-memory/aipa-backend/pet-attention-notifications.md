---
name: pet-attention-notifications
description: Policy that the desktop pet is the only notification surface for approvals, questions, failures and plugin completions while AIPA is backgrounded
metadata:
  type: project
---

For the four background events (approval pending, clarification needed, task failed, plugin job finished), the desktop pet bubble is the *only* notification. The renderer's generic completion notification is suppressed in `window:showNotification` only when the notification carries the **same session id** that raised the failure (5 s window); a notification with no session id is never suppressed because it cannot be attributed. Native notifications stay in place for ordinary chat completions, and the automation scheduler keeps its own `Notification` (it is not routed through the pet).

**Why:** the user asked not to be notified twice for one event, and the pet is the surface that can open the right session on click. Suppression used to be one global "any failure in the last 5 s" timestamp, so conversation A failing swallowed conversation B's completion. Automation was deliberately left alone because that directory is owned by another agent and already emits its own notification.

**How to apply:** new "needs you in the background" signals should call `raiseAttention` in `src/main/clawd-attention.ts` and must not also call `window:showNotification`. When a bubble can open several things (a coalesced plugin batch), the click must offer a chooser — `openPluginChooser` does this with a native menu — never silently open one item. If automation failures should gain the pet, the scheduler would need to raise attention instead of (not in addition to) its own Notification. See [[electron-main-ipc-conventions]] and [[internal-turn-isolation]] — internal turns are excluded from attention.
