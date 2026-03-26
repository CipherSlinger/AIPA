import fs from 'fs'
import path from 'path'
import os from 'os'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const isDev = process.env.NODE_ENV === 'development'

// ANSI color codes for console output in development
const ANSI = {
  reset: '\x1b[0m',
  debug: '\x1b[36m',  // cyan
  info: '\x1b[32m',   // green
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
}

const LOG_DIR = path.join(os.homedir(), '.claude')
const LOG_FILE = path.join(LOG_DIR, 'aipa.log')
const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_BACKUPS = 2

let logStream: fs.WriteStream | null = null

function ensureLogDir(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true })
    }
  } catch {
    // If we can't create the log dir, logging to file simply won't work
  }
}

function rotateLogs(): void {
  try {
    if (!fs.existsSync(LOG_FILE)) return
    const stat = fs.statSync(LOG_FILE)
    if (stat.size < MAX_LOG_SIZE) return

    // Rotate: .log.2 gets deleted, .log.1 -> .log.2, .log -> .log.1
    for (let i = MAX_BACKUPS; i >= 1; i--) {
      const old = `${LOG_FILE}.${i}`
      const next = `${LOG_FILE}.${i + 1}`
      if (fs.existsSync(old)) {
        if (i === MAX_BACKUPS) {
          fs.unlinkSync(old)
        } else {
          fs.renameSync(old, next)
        }
      }
    }
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`)
  } catch {
    // Rotation failure is non-fatal
  }
}

function getLogStream(): fs.WriteStream | null {
  if (logStream) return logStream
  try {
    ensureLogDir()
    rotateLogs()
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' })
    return logStream
  } catch {
    return null
  }
}

function formatEntry(level: LogLevel, module: string, message: string): string {
  const ts = new Date().toISOString()
  return `[${ts}] [${level.toUpperCase().padEnd(5)}] [${module}] ${message}`
}

function writeLog(level: LogLevel, module: string, message: string, ...args: unknown[]): void {
  const fullMsg = args.length > 0
    ? `${message} ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`
    : message

  const entry = formatEntry(level, module, fullMsg)

  // In development: also output to console with ANSI colors
  if (isDev) {
    const color = ANSI[level]
    console.log(`${color}${entry}${ANSI.reset}`)
  }

  // Write to file in production (and development)
  const stream = getLogStream()
  if (stream) {
    stream.write(entry + '\n')
  }
}

/**
 * Create a module-scoped logger instance.
 */
export function createLogger(module: string) {
  return {
    debug: (message: string, ...args: unknown[]) => writeLog('debug', module, message, ...args),
    info:  (message: string, ...args: unknown[]) => writeLog('info', module, message, ...args),
    warn:  (message: string, ...args: unknown[]) => writeLog('warn', module, message, ...args),
    error: (message: string, ...args: unknown[]) => writeLog('error', module, message, ...args),
  }
}

/**
 * Root logger (no module name). Use createLogger() for module-specific loggers.
 */
export const logger = createLogger('main')
