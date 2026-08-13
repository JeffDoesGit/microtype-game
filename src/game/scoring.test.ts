import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyKey, createLineState } from './input.ts'
import { createScorer } from './scoring.ts'

/** Types a whole line and commits it, so the scorer sees real char states. */
function playLine(scorer: ReturnType<typeof createScorer>, target: string, typed: string): void {
  const state = createLineState(target)
  for (const key of typed) applyKey(state, key)
  scorer.commitLine(state)
}

test('the clock starts on the first keypress, not on load', () => {
  const scorer = createScorer()

  assert.equal(scorer.stats(50_000).elapsedMs, 0)

  scorer.keystroke(10_000)
  scorer.keystroke(70_000)
  assert.equal(scorer.stats(999_999).elapsedMs, 60_000)
})

test('an idle results screen cannot drag the rate down', () => {
  const scorer = createScorer()
  scorer.keystroke(0)
  scorer.keystroke(30_000)

  const atClose = scorer.stats(30_000)
  const muchLater = scorer.stats(600_000)
  assert.equal(atClose.elapsedMs, muchLater.elapsedMs)
  assert.equal(atClose.wpm, muchLater.wpm)
})

test('gwam counts correct characters over five, per minute', () => {
  const scorer = createScorer()
  scorer.keystroke(0)
  scorer.keystroke(60_000)
  // 50 clean characters in one minute is 10 gwam.
  playLine(scorer, 'he or she; for a fit; if she left the; a jak salad'.slice(0, 50), 'he or she; for a fit; if she left the; a jak salad'.slice(0, 50))

  const stats = scorer.stats(60_000)
  assert.equal(stats.correctChars, 50)
  assert.equal(stats.wpm, 10)
  assert.equal(stats.accuracy, 1)
})

test('a character that was ever wrong never counts, even after a fix', () => {
  const scorer = createScorer()
  const state = createLineState('he or')

  for (const key of 'hr') applyKey(state, key)
  applyKey(state, 'Backspace')
  for (const key of 'e or') applyKey(state, key)
  scorer.commitLine(state)

  const stats = scorer.stats(0)
  assert.equal(stats.totalChars, 5)
  assert.equal(stats.correctChars, 4)
  assert.equal(stats.accuracy, 0.8)
})

test('a basket scores at its current multiplier, then the streak grows', () => {
  const scorer = createScorer()

  scorer.recordMake() // 100 x 1
  assert.equal(scorer.stats(0).score, 100)
  assert.equal(scorer.stats(0).combo, 1.5)

  scorer.recordMake() // 100 x 1.5
  assert.equal(scorer.stats(0).score, 250)
  assert.equal(scorer.stats(0).combo, 2)
})

test('the multiplier caps at 4x', () => {
  const scorer = createScorer()
  for (let i = 0; i < 20; i++) scorer.recordMake()

  assert.equal(scorer.stats(0).combo, 4)
})

test('a miss resets the multiplier to 1x but keeps the score', () => {
  const scorer = createScorer()
  scorer.recordMake()
  scorer.recordMake()
  const earned = scorer.stats(0).score

  scorer.recordMiss()
  const stats = scorer.stats(0)
  assert.equal(stats.combo, 1)
  assert.equal(stats.score, earned)
  assert.equal(stats.misses, 1)
  assert.equal(stats.makes, 2)
})

test('an untouched drill reports zeroes, not NaN', () => {
  const stats = createScorer().stats(1000)

  assert.equal(stats.wpm, 0)
  assert.equal(stats.accuracy, 1)
  assert.equal(stats.score, 0)
  assert.equal(stats.elapsedMs, 0)
})

test('live wpm counts the line still being typed', () => {
  const scorer = createScorer()
  scorer.keystroke(0)

  const state = createLineState('he or she')
  for (const key of 'he or ') applyKey(state, key)
  scorer.keystroke(60_000)

  // Nothing committed yet, so an unaware scorer would report zero.
  assert.equal(scorer.stats(60_000).correctChars, 0)
  // Six clean characters in one minute is 1.2 gwam.
  assert.equal(scorer.liveWpm(60_000, state), 1.2)
})

test('live wpm excludes characters that were ever wrong', () => {
  const scorer = createScorer()
  scorer.keystroke(0)

  const clean = createLineState('he or she')
  for (const key of 'he or ') applyKey(clean, key)

  const fumbled = createLineState('he or she')
  for (const key of 'hx or ') applyKey(fumbled, key)

  scorer.keystroke(60_000)
  assert.ok(scorer.liveWpm(60_000, fumbled) < scorer.liveWpm(60_000, clean))
})

test('live wpm is smoothed over a 3-second window', () => {
  const scorer = createScorer()
  scorer.keystroke(0)
  scorer.keystroke(60_000)

  const state = createLineState('he or she')
  for (const key of 'he or she') applyKey(state, key)

  // Nothing typed yet reads as zero.
  assert.equal(scorer.liveWpm(60_000, createLineState('he or she')), 0)

  // A full line a moment later reads as the mean of both samples, not the
  // raw 1.8 — that averaging is what stops the rail jittering.
  assert.equal(scorer.liveWpm(60_500, state), 0.9)

  // Once the window has passed the slow sample by, the reading settles.
  assert.equal(scorer.liveWpm(70_000, state), 1.8)
})

test('live wpm with no line in progress reports the committed rate', () => {
  const scorer = createScorer()
  scorer.keystroke(0)
  scorer.keystroke(60_000)
  playLine(scorer, 'he or she', 'he or she')

  assert.equal(scorer.liveWpm(60_000, null), 1.8)
})
