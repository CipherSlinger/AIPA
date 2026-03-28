# UI Spec: Session Tags (会话标签)
_Date: 2026-03-27 | PRD: prd-session-tags-v1.md | Designer: aipa-ui_

## Design Overview
Add a lightweight colored tag system to the session list for session organization. The design integrates seamlessly with the existing WeChat-style UI (dark theme with accent highlights). All new elements use the established CSS variable system.

---

## 1. Tag Color Palette (6 preset tags)

| Tag ID | Default Name | Color Hex | CSS Usage |
|--------|-------------|-----------|-----------|
| tag-1 | Work | `#3b82f6` | Blue, for professional tasks |
| tag-2 | Personal | `#22c55e` | Green, for personal use |
| tag-3 | Research | `#f59e0b` | Amber, for exploration |
| tag-4 | Debug | `#ef4444` | Red, for bug fixing |
| tag-5 | Docs | `#8b5cf6` | Purple, for documentation |
| tag-6 | Archive | `#6b7280` | Gray, for inactive sessions |

Light theme: Same colors but at 90% saturation to avoid jarring on white bg.

---

## 2. Tag Dots on Session Items

**Position**: After the preview text line, right-aligned, vertically centered with preview row.

**Visual spec**:
- Dot size: 6px diameter, border-radius: 50%
- Dot spacing: 3px gap between dots
- Max visible dots: 3 (if >3 tags, show `+N` in 9px muted text)
- Opacity: 0.85 (subtle but readable)

**Layout** (within existing session item):
```
[Avatar] [Title + Timestamp]
         [Preview text...] [dot][dot][+1]
```

**Hover**: Each dot shows a tooltip with the tag name (reuse existing popup-in tooltip pattern from NavRail)

---

## 3. Tag Assignment (Inline Tag Picker)

**Trigger**: New `Tag` icon button (lucide `Tag` icon, size 11) added to the existing hover action buttons row (between Star/Pin and Pencil/Rename).

**Tag Picker Popup**:
- Appears below the Tag button, left-aligned
- Uses popup-bg/popup-border/popup-shadow CSS variables
- Width: 160px, border-radius: 8px, padding: 4px
- Animation: popup-in entrance
- Contains 6 rows, each:
  - 8px color dot (left)
  - Tag name (flex: 1, fontSize: 12, color: --text-primary)
  - Checkmark icon (right, 12px, accent color) if assigned
  - Hover: popup-item-hover background
  - Click: toggle assignment
- Click outside or press Escape to close

**Visual mockup** (tag picker popup):
```
+---------------------------+
| [dot] Work          [check]|
| [dot] Personal             |
| [dot] Research              |
| [dot] Debug                 |
| [dot] Docs                  |
| [dot] Archive               |
+---------------------------+
```

---

## 4. Tag Filter Bar

**Position**: Directly below the search bar row, above the session list scroll area.

**Visibility**: Only rendered when at least 1 session has any tag assigned. Hidden otherwise.

**Visual spec**:
- Height: 28px, flex-shrink: 0
- Background: transparent (inherits panel bg)
- Padding: 4px 10px
- Horizontal scroll with overflow-x: auto, no scrollbar (use `scrollbar-width: none`)
- Gap: 6px between pills

**Tag pill spec**:
- Height: 20px, border-radius: 10px (full pill shape)
- Padding: 0 8px
- Background: rgba of tag color at 0.12 opacity
- Border: 1px solid rgba of tag color at 0.25
- Content: 6px color dot + tag name (10px, --text-secondary) + count badge
- Count badge: (N) in 9px, opacity 0.6
- Hover: background brightens to rgba at 0.2
- Active (selected) state:
  - Background: rgba of tag color at 0.3
  - Border: 1px solid tag color at 0.5
  - Text color: tag color (full)
  - Font weight: 600

**Layout**:
```
[Search bar row ...]
[tag pill: Work (3)] [tag pill: Debug (1)] [tag pill: Docs (5)]
[Session list ...]
```

---

## 5. Tag Management in Settings

**Position**: After the "Language" section, before the "System Prompt Template" section.

**Section label**: "Tags" / "标签" (i18n)

**Visual spec**: Simple list of 6 rows, each row:
- Left: 10px color circle (non-editable, just visual indicator)
- Center: Text input, same styling as other Settings inputs (input-field-bg, input-field-border, input-field-focus, border-radius: 6px, height: 30px, fontSize: 12)
- Input placeholder: "Tag name..."
- On change: auto-save via prefsSet (no save button needed -- matches existing auto-save UX pattern)

**Layout**:
```
Tags
[red dot] [_________Work________]
[green dot] [______Personal_____]
[amber dot] [______Research_____]
[red dot] [________Debug_______]
[purple dot] [_______Docs_______]
[gray dot] [______Archive______]
```

---

## 6. i18n Keys

New keys to add:

```json
{
  "tags.sectionTitle": "Tags",
  "tags.tagNamePlaceholder": "Tag name...",
  "tags.filterByTag": "Filter by tag",
  "tags.assign": "Tags",
  "tags.work": "Work",
  "tags.personal": "Personal",
  "tags.research": "Research",
  "tags.debug": "Debug",
  "tags.docs": "Docs",
  "tags.archive": "Archive"
}
```

Chinese:
```json
{
  "tags.sectionTitle": "标签",
  "tags.tagNamePlaceholder": "标签名称...",
  "tags.filterByTag": "按标签过滤",
  "tags.assign": "标签",
  "tags.work": "工作",
  "tags.personal": "个人",
  "tags.research": "研究",
  "tags.debug": "调试",
  "tags.docs": "文档",
  "tags.archive": "归档"
}
```

---

## 7. Interactions & Animations

| Interaction | Animation |
|-------------|-----------|
| Tag picker appears | popup-in (0.15s ease) |
| Tag dot added to session | fade-in (opacity 0->1, 0.2s) |
| Filter pill selected | background transition 0.15s ease |
| Filter pill deselected | background transition 0.15s ease |

All animations respect `prefers-reduced-motion`.

---

## 8. Accessibility

- Tag picker: `role="menu"`, items `role="menuitem"` with `aria-checked`
- Tag filter pills: `role="radiogroup"` with individual `role="radio"` and `aria-checked`
- Color dots: `aria-hidden="true"` (color alone does not convey meaning; name is always present)
- Tag picker close on Escape key

---

## 9. Light Theme Considerations

- Tag dot colors remain the same (already high-contrast on light bg)
- Tag filter pills use same rgba formula (works on both dark/light)
- Tag picker popup inherits popup-bg/popup-border (already theme-aware)
- Settings input inherits input-field variables (already theme-aware)
