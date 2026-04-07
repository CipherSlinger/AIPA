/**
 * speculation-bridge.ts — Forked speculative CLI execution (Iteration 489).
 * Inspired by Claude Code's services/PromptSuggestion/speculation.ts.
 *
 * Runs a "shadow" CLI turn in an isolated temp directory (overlay simulation).
 * File writes go into the overlay dir. On accept(), changed files are merged
 * back to the real working directory. On reject(), the overlay is discarded.
 *
 * Architecture:
 *   SpeculationBridge spawns a new StreamBridge in a temp copy of cwd.
 *   It collects all text output and tool actions without emitting to the
 *   main session. When complete, calls onDone(result).
 *
 * Boundary detection prevents speculation on dangerous prompts (rm, delete, etc.).
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { getCliPath, getNodePath } from '../utils/cli-path'
import { sanitizeEnv } from '../utils/cli-env'
import { createLogger } from '../utils/logger'

const log = createLogger('speculation-bridge')

export interface SpeculationResult {
  id: string
  prompt: string            // the speculated user prompt
  text: string              // assistant response text collected
  toolActions: SpecToolAction[]
  changedFiles: string[]    // paths in overlayDir that were written
  overlayDir: string        // temp dir — must be cleaned up by caller
  durationMs: number
  truncated: boolean
}

export interface SpecToolAction {
  name: string
  input: Record<string, unknown>
  result?: string
}

/** Prompts that should never be speculated — destructive or ambiguous */
const DANGEROUS_PATTERNS = [
  /\brm\b/, /\bdelete\b/i, /\bdrop\b/i, /\bformat\b/i,
  /\btruncate\b/i, /\buninstall\b/i, /\bwipe\b/i,
  /git\s+reset\s+--hard/i, /git\s+push\s+--force/i,
  /sudo\s+/i,
]

/** Returns true if the prompt is safe to speculate on */
export function isSafeToSpeculate(prompt: string): boolean {
  const trimmed = prompt.trim()
  if (trimmed.length < 3 || trimmed.length > 2000) return false
  return !DANGEROUS_PATTERNS.some(p => p.test(trimmed))
}

/** Max ms to let speculation run before aborting */
const SPECULATION_TIMEOUT_MS = 45_000

export class SpeculationBridge {
  private proc: ChildProcess | null = null
  private overlayDir: string | null = null
  private startTime = 0
  private textChunks: string[] = []
  private toolActions: SpecToolAction[] = []
  private currentToolAction: Partial<SpecToolAction> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  readonly id: string

  constructor(id: string) {
    this.id = id
  }

  /**
   * Start a speculative turn.
   * Creates a temp overlay dir, spawns CLI with --print mode in it.
   * Resolves with SpeculationResult when done or timed out.
   */
  async run(
    prompt: string,
    realCwd: string,
    model: string,
    env: Record<string, string>,
  ): Promise<SpeculationResult> {
    this.startTime = Date.now()

    // Create isolated temp dir (overlay simulation)
    this.overlayDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aipa-spec-'))
    log.debug(`Speculation ${this.id}: overlay=${this.overlayDir} prompt="${prompt.slice(0, 60)}"`)

    const cliArgs = [
      getCliPath(),
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--print',
      '--max-turns', '3',   // cap turns for speculation
      '--skip-permissions', // speculation never asks for confirmation
      ...(model ? ['--model', model] : []),
    ]

    const procEnv = sanitizeEnv({
      ...env,
      TERM: 'dumb',
      NO_COLOR: '1',
      AIPA_SPECULATION: '1',  // signal to any hooks this is a spec run
    })

    this.proc = spawn(getNodePath(), cliArgs, {
      cwd: this.overlayDir,
      env: procEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Write the speculative user message
    const userMsg = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: prompt },
      session_id: '',
      parent_tool_use_id: null,
    }) + '\n'
    this.proc.stdin!.write(userMsg)
    this.proc.stdin!.end()

