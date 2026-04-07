/**
 * CircularBuffer — fixed-size circular buffer with automatic eviction (Iteration 492)
 * Ported from Claude Code sourcemap: src/utils/CircularBuffer.ts
 * Used for rolling-window calculations (e.g., streaming speed over last N samples).
 */
export class CircularBuffer<T> {
  private buffer: T[]
  private head = 0
  private size = 0

  constructor(private capacity: number) {
    this.buffer = new Array(capacity)
  }

  /** Add an item; if full, evicts the oldest. */
  add(item: T): void {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this.size < this.capacity) this.size++
  }

  /** Add multiple items. */
  addAll(items: T[]): void {
    for (const item of items) this.add(item)
  }

  /** Get the most recent N items (fewer if buffer has less than N). */
  getRecent(count: number): T[] {
    const result: T[] = []
    const start = this.size < this.capacity ? 0 : this.head
    const available = Math.min(count, this.size)
    for (let i = 0; i < available; i++) {
      const index = (start + this.size - available + i) % this.capacity
      result.push(this.buffer[index]!)
    }
    return result
  }

  /** Get all items from oldest to newest. */
  toArray(): T[] {
    if (this.size === 0) return []
    const result: T[] = []
    const start = this.size < this.capacity ? 0 : this.head
    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[(start + i) % this.capacity]!)
    }
    return result
  }

  get length(): number {
    return this.size
  }

  clear(): void {
    this.head = 0
    this.size = 0
  }
}
