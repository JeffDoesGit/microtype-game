/**
 * Keystroke -> LineState. The rules in DESIGN.md §3, in isolation.
 *
 * No DOM, no canvas, no timers: this module owns the typing state machine and
 * emits the shot events the court will later consume (§4). Build order step 2.
 */

export type CharState = {
  target: string
  typed: string | null
  everWrong: boolean // sticky — survives backspace
}

/** Inclusive start, exclusive end. */
export type WordSpan = [number, number]

export type LineState = {
  chars: CharState[]
  cursor: number // index of next char to type
  wordSpans: WordSpan[]
  wordResolved: boolean[]
  /** Set by Enter once the line is complete (§3 rule 4). */
  committed: boolean
}

/**
 * What the shot system (§4) and scoring (§5) subscribe to. `charIndex` on a
 * miss is what §4 uses to pick `missKind` deterministically, so the same
 * mistake always looks the same.
 */
export type InputEvent =
  | { kind: 'make'; wordIndex: number }
  | { kind: 'miss'; wordIndex: number; charIndex: number }
  | { kind: 'lineComplete' }
  | { kind: 'lineCommitted' }

/**
 * Spans are contiguous and cover every index in the line: each word's span
 * absorbs the whitespace *following* it, and the last span runs to end of line.
 *
 * §3 leaves this underspecified — it defines a span per word but also says
 * every miss fires "at the hoop for the current word", which requires every
 * index, separators included, to belong to exactly one word. Attaching the
 * separator to the word it follows means a word resolves when you hit the
 * space after it, and that the space is part of the word for correctness: fumble
 * it and the word is already dirty when it resolves, so it never launches a
 * ball. No word can brick after it has scored.
 */
function computeWordSpans(line: string): WordSpan[] {
  const words = [...line.matchAll(/\S+/g)]
  if (words.length === 0) return []

  return words.map((word, i) => {
    const next = words[i + 1]
    // Leading whitespace joins the first word; the last span runs to the end of
    // the line, so §3 rule 4 resolves it exactly when the cursor gets there.
    const start = i === 0 ? 0 : word.index
    const end = next === undefined ? line.length : next.index
    return [start, end]
  })
}

export function createLineState(line: string): LineState {
  const chars: CharState[] = [...line].map((target) => ({
    target,
    typed: null,
    everWrong: false,
  }))
  const wordSpans = computeWordSpans(line)
  return {
    chars,
    cursor: 0,
    wordSpans,
    wordResolved: wordSpans.map(() => false),
    committed: false,
  }
}

/** Index of the word whose span contains `index`, or -1 for a blank line. */
export function wordIndexAt(state: LineState, index: number): number {
  return state.wordSpans.findIndex(([start, end]) => index >= start && index < end)
}

function isClean(state: LineState, [start, end]: WordSpan): boolean {
  for (let i = start; i < end; i++) {
    if (state.chars[i]!.everWrong) return false
  }
  return true
}

export function isLineComplete(state: LineState): boolean {
  return state.cursor >= state.chars.length
}

/**
 * A single printable character. Space counts (§3 rule 6) — callers pass
 * `KeyboardEvent.key`, which is one code unit for printable keys and a
 * multi-character name ('Shift', 'ArrowLeft') for everything else.
 * Chorded keys are the caller's problem: skip anything with ctrl/meta held.
 */
function isPrintable(key: string): boolean {
  return [...key].length === 1
}

function applyPrintable(state: LineState, key: string): InputEvent[] {
  // Rule 5: input past the end of the line is ignored, no overflow characters.
  if (state.committed || isLineComplete(state)) return []

  const index = state.cursor
  const char = state.chars[index]!
  const wordIndex = wordIndexAt(state, index)
  const events: InputEvent[] = []

  // Rule 1.
  char.typed = key
  if (key !== char.target) {
    char.everWrong = true
    events.push({ kind: 'miss', wordIndex, charIndex: index })
  }
  state.cursor = index + 1

  // Rule 3: crossing a word boundary forward resolves that word, once.
  const span = state.wordSpans[wordIndex]
  if (span && state.cursor >= span[1] && !state.wordResolved[wordIndex]) {
    state.wordResolved[wordIndex] = true
    if (isClean(state, span)) events.push({ kind: 'make', wordIndex })
  }

  // Rule 4: the final word resolves above; the line now awaits Enter.
  if (isLineComplete(state)) events.push({ kind: 'lineComplete' })
  return events
}

/** Rule 2: no shot fired, no shot un-fired. `everWrong` and `wordResolved` stand. */
function applyBackspace(state: LineState): InputEvent[] {
  if (state.committed || state.cursor === 0) return []
  state.cursor -= 1
  state.chars[state.cursor]!.typed = null
  return []
}

/** Rule 4: Enter commits, but only once the line is fully typed. */
function applyEnter(state: LineState): InputEvent[] {
  if (state.committed || !isLineComplete(state)) return []
  state.committed = true
  return [{ kind: 'lineCommitted' }]
}

/** Applies one key, mutating `state`, and returns the events it produced. */
export function applyKey(state: LineState, key: string): InputEvent[] {
  if (key === 'Backspace') return applyBackspace(state)
  if (key === 'Enter') return applyEnter(state)
  if (isPrintable(key)) return applyPrintable(state, key)
  return []
}
