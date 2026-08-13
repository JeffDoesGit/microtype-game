/**
 * localStorage read/write/migrate (DESIGN.md §7).
 *
 * Storage is injected rather than reached for, so every rule here — the history
 * cap, the migration path, the merge of key errors — is testable without a
 * browser. The pure functions take a Save and return a new one; only
 * `persistSave` touches the outside world.
 */

const KEY = 'hoops-type:save'

/** Bump when the shape changes, and add a case to `migrate`. */
export const SAVE_VERSION = 1

/** §7: cap history at 200 entries, FIFO. */
const HISTORY_CAP = 200

export type DrillMode = 'lesson' | 'random' | 'custom'

export type LessonRecord = {
  bestWpm: number
  bestAccuracy: number
  passed: boolean
  attempts: number
}

export type HistoryEntry = {
  ts: number
  mode: DrillMode
  sourceId: string
  wpm: number
  accuracy: number
  errors: number
  durationMs: number
}

export type Save = {
  version: typeof SAVE_VERSION
  lessons: Record<string, LessonRecord>
  history: HistoryEntry[]
  /** Per-character miss counts — the highest-value thing in the schema (§7). */
  keyErrors: Record<string, number>
  settings: { sound: boolean; reducedMotion: boolean }
}

/** Just the bits of the Storage API this module uses, so tests can fake it. */
export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function emptySave(): Save {
  return {
    version: SAVE_VERSION,
    lessons: {},
    history: [],
    keyErrors: {},
    settings: { sound: true, reducedMotion: false },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Bring any stored shape up to the current version. Unknown or unreadable data
 * resets rather than throwing: a corrupt save must never stop someone typing.
 */
function migrate(raw: unknown): Save {
  if (!isRecord(raw)) return emptySave()
  if (raw['version'] !== SAVE_VERSION) return emptySave()

  const base = emptySave()
  const settings = isRecord(raw['settings']) ? raw['settings'] : {}

  return {
    version: SAVE_VERSION,
    lessons: isRecord(raw['lessons']) ? (raw['lessons'] as Save['lessons']) : base.lessons,
    history: Array.isArray(raw['history']) ? (raw['history'] as HistoryEntry[]) : base.history,
    keyErrors: isRecord(raw['keyErrors']) ? (raw['keyErrors'] as Save['keyErrors']) : base.keyErrors,
    settings: {
      sound: typeof settings['sound'] === 'boolean' ? settings['sound'] : base.settings.sound,
      reducedMotion:
        typeof settings['reducedMotion'] === 'boolean'
          ? settings['reducedMotion']
          : base.settings.reducedMotion,
    },
  }
}

export function loadSave(storage: StorageLike): Save {
  let raw: string | null
  try {
    raw = storage.getItem(KEY)
  } catch {
    // Private-mode browsers can throw on access alone.
    return emptySave()
  }
  if (raw === null) return emptySave()

  try {
    return migrate(JSON.parse(raw))
  } catch {
    return emptySave()
  }
}

export function persistSave(storage: StorageLike, save: Save): void {
  try {
    storage.setItem(KEY, JSON.stringify(save))
  } catch {
    // A full or blocked quota is not worth interrupting a drill over.
  }
}

export type Attempt = {
  ts: number
  mode: DrillMode
  sourceId: string
  goalWpm: number
  wpm: number
  accuracy: number
  errors: number
  durationMs: number
  keyErrors: Record<string, number>
}

/**
 * Fold one finished drill into the save. Pure — the caller decides when to
 * persist the result.
 */
export function recordAttempt(save: Save, attempt: Attempt): Save {
  const keyErrors = { ...save.keyErrors }
  for (const [char, count] of Object.entries(attempt.keyErrors)) {
    keyErrors[char] = (keyErrors[char] ?? 0) + count
  }

  const lessons = { ...save.lessons }
  // Random and custom drills have no lesson to be a personal best for.
  if (attempt.mode === 'lesson') {
    const previous = lessons[attempt.sourceId]
    lessons[attempt.sourceId] = {
      bestWpm: Math.max(previous?.bestWpm ?? 0, attempt.wpm),
      bestAccuracy: Math.max(previous?.bestAccuracy ?? 0, attempt.accuracy),
      passed: (previous?.passed ?? false) || attempt.wpm >= attempt.goalWpm,
      attempts: (previous?.attempts ?? 0) + 1,
    }
  }

  const entry: HistoryEntry = {
    ts: attempt.ts,
    mode: attempt.mode,
    sourceId: attempt.sourceId,
    wpm: attempt.wpm,
    accuracy: attempt.accuracy,
    errors: attempt.errors,
    durationMs: attempt.durationMs,
  }

  return {
    ...save,
    lessons,
    keyErrors,
    history: [...save.history, entry].slice(-HISTORY_CAP),
  }
}

/**
 * The worst keys, worst first (§7). Ties break alphabetically so the panel
 * doesn't reshuffle between renders for no reason.
 */
export function problemKeys(keyErrors: Record<string, number>, limit = 5): string[] {
  return Object.entries(keyErrors)
    .filter(([, count]) => count > 0)
    .sort(([aChar, aCount], [bChar, bCount]) => bCount - aCount || aChar.localeCompare(bChar))
    .slice(0, limit)
    .map(([char]) => char)
}
