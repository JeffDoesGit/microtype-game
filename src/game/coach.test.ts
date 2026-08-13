import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ERROR_RATE_THRESHOLD, coachTip, reportLine, shouldInterject } from './coach.ts'
import { applyKey, createLineState } from './input.ts'

function play(target: string, typed: string) {
  const state = createLineState(target)
  for (const key of typed) applyKey(state, key)
  return state
}

test('a clean line reports no errors', () => {
  const report = reportLine(play('he or she', 'he or she'))

  assert.equal(report.errorRate, 0)
  assert.deepEqual(report.missedKeys, [])
})

test('the error rate is wrong characters over line length', () => {
  // Two wrong characters in a nine-character line.
  const report = reportLine(play('he or she', 'hx ot she'))

  assert.equal(report.errorRate, 2 / 9)
  assert.deepEqual(report.missedKeys.sort(), ['e', 'r'])
})

test('a backspaced fix still counts against the line', () => {
  const state = createLineState('he or she')
  for (const key of 'hx') applyKey(state, key)
  applyKey(state, 'Backspace')
  for (const key of 'e or she') applyKey(state, key)

  assert.equal(reportLine(state).errorRate, 1 / 9)
})

test('missed keys come back worst first', () => {
  // Three misses on "e", one on "r".
  const report = reportLine(play('re ee er', 'rx xx xr'))

  assert.equal(report.missedKeys[0], 'e')
})

test('an empty line reports zero rather than dividing by zero', () => {
  assert.equal(reportLine(createLineState('')).errorRate, 0)
})

test('interjection needs the rate above the threshold', () => {
  const under = { errorRate: ERROR_RATE_THRESHOLD, missedKeys: ['e'] }
  const over = { errorRate: ERROR_RATE_THRESHOLD + 0.01, missedKeys: ['e'] }

  assert.equal(shouldInterject(under, false), false)
  assert.equal(shouldInterject(over, false), true)
})

test('the drill is only interrupted once', () => {
  const bad = { errorRate: 0.5, missedKeys: ['e'] }

  assert.equal(shouldInterject(bad, false), true)
  assert.equal(shouldInterject(bad, true), false)
})

test('the tip names the keys that were actually missed', () => {
  assert.match(coachTip({ errorRate: 0.3, missedKeys: ['e'] }), /The e key/)

  // Letters chosen to be absent from the surrounding sentence, so the check
  // is about the key list rather than the boilerplate around it.
  const many = coachTip({ errorRate: 0.3, missedKeys: ['q', 'x', 'z', 'b'] })
  assert.match(many, /Watch the q, x and z keys/)
  assert.ok(!many.includes('b'), 'the tip should stop at three keys')
})

test('punctuation keys are named, not printed bare', () => {
  assert.match(coachTip({ errorRate: 0.3, missedKeys: [' '] }), /space/)
  assert.match(coachTip({ errorRate: 0.3, missedKeys: [';'] }), /semicolon/)
})

test('a tip is still produced when no keys are recorded', () => {
  assert.ok(coachTip({ errorRate: 0.3, missedKeys: [] }).length > 0)
})
