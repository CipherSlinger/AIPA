// objectGroupBy — Group items into an object by key (Iteration 500)
// Ported from Claude Code sourcemap: src/utils/objectGroupBy.ts
// Polyfill for Object.groupBy (ES2024) with full TypeScript typing.

/**
 * Groups items from an iterable into an object by a computed key.
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.groupby
 *
 * @example
 * objectGroupBy([{role:'user',...},{role:'assistant',...}], s => s.role)
 * // → { user: [...], assistant: [...] }
 */
export function objectGroupBy<T, K extends PropertyKey>(
  items: Iterable<T>,
  keySelector: (item: T, index: number) => K,
): Partial<Record<K, T[]>> {
  const result = Object.create(null) as Partial<Record<K, T[]>>
  let index = 0
  for (const item of items) {
    const key = keySelector(item, index++)
    if (result[key] === undefined) result[key] = []
    result[key]!.push(item)
  }
  return result
}
