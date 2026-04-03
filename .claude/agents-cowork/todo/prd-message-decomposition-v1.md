# PRD: Message.tsx Decomposition

_Version: 1 | Date: 2026-04-03 | Author: agent-leader (acting as PM)_

## Problem

`Message.tsx` is at 602 lines -- sitting at the P1 WATCH threshold. It contains multiple self-contained feature domains (TTS, annotations, reactions, editing) that inflate the component and make it harder to maintain. The retro action item from 441-450 explicitly targets reducing Message.tsx to under 500 lines.

## In Scope (3 extraction targets)

### 1. Extract TTS (Text-to-Speech) into `useReadAloud.ts` hook

Lines 60-62 (state), 139-195 (handlers + cleanup) -- approximately 60 lines.

Extract into a custom hook:
```typescript
export function useReadAloud(message: ChatMessage) {
  // isSpeaking state
  // utteranceRef
  // handleReadAloud callback
  // cleanup effect
  return { isSpeaking, handleReadAloud }
}
```

### 2. Extract Annotation Editor into `AnnotationEditor.tsx` component

Lines 70-73 (state), 81-109 (handlers), 389-498 (JSX) -- approximately 120 lines total.

Extract into a self-contained component:
```typescript
interface AnnotationEditorProps {
  messageId: string
  currentAnnotation: string | undefined
  isUser: boolean
  onToggle: () => void  // exposed for action toolbar
}
```

The component manages its own show/hide state, draft state, and commit/remove logic. The parent (Message.tsx) only needs to know the messageId and current annotation value.

### 3. Extract Reaction Chips into `ReactionChips.tsx` component

Lines 348-387 -- approximately 40 lines.

Extract the reaction chips rendering and toggle logic:
```typescript
interface ReactionChipsProps {
  messageId: string
  reactions: string[]
  hovered: boolean
}
```

## Out of Scope

- No new features; this is pure refactoring
- No changes to MessageActionToolbar, MessageContextMenu, or MessageBubbleContent
- No changes to the React.memo equality check at the bottom of Message.tsx (it stays in Message.tsx)
- No i18n changes (keys already exist)

## Acceptance Criteria

- [ ] `useReadAloud.ts` hook created and used in Message.tsx
- [ ] `AnnotationEditor.tsx` component created and used in Message.tsx
- [ ] `ReactionChips.tsx` component created and used in Message.tsx
- [ ] Message.tsx reduced from 602 to under 500 lines
- [ ] All TTS, annotation, and reaction functionality unchanged
- [ ] `npm run build` succeeds with zero TypeScript errors

## Dedup Check

- No existing `useReadAloud`, `AnnotationEditor`, or `ReactionChips` files in the codebase (verified via grep).
- TTS logic exists only in Message.tsx (confirmed).
- Reaction rendering exists only in Message.tsx (confirmed).

## File Impact

| File | Action |
|------|--------|
| `src/renderer/components/chat/useReadAloud.ts` | NEW |
| `src/renderer/components/chat/AnnotationEditor.tsx` | NEW |
| `src/renderer/components/chat/ReactionChips.tsx` | NEW |
| `src/renderer/components/chat/Message.tsx` | MODIFY (reduce) |
| `src/renderer/i18n/locales/en.json` | NO CHANGE |
| `src/renderer/i18n/locales/zh-CN.json` | NO CHANGE |
