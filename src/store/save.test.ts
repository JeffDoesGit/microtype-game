import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  SAVE_VERSION,
  emptySave,
  loadSave,
  persistSave,
  problemKeys,
  recordAttempt,
  type Attempt,
  type Save,
  type StorageLike,
} from './save.ts'

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...seed }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

const KEY = 'hoops-type:save'

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    ts: 1000,
    mode: 'lesson',
    sourceId: 'l03',
    goalWpm: 30,
    wpm: 25,
    accuracy: 0.95,
    errors: 2,
    durationMs: 60_000,
    keyErrors: {},
    ...over,
  }
}

// --- load and migrate -------------------------------------------------------

test('an empty store yields a usable save', () => {
  const save = loadSave(fakeStorage())

  assert.equal(save.version, SAVE_VERSION)
  assert.deepEqual(save.history, [])
  assert.deepEqual(save.keyErrors, {})
})

test('a round trip preserves the save', () => {
  const storage = fakeStorage()
  const save = recordAttempt(emptySave(), attempt({ keyErrors: { e: 3 } }))

  persistSave(storage, save)
  assert.deepEqual(loadSave(storage), save)
})

test('corrupt data resets rather than throwing', () => {
  for (const raw of ['not json', '[]', 'null', '"string"', '42']) {
    const save = loadSave(fakeStorage({ [KEY]: raw }))
    assert.deepEqual(save, emptySave(), `failed on ${raw}`)
  }
})

test('an unknown schema version resets', () => {
  const stored = JSON.stringify({ ...emptySave(), version: 99, keyErrors: { e: 5 } })

  assert.deepEqual(loadSave(fakeStorage({ [KEY]: stored })), emptySave())
})

test('missing fields are filled in rather than left undefined', () => {
  const stored = JSON.stringify({ version: SAVE_VERSION })
  const save = loadSave(fakeStorage({ [KEY]: stored }))

  assert.deepEqual(save.lessons, {})
  assert.deepEqual(save.history, [])
  assert.equal(typeof save.settings.sound, 'boolean')
  assert.equal(typeof save.settings.reducedMotion, 'boolean')
})

test('storage that throws does not break the game', () => {
  const hostile: StorageLike = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('quota')
    },
  }

  assert.deepEqual(loadSave(hostile), emptySave())
  assert.doesNotThrow(() => persistSave(hostile, emptySave()))
})

// --- recording attempts -----------------------------------------------------

test('a lesson attempt records bests, passed, and attempt count', () => {
  const save = recordAttempt(emptySave(), attempt({ wpm: 25, goalWpm: 30 }))
  const record = save.lessons['l03']!

  assert.equal(record.bestWpm, 25)
  assert.equal(record.attempts, 1)
  assert.equal(record.passed, false)
})

test('bests only ever climb, and passed is sticky', () => {
  let save = recordAttempt(emptySave(), attempt({ wpm: 35, accuracy: 0.99, goalWpm: 30 }))
  save = recordAttempt(save, attempt({ wpm: 20, accuracy: 0.8, goalWpm: 30 }))

  const record = save.lessons['l03']!
  assert.equal(record.bestWpm, 35)
  assert.equal(record.bestAccuracy, 0.99)
  assert.equal(record.passed, true, 'a later bad run must not unpass a lesson')
  assert.equal(record.attempts, 2)
})

test('random and custom drills leave the lesson records alone', () => {
  let save = recordAttempt(emptySave(), attempt({ mode: 'random', sourceId: 'random:l03' }))
  save = recordAttempt(save, attempt({ mode: 'custom', sourceId: 'custom' }))

  assert.deepEqual(save.lessons, {})
  // They still belong in history.
  assert.equal(save.history.length, 2)
})

test('key errors accumulate across drills', () => {
  let save = recordAttempt(emptySave(), attempt({ keyErrors: { e: 2, r: 1 } }))
  save = recordAttempt(save, attempt({ keyErrors: { e: 3, t: 4 } }))

  assert.deepEqual(save.keyErrors, { e: 5, r: 1, t: 4 })
})

test('history caps at 200 entries, dropping the oldest', () => {
  let save: Save = emptySave()
  for (let i = 0; i < 205; i++) save = recordAttempt(save, attempt({ ts: i }))

  assert.equal(save.history.length, 200)
  assert.equal(save.history[0]!.ts, 5, 'the five oldest should have been dropped')
  assert.equal(save.history.at(-1)!.ts, 204)
})

test('recordAttempt does not mutate the save it was given', () => {
  const before = emptySave()
  const snapshot = structuredClone(before)

  recordAttempt(before, attempt({ keyErrors: { e: 1 } }))
  assert.deepEqual(before, snapshot)
})

// --- problem keys -----------------------------------------------------------

test('problem keys come back worst first', () => {
  assert.deepEqual(problemKeys({ e: 2, r: 9, t: 5 }), ['r', 't', 'e'])
})

test('problem keys break ties alphabetically so the panel holds still', () => {
  assert.deepEqual(problemKeys({ t: 3, e: 3, r: 3 }), ['e', 'r', 't'])
})

test('problem keys respect the limit and ignore zero counts', () => {
  assert.deepEqual(problemKeys({ a: 1, b: 2, c: 3, d: 4 }, 2), ['d', 'c'])
  assert.deepEqual(problemKeys({ a: 0, b: 1 }), ['b'])
  assert.deepEqual(problemKeys({}), [])
})
