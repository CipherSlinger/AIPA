/**
 * The department handbook block for one turn, plus the receipt that says what
 * was given.
 *
 * A department's handbook ("部门手册") is the standing rules of a desk. It used
 * to ride only in front of the *first* message of a conversation started from
 * that department's roster, which meant turn two — and every turn after a
 * resume — ran without the rules the user wrote. The block is now built at the
 * turn boundary and prepended to the prompt envelope, so it never enters the
 * user's own message and never appears in the transcript as something they
 * typed.
 *
 * Two constraints shape the resolution:
 *
 * 1. Membership is a lookup, never a guess. A conversation belongs to a node
 *    only when the user's own org tree says so: an explicit filing, the task
 *    that recorded it, the session row's recorded directory, or the desk the
 *    draft was started from. The working directory of the moment and the
 *    conversation title are not evidence — either can differ from where the
 *    conversation actually lives.
 * 2. Nothing is disclosed when nothing is known. No department, two
 *    departments (two nodes sharing one directory), or an unreadable tree all
 *    produce no block and no receipt. Silence is the honest answer to "we
 *    can't tell".
 */
import type { Department, FilingMap } from '../store/departmentStore'
import { dirToSlug, normalizePath } from '../components/departments/deptUtils'

/**
 * How much handbook text one turn may carry.
 *
 * A handbook is a document, not a sentence, and the model also pays for the
 * conversation itself. Past this ceiling the block is cut and the cut is
 * stated *inside* the block — the model is never handed a silently halved
 * handbook. The receipt reports the real size too.
 */
export const DEPT_HANDBOOK_MAX_CHARS = 8000

/** What the conversation's department handbook contributed to one turn. */
export interface DeptHandbookReceipt {
  /** The org node the conversation belonged to when this turn was sent. */
  deptId: string
  /** The node's display name at send time. */
  deptName: string
  /** Characters of handbook content placed in the block (after the ceiling). */
  chars: number
  /** The handbook's real length, before the ceiling cut it. */
  sourceChars: number
  /** The block was cut at `DEPT_HANDBOOK_MAX_CHARS`. */
  truncated: boolean
  /**
   * The department defines a handbook, but it holds no non-whitespace text.
   * Recorded so the fact is not lost; the row deliberately renders nothing for
   * it — nothing was given.
   */
  empty?: boolean
  /**
   * The handbook value existed but could not be used. That is a fact about the
   * user's data, so the row may say so instead of letting it read as "this
   * department has no handbook".
   */
  unreadable?: string
  /** The exact block prepended, so the row can show it verbatim. */
  text?: string
}

export interface DeptHandbookTurn {
  /** The `<department_handbook>` block, `''` when this turn carries none. */
  text: string
  /** Null when there is nothing to disclose. */
  receipt: DeptHandbookReceipt | null
}

/** The three session fields the directory join may look at. */
export interface HandbookSessionRow {
  sessionId: string
  cwd?: string
  projectSlug?: string
}

export interface DeptMembershipQuery {
  /** The conversation being sent, as the store knows it right now. */
  sessionId?: string | null
  /**
   * The desk a brand-new conversation was started from. Consulted only while
   * the conversation has no real session id — see `resolveDepartmentMembership`.
   */
  draftDepartmentId?: string | null
  departments: ReadonlyArray<Department> | null | undefined
  /** Manual filings by session id: the user's explicit ownership assertion. */
  filings?: Readonly<FilingMap> | null
  /**
   * The active task's routed department. `undefined` = no task, so the old join
   * answers; `null` = a task that is routed nowhere, which must *not* fall back
   * to the folder the conversation happened to run in.
   */
  taskDepartmentId?: string | null
  sessions?: ReadonlyArray<HandbookSessionRow> | null
  homeDir?: string
}

export type DeptMembership =
  | { kind: 'found'; dept: Department }
  | { kind: 'none' }
  /** Two nodes own the same directory, so the join cannot name one. */
  | { kind: 'ambiguous' }
  /** The stored tree was not a readable list. */
  | { kind: 'unreadable' }

/** A session id that is only a row placeholder waiting for the first result. */
function isPlaceholderSessionId(id: string): boolean {
  return id.startsWith('pending-')
}