    return new Promise<SpeculationResult>((resolve) => {
      const done = (truncated = false) => {
        if (this.timer) { clearTimeout(this.timer); this.timer = null }
        if (this.proc) {
          try { this.proc.kill() } catch {}
          this.proc = null
        }
        const changedFiles = this._listOverlayChanges(realCwd)
        resolve({
          id: this.id,
          prompt,
          text: this.textChunks.join(''),
          toolActions: this.toolActions,
          changedFiles,
          overlayDir: this.overlayDir!,
          durationMs: Date.now() - this.startTime,
          truncated,
        })
      }

      // Timeout guard
      this.timer = setTimeout(() => {
        log.debug(`Speculation ${this.id}: timed out`)
        done(true)
      }, SPECULATION_TIMEOUT_MS)

      // Parse NDJSON output
      const rl = createInterface({ input: this.proc!.stdout! })
      rl.on('line', (line) => {
        const trimmed = line.trim()
        if (!trimmed) return
        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>
          this._handleEvent(event)
        } catch { /* ignore non-JSON */ }
      })

      this.proc!.stderr!.on('data', (d: Buffer) => {
        log.debug(`Speculation ${this.id} stderr:`, d.toString().slice(0, 100))
      })

      this.proc!.on('close', () => done(false))
    })
  }

  /** Abort the speculation immediately */
  abort(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.proc) { try { this.proc.kill() } catch {} this.proc = null }
    this._cleanup()
  }

  /** Copy overlay files that differ from realCwd into realCwd (accept) */
  mergeToReal(realCwd: string): string[] {
    if (!this.overlayDir || !fs.existsSync(this.overlayDir)) return []
    const merged: string[] = []
    this._walkDir(this.overlayDir, (overlayPath) => {
      const rel = path.relative(this.overlayDir!, overlayPath)
      const realPath = path.join(realCwd, rel)
      try {
        const overlayContent = fs.readFileSync(overlayPath)
        let realContent: Buffer | null = null
        try { realContent = fs.readFileSync(realPath) } catch {}
        // Only copy if different (or new)
        if (!realContent || !overlayContent.equals(realContent)) {
          fs.mkdirSync(path.dirname(realPath), { recursive: true })
          fs.writeFileSync(realPath, overlayContent)
          merged.push(rel)
        }
      } catch { /* skip unreadable */ }
    })
    this._cleanup()
    return merged
  }

  /** Discard the overlay (reject) */
  discard(): void {
    this._cleanup()
  }

  private _cleanup(): void {
    if (this.overlayDir && fs.existsSync(this.overlayDir)) {
      try { fs.rmSync(this.overlayDir, { recursive: true, force: true }) } catch {}
      this.overlayDir = null
    }
  }

  private _handleEvent(event: Record<string, unknown>): void {
    switch (event.type) {
      case 'assistant': {
        const msg = event.message as Record<string, unknown>
        const content = msg?.content as Array<Record<string, unknown>> | undefined
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') this.textChunks.push(block.text as string)
            else if (block.type === 'tool_use') {
              this.currentToolAction = {
                name: block.name as string,
                input: (block.input || {}) as Record<string, unknown>,
              }
            }
          }
        }
        break
      }
      case 'content_block_delta': {
        const delta = event.delta as Record<string, unknown>
        if (delta?.type === 'text_delta') {
          this.textChunks.push(delta.text as string)
        }
        break
      }
      case 'user': {
        // Tool results
        const msg = event.message as Record<string, unknown>
        const content = msg?.content as Array<Record<string, unknown>> | undefined
        if (Array.isArray(content) && this.currentToolAction) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              const resultContent = block.content
              const resultText = typeof resultContent === 'string'
                ? resultContent
                : JSON.stringify(resultContent)
              this.toolActions.push({
                ...this.currentToolAction,
                result: resultText.slice(0, 500),
              } as SpecToolAction)
              this.currentToolAction = null
            }
          }
        }
        break
      }
    }
  }

  /** List files in overlay that differ from realCwd */
  private _listOverlayChanges(realCwd: string): string[] {
    if (!this.overlayDir || !fs.existsSync(this.overlayDir)) return []
    const changed: string[] = []
    this._walkDir(this.overlayDir, (overlayPath) => {
      const rel = path.relative(this.overlayDir!, overlayPath)
      const realPath = path.join(realCwd, rel)
      try {
        const overlayContent = fs.readFileSync(overlayPath)
        let realContent: Buffer | null = null
        try { realContent = fs.readFileSync(realPath) } catch {}
        if (!realContent || !overlayContent.equals(realContent)) {
          changed.push(rel)
        }
      } catch {}
    })
    return changed
  }

  private _walkDir(dir: string, cb: (filePath: string) => void): void {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) this._walkDir(full, cb)
      else cb(full)
    }
  }
}

/** Singleton manager for active speculation sessions */
class SpeculationManager {
  private active = new Map<string, SpeculationBridge>()

  create(id: string): SpeculationBridge {
    const bridge = new SpeculationBridge(id)
    this.active.set(id, bridge)
    return bridge
  }

  get(id: string): SpeculationBridge | undefined {
    return this.active.get(id)
  }

  abort(id: string): void {
    const bridge = this.active.get(id)
    if (bridge) { bridge.abort(); this.active.delete(id) }
  }

  remove(id: string): void {
    this.active.delete(id)
  }

  abortAll(): void {
    for (const [id, bridge] of this.active) {
      bridge.abort()
      this.active.delete(id)
    }
  }
}

export const speculationManager = new SpeculationManager()
