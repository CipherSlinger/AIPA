---
name: Task Queue Panel - Violet Theme Decision
description: Violet (#a78bfa) chosen as the queue feature's theme color, distinct from existing zinc/blue palette. Codebase uses inline styles, not Tailwind classes.
type: project
---

The Task Queue Panel feature uses violet (#a78bfa / violet-400) as its theme color to distinguish queue-related UI from the main palette (zinc neutrals + blue #007acc accent).

**Why:** The existing color space has zinc (neutral), blue (accent/primary actions), green (success), yellow (warning), and red (error). Violet occupies an unused slot and carries a "pending/processing" connotation without conflicting with semantic colors.

**How to apply:** Any future queue-related or batch-processing features should reuse this violet palette (--queue-accent: #a78bfa, --queue-badge: #8b5cf6, --queue-accent-soft: #c4b5fd). The codebase exclusively uses inline `style={{}}` objects with CSS variables -- never introduce Tailwind utility classes in components.
