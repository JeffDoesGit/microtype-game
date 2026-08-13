import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  arcPoint,
  createShot,
  createShotQueue,
  shotAt,
  type Vec2,
} from './shots.ts'

const SLOT: Vec2 = { x: 400, y: 566 }
const HOOP: Vec2 = { x: 800, y: 196 }
const moving = { instant: () => false }

test('an arc starts at the shooter and ends at the target', () => {
  const shot = createShot(SLOT, HOOP, 'make', 0, 0)

  assert.deepEqual(arcPoint(shot, 0), SLOT)
  assert.deepEqual(arcPoint(shot, 1), shot.end)
  // A make terminates at the rim center.
  assert.deepEqual(shot.end, HOOP)
})

test('the arc rises above both endpoints', () => {
  const shot = createShot(SLOT, HOOP, 'make', 0, 0)
  const apex = arcPoint(shot, 0.5)

  assert.ok(apex.y < HOOP.y, 'apex should sit above the hoop')
  assert.ok(apex.y < SLOT.y)
})

test('duration scales with distance, inside the range §4 gives', () => {
  const near = createShot(SLOT, { x: 800, y: 396 }, 'make', 0, 0)
  const far = createShot(SLOT, { x: 120, y: 186 }, 'make', 0, 0)

  assert.ok(near.duration >= 380 && near.duration <= 520)
  assert.ok(far.duration >= 380 && far.duration <= 520)
  assert.ok(far.duration > near.duration)
})

test('missKind is deterministic from the seed and covers all three kinds', () => {
  const kinds = [0, 1, 2, 3].map((seed) => createShot(SLOT, HOOP, 'miss', seed, 0).missKind)

  assert.deepEqual(kinds, ['rim', 'backboard', 'air', 'rim'])
  // Same mistake, same look.
  assert.equal(
    createShot(SLOT, HOOP, 'miss', 7, 0).missKind,
    createShot(SLOT, HOOP, 'miss', 7, 999).missKind,
  )
})

test('a make ends at the rim, every miss ends away from it', () => {
  assert.deepEqual(createShot(SLOT, HOOP, 'make', 0, 0).end, HOOP)

  for (const seed of [0, 1, 2]) {
    const miss = createShot(SLOT, HOOP, 'miss', seed, 0)
    const off = Math.hypot(miss.end.x - HOOP.x, miss.end.y - HOOP.y)
    assert.ok(off > 10, `${miss.missKind} should not end on the rim`)
  }
})

test('a shot flies, drops, then retires', () => {
  const shot = createShot(SLOT, HOOP, 'make', 0, 1000)

  assert.equal(shotAt(shot, 1000).phase, 'flight')
  assert.equal(shotAt(shot, 1000 + shot.duration / 2).phase, 'flight')
  assert.equal(shotAt(shot, 1000 + shot.duration + 50).phase, 'drop')
  assert.equal(shotAt(shot, 1000 + shot.duration + 5000).phase, 'done')
})

test('the ball travels from its slot toward the hoop', () => {
  const shot = createShot(SLOT, HOOP, 'make', 0, 0)
  const start = shotAt(shot, 0)
  const mid = shotAt(shot, shot.duration / 2)

  assert.equal(start.phase, 'flight')
  assert.equal(mid.phase, 'flight')
  if (start.phase !== 'flight' || mid.phase !== 'flight') return
  // Slot is left of the hoop, so the ball tracks rightward across the court.
  assert.ok(mid.at.x > start.at.x)
})

test('retired shots leave nothing behind on the court', () => {
  const queue = createShotQueue(HOOP, moving)

  queue.fire(SLOT, 'make', 0, 0)
  queue.fire(SLOT, 'miss', 1, 10)
  assert.equal(queue.shots.length, 2)

  // Firing again once the earlier two have landed prunes them.
  queue.fire(SLOT, 'make', 2, 9000)
  assert.equal(queue.shots.length, 1)
  assert.equal(queue.isAnimating(20000), false)
})

test('in-flight balls are capped at six, oldest dropped first', () => {
  const queue = createShotQueue(HOOP, moving)

  for (let i = 0; i < 6; i++) queue.fire(SLOT, 'make', i, 0)
  assert.equal(queue.shots.filter((s) => shotAt(s, 0).phase === 'flight').length, 6)

  queue.fire(SLOT, 'make', 6, 0)
  const inFlight = queue.shots.filter((s) => shotAt(s, 0).phase === 'flight')
  assert.equal(inFlight.length, 6)
  assert.equal(queue.shots[0]!.cut, true, 'the oldest ball should be the one dropped')
})

test('clear() empties the queue at the line boundary', () => {
  const queue = createShotQueue(HOOP, moving)
  queue.fire(SLOT, 'make', 0, 0)

  queue.clear()
  assert.equal(queue.shots.length, 0)
})

test('reduced motion lands a shot with no travel', () => {
  const queue = createShotQueue(HOOP, { instant: () => true })
  const shot = queue.fire(SLOT, 'make', 0, 0)

  assert.equal(shotAt(shot, 0).phase, 'done')
})