/**
 * Read the handbook field without trusting it.
 *
 * The store is the only writer, but localStorage payloads can be hand-edited
 * or half-written. A non-string value is reported as unreadable rather than
 * treated as an empty handbook: "we couldn't read it" and "there is nothing in
 * it" are different statements, and only the first invites the user to fix
 * something.
 */
function readHandbookField(dept: Department):
  | { kind: 'absent' }
  | { kind: 'empty' }
  | { kind: 'text'; value: string }
  | { kind: 'unreadable'; reason: string } {
  const value = (dept as { handbook?: unknown }).handbook
  if (value === undefined || value === null) return { kind: 'absent' }
  if (typeof value !== 'string') {
    return { kind: 'unreadable', reason: 'the stored handbook is not text' }
  }
  if (!value.trim()) return { kind: 'empty' }
  return { kind: 'text', value }
}

/**
 * The node's name in the interface language.
 *
 * Mirrors `deptDisplayName` in `deptUtils`; kept local because a `lib/` module
 * should not import a view helper. A hand-edited node without a string name
 * falls back to its id, so the receipt can always name the department.
 */
function handbookDeptName(dept: Department, locale: 'en' | 'zh-CN' | undefined): string {
  const fallback = typeof dept.name === 'string' ? dept.name : dept.id
  const preset = dept.presetName
  if (!preset) return fallback
  return (locale === 'zh-CN' ? preset.zh : preset.en) || fallback
}

interface DeptIndex {
  byId: Map<string, Department>
  /** Lists, not single nodes: two nodes may own one directory. */
  byNormDir: Map<string, Department[]>
  bySlug: Map<string, Department[]>
}

function addToIndex(index: Map<string, Department[]>, key: string, dept: Department): void {
  const bucket = index.get(key)
  if (bucket) bucket.push(dept)
  else index.set(key, [dept])
}

function indexDepartments(
  departments: ReadonlyArray<Department>,
  homeDir?: string,
): DeptIndex {
  const byId = new Map<string, Department>()
  const byNormDir = new Map<string, Department[]>()
  const bySlug = new Map<string, Department[]>()
  for (const dept of departments) {
    if (!dept || typeof dept.id !== 'string' || !dept.id) continue
    // Every node is addressable by id — a processor without a folder still has
    // a handbook. Only the folder maps need a directory to be useful.
    byId.set(dept.id, dept)
    if (typeof dept.directory !== 'string' || !dept.directory) continue
    addToIndex(byNormDir, normalizePath(dept.directory, homeDir), dept)
    addToIndex(bySlug, dirToSlug(dept.directory), dept)
  }
  return { byId, byNormDir, bySlug }
}

function oneOf(bucket: Department[] | undefined): DeptMembership {
  if (!bucket || bucket.length === 0) return { kind: 'none' }
  // Distinct nodes, not the same node indexed twice.
  const ids = new Set(bucket.map(dept => dept.id))
  if (ids.size > 1) return { kind: 'ambiguous' }
  return { kind: 'found', dept: bucket[0] }
}

/**
 * Which org node the conversation being sent belongs to.
 *
 * Precedence, each step deliberately refusing to fall through to a weaker
 * signal once it has an answer:
 *
 *   filing → live node     the user said so; wins over task and folder
 *   filing → dead node     filed nowhere live — never re-filed by the folder
 *   task → routed dept     the task is the work; its department owns the rules
 *   task → unassigned      routed nowhere live — never re-filed by the folder
 *   session row → cwd      the engine's real directory, the strongest legacy join
 *   session row → slug     Claude's project directory name
 *   draft desk id          a brand-new conversation with no session row yet
 *   nothing                silence
 *
 * A duplicate directory (two nodes sharing one) is `ambiguous`, not "pick the
 * first": injecting one department's rules into another department's
 * conversation would be a quiet lie.
 */
