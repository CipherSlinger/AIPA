# PRD: Component Decomposition + Dead Code Cleanup

**Author**: agent-leader (acting as PM)
**Date**: 2026-04-06
**Priority**: P1 (Technical Health)
**Iteration Target**: 511-512

---

## Background

The retro-2026-04-06-iterations-471-509 identified two critical technical debt items:
1. Three components exceed the 600-line P1 decomposition threshold
2. Four utility files shipped with zero consumers (dead code)

The File Size Watch List from the retro shows:

| File | Lines | Priority |
|------|-------|----------|
| WorkflowCanvas.tsx | 713 | P1 DECOMPOSE |
| TasksPanel.tsx | 689 | P1 DECOMPOSE |
| WorkflowDetailPage.tsx | 657 | P1 DECOMPOSE |

Dead code files (zero imports anywhere in the codebase):
- `src/renderer/utils/setUtils.ts`
- `src/renderer/utils/objectGroupBy.ts`
- `src/renderer/utils/sequential.ts`
- `src/renderer/hooks/useTimeout.ts`

---

## In Scope

### 1. Decompose WorkflowCanvas.tsx (713 lines -> target <400 per file)

Extract from WorkflowCanvas.tsx:
- **CanvasNode.tsx**: The node rendering component (position, styling, collapse state, output preview)
- **CanvasEdge.tsx**: The edge/connection rendering (SVG paths, dash animation, status coloring)
- **useCanvasLayout.ts**: The layout computation logic (node positioning, offset calculation)

WorkflowCanvas.tsx should become a thin orchestrator that imports these.

### 2. Decompose TasksPanel.tsx (689 lines -> target <400 per file)

Extract from TasksPanel.tsx:
- **TaskItem.tsx**: Individual task card (status toggle, edit, delete, drag)
- **ReminderSection.tsx**: Reminder list + scheduling + cron UI
- **useTasksCrud.ts**: Task CRUD operations + persistence

TasksPanel.tsx should become the layout shell importing these.

### 3. Decompose WorkflowDetailPage.tsx (657 lines -> target <400 per file)

Extract from WorkflowDetailPage.tsx:
- **WorkflowStepEditor.tsx**: The step card editing UI (title input, prompt textarea, delete)
- **WorkflowDetailHeader.tsx**: The header bar (icon picker, name, save/run buttons)
- WorkflowDetailPage.tsx remains as the page layout with step list + canvas

### 4. Remove Dead Code

Delete the following files entirely (confirmed zero consumers via grep):
- `src/renderer/utils/setUtils.ts`
- `src/renderer/utils/objectGroupBy.ts`
- `src/renderer/utils/sequential.ts`
- `src/renderer/hooks/useTimeout.ts`

---

## Out of Scope

- Functional changes to any component (this is pure refactoring)
- Changes to CSS/styling
- i18n changes
- Store changes

---

## Acceptance Criteria

- [ ] WorkflowCanvas.tsx < 400 lines
- [ ] TasksPanel.tsx < 400 lines
- [ ] WorkflowDetailPage.tsx < 400 lines
- [ ] 4 dead code files deleted
- [ ] Zero TypeScript errors (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] No behavioral changes (visual output identical)
