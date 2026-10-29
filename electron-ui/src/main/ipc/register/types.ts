/** Renderer-push sink shared by every handler group. */
export type SendFn = (channel: string, ...args: unknown[]) => void

/** Renderer-push sink shared by both engines. */
export type BridgeSink = (channel: string, data: Record<string, unknown>) => void
