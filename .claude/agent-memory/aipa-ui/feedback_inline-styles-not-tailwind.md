---
name: Codebase uses inline styles, not Tailwind classes
description: All renderer components use style={{}} objects and CSS variables. Design specs should map to CSS vars, never prescribe Tailwind classes for direct use.
type: feedback
---

All existing React components in `electron-ui/src/renderer/` use inline `style={{}}` objects with CSS custom properties (`var(--bg-primary)`, `var(--border)`, etc.), not Tailwind utility classes. Tailwind is configured but only drives the token values, not the authoring pattern.

**Why:** Consistency with the established codebase pattern. Introducing Tailwind classes in one component would create a split convention that confuses future contributors.

**How to apply:** When writing UI specs, include Tailwind class names only as a visual shorthand reference. Always provide a CSS variable mapping table and call out explicitly that frontend should use inline styles. Verify this pattern by reading any existing component before finalizing a spec.