export function resolveDepartmentMembership(input: DeptMembershipQuery): DeptMembership {
  const departments = input.departments
  // A missing array is a tree that was not read; an empty one is a user with no
  // departments. The first is unknown, the second is "no department".
  if (!Array.isArray(departments)) return { kind: 'unreadable' }

  const index = indexDepartments(departments, input.homeDir)
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId : ''
  const realSessionId = sessionId && !isPlaceholderSessionId(sessionId) ? sessionId : ''

  if (realSessionId) {
    const filing = input.filings?.[realSessionId]
    if (filing && typeof filing.deptId === 'string' && filing.deptId) {
      const dept = index.byId.get(filing.deptId)
      // A filing that outlived its node stays "filed nowhere live". Falling
      // back to the folder here would re-file the conversation under a node
      // the user never chose.
      return dept ? { kind: 'found', dept } : { kind: 'none' }
    }

    // A task owns its conversations. `undefined` means this send has no task,
    // so the legacy join below still answers; `null` means a task exists but is
    // routed nowhere, and the folder must not become its department.
    if (input.taskDepartmentId !== undefined) {
      if (input.taskDepartmentId === null) return { kind: 'none' }
      const dept = index.byId.get(input.taskDepartmentId)
      return dept ? { kind: 'found', dept } : { kind: 'none' }
    }

    const row = (input.sessions ?? []).find(
      session => session && session.sessionId === realSessionId,
    )
    if (row) {
      const cwd = typeof row.cwd === 'string' ? row.cwd : ''
      if (cwd) {
        const byDir = oneOf(index.byNormDir.get(normalizePath(cwd, input.homeDir)))
        if (byDir.kind !== 'none') return byDir
      }
      const slug = typeof row.projectSlug === 'string' ? row.projectSlug : ''
      if (slug) {
        const bySlug = oneOf(index.bySlug.get(slug))
        if (bySlug.kind !== 'none') return bySlug
      }
    }
  }

  // The draft's desk id is an assertion made by the department view at the
  // moment the conversation was started there, not a directory guess. It only
  // answers while the conversation has no session row of its own, and it must
  // still name a live node.
  const draftId = typeof input.draftDepartmentId === 'string' ? input.draftDepartmentId : ''
  if (draftId) {
    const dept = index.byId.get(draftId)
    if (dept) return { kind: 'found', dept }
  }

  return { kind: 'none' }
}

/**
 * Wrap handbook text in the block the model reads.
 *
 * The wrapper matches the one the old first-message path used, so a turn now
 * carries exactly what it used to carry — just on every turn. Truncation is
 * stated inside the block: the model must be able to tell that the rules it
 * was handed are incomplete.
 */
export function buildDeptHandbookBlock(raw: string): {
  text: string
  chars: number
  sourceChars: number
  truncated: boolean
} {
  const content = raw.trim()
  const sourceChars = content.length
  const truncated = sourceChars > DEPT_HANDBOOK_MAX_CHARS
  const body = truncated ? content.slice(0, DEPT_HANDBOOK_MAX_CHARS) : content
  const marker = truncated
    ? `\n\n[department handbook cut here: showing the first ${body.length} of ${sourceChars} characters]`
    : ''
  return {
    text: `<department_handbook>\n${body}${marker}\n</department_handbook>`,
    chars: body.length,
    sourceChars,
    truncated,
  }
}

/**
 * Resolve the conversation's department and build this turn's block.
 *
 * Never throws: a broken store entry degrades to a receipt the row can explain,
 * and a missing membership degrades to silence. The caller sends the turn
 * either way — the handbook is context, never a precondition.
 */
export function buildDeptHandbookTurn(
  input: DeptMembershipQuery & { locale?: 'en' | 'zh-CN' },
): DeptHandbookTurn {
  const membership = resolveDepartmentMembership(input)
  if (membership.kind !== 'found') return { text: '', receipt: null }

  const dept = membership.dept
  const field = readHandbookField(dept)
  // No handbook at all: nothing was given, so nothing is disclosed. Showing
  // "this department has no handbook" on every turn would turn an absence into
  // a claim the user never asked for.
  if (field.kind === 'absent') return { text: '', receipt: null }

  const base = {
    deptId: dept.id,
    deptName: handbookDeptName(dept, input.locale),
    chars: 0,
    sourceChars: 0,
    truncated: false,
  }

  if (field.kind === 'unreadable') {
    return { text: '', receipt: { ...base, unreadable: field.reason } }
  }

  if (field.kind === 'empty') {
    // Recorded, not rendered: the record says why this turn carried nothing,
    // while the row stays silent because nothing was given.
    return { text: '', receipt: { ...base, empty: true } }
  }

  const block = buildDeptHandbookBlock(field.value)
  return {
    text: block.text,
    receipt: {
      ...base,
      chars: block.chars,
      sourceChars: block.sourceChars,
      truncated: block.truncated,
      text: block.text,
    },
  }
}
