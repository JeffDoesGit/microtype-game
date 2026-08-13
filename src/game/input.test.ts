import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  applyKey,
  createLineState,
  isLineComplete,
  wordIndexAt,
  type InputEvent,
  type LineState,
} from './input.ts'

/** Types a string one key at a time, returning every event in order. */
function type(state: LineState, keys: string): InputEvent[] {
  return [...keys].flatMap((key) => applyKey(state, key))
}

const makes = (events: InputEvent[]): number[] =>
  events.filter((e) => e.kind === 'make').map((e) => e.wordIndex)

const misses = (events: InputEvent[]): number[] =>
  events.filter((e) => e.kind === 'miss').map((e) => e.charIndex)

// --- word spans -------------------------------------------------------------

test('spans are contiguous and cover every index', () => {
  const state = createLineState('he or she;')
  assert.deepEqual(state.wordSpans, [
    [0, 2],
    [2, 5],
    [5, 10],
  ])
  assert.equal(state.wordSpans[0]![0], 0)
  assert.equal(state.wordSpans.at(-1)![1], state.chars.length)
  for (let i = 0; i < state.chars.length; i++) {
    assert.notEqual(wordIndexAt(state, i), -1, `index ${i} belongs to no word`)
  }
})

test('leading and trailing whitespace attach to the adjacent word', () => {
  const state = createLineState('  he or  ')
  assert.deepEqual(state.wordSpans, [
    [0, 4],
    [4, 9],
  ])
})

test('a blank line yields no spans and does not throw', () => {
  const state = createLineState('')
  assert.deepEqual(state.wordSpans, [])
  assert.deepEqual(applyKey(state, 'a'), [])
})

// --- rule 1: printable keys -------------------------------------------------

test('a clean word fires exactly one make, on its last character', () => {
  const state = createLineState('he or')

  assert.deepEqual(applyKey(state, 'h'), [])
  assert.deepEqual(applyKey(state, 'e'), [{ kind: 'make', wordIndex: 0 }])
  // The space after the word must not fire anything a second time.
  assert.deepEqual(applyKey(state, ' '), [])
})

test('a mistyped character fires a miss immediately and suppresses the make', () => {
  const state = createLineState('he or')
  const events = type(state, 'hr')

  assert.deepEqual(events, [{ kind: 'miss', wordIndex: 0, charIndex: 1 }])
  assert.equal(state.chars[1]!.typed, 'r')
  assert.equal(state.chars[1]!.everWrong, true)
  assert.equal(state.wordResolved[0], true)
})

test('each word resolves independently', () => {
  const state = createLineState('he or she')
  const events = type(state, 'hx or she')

  assert.deepEqual(makes(events), [1, 2])
  assert.deepEqual(misses(events), [1])
})

test('space where a letter belongs is a miss, and vice versa (rule 6)', () => {
  const lettersForSpace = createLineState('he or')
  assert.deepEqual(misses(type(lettersForSpace, 'hex')), [2])

  const spaceForLetter = createLineState('he or')
  assert.deepEqual(misses(type(spaceForLetter, 'h ')), [1])
})

test('a fumbled separator bricks the word it leads into', () => {
  const state = createLineState('he or')
  const events = type(state, 'hexor')

  assert.deepEqual(makes(events), [0])
  assert.deepEqual(
    events.filter((e) => e.kind === 'miss'),
    [{ kind: 'miss', wordIndex: 1, charIndex: 2 }],
  )
})

// --- rule 2: backspace ------------------------------------------------------

test('backspace clears the typed character but not everWrong', () => {
  const state = createLineState('he or')
  type(state, 'hr')

  assert.deepEqual(applyKey(state, 'Backspace'), [])
  assert.equal(state.cursor, 1)
  assert.equal(state.chars[1]!.typed, null)
  assert.equal(state.chars[1]!.everWrong, true)
})

test('backspace then a correct retype still fires no make (sticky everWrong)', () => {
  const state = createLineState('he or')
  type(state, 'hr')
  applyKey(state, 'Backspace')

  assert.deepEqual(applyKey(state, 'e'), [])
  assert.equal(state.chars[1]!.typed, 'e')
})

test('re-crossing a resolved boundary does not re-fire the make', () => {
  const state = createLineState('he or')
  assert.deepEqual(makes(type(state, 'he')), [0])

  applyKey(state, 'Backspace')
  assert.deepEqual(applyKey(state, 'e'), [])
})

test('backspace at line start is a no-op', () => {
  const state = createLineState('he or')

  assert.deepEqual(applyKey(state, 'Backspace'), [])
  assert.equal(state.cursor, 0)
  assert.equal(state.chars[0]!.typed, null)
})

test('backspace reopens a completed line', () => {
  const state = createLineState('he')
  type(state, 'he')
  assert.equal(isLineComplete(state), true)

  applyKey(state, 'Backspace')
  assert.equal(isLineComplete(state), false)
  assert.deepEqual(applyKey(state, 'Enter'), [])
})

// --- rules 4 and 5: end of line ---------------------------------------------

test('completing the line announces it, then Enter commits', () => {
  const state = createLineState('he')
  const events = type(state, 'he')

  assert.deepEqual(events, [{ kind: 'make', wordIndex: 0 }, { kind: 'lineComplete' }])
  assert.equal(state.committed, false)

  assert.deepEqual(applyKey(state, 'Enter'), [{ kind: 'lineCommitted' }])
  assert.equal(state.committed, true)
})

test('Enter mid-line does nothing', () => {
  const state = createLineState('he or')
  type(state, 'he')

  assert.deepEqual(applyKey(state, 'Enter'), [])
  assert.equal(state.committed, false)
  assert.equal(state.cursor, 2)
})

test('input past the end of the line is ignored (rule 5)', () => {
  const state = createLineState('he')
  type(state, 'he')

  assert.deepEqual(applyKey(state, 'x'), [])
  assert.equal(state.cursor, 2)
  assert.equal(state.chars.length, 2)
})

test('a committed line accepts no further input', () => {
  const state = createLineState('he')
  type(state, 'he')
  applyKey(state, 'Enter')

  assert.deepEqual(applyKey(state, 'Backspace'), [])
  assert.deepEqual(applyKey(state, 'Enter'), [])
  assert.equal(state.cursor, 2)
  assert.equal(state.committed, true)
})

// --- key filtering ----------------------------------------------------------

test('non-printable keys are ignored', () => {
  const state = createLineState('he')

  for (const key of ['Shift', 'ArrowLeft', 'Tab', 'Escape', 'F1', 'Dead']) {
    assert.deepEqual(applyKey(state, key), [])
  }
  assert.equal(state.cursor, 0)
})

// --- a full drill line ------------------------------------------------------

test('a full clean line makes every word once', () => {
  const line = 'he or she; for a fit; if she left the; a jak salad'
  const state = createLineState(line)
  const events = type(state, line)

  const wordCount = line.split(/\s+/).length
  assert.equal(state.wordSpans.length, wordCount)
  assert.deepEqual(makes(events), [...Array(wordCount).keys()])
  assert.equal(misses(events).length, 0)
  assert.deepEqual(events.at(-1), { kind: 'lineComplete' })
})
