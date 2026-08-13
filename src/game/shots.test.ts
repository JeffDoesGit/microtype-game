import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  arcPoint,
  createShot,
  createShotQueue,
  shotAt,
  type Vec2,
} from './shots.ts'

const SHOOTER: Vec2 = { x: 800, y: 726 }
const HOOP: Vec2 = { x: 400, y: 214 }
const moving = { instant: () => false }

test('an arc starts at the shooter and ends at the target', () => {
  const shot = createShot(SHOOTER, HOOP, 'make', 0, 0)

  assert.deepEqual(arcPoint(shot, 0), SHOOTER)
  assert.deepEqual(arcPoint(shot, 1), shot.end)
  // A make terminates at the rim center.
  assert.deepEqual(shot.end, HOOP)
})

test('the arc rises above both endpoints', () => {
  const shot = createShot(SHOOTER, HOOP, 'make', 0, 0)
  const apex = arcPoint(shot, 0.5)

  assert.ok(apex.y < HOOP.y, 'apex should sit above the hoop')
  assert.ok(apex.y < SHOOTER.y)
})

test('duration scales with distance, inside the range §4 gives', () => {
  const near = createShot(SHOOTER, { x: 800, y: 396 }, 'make', 0, 0)
  const far = createShot(SHOOTER, { x: 120, y: 186 }, 'make', 0, 0)

  assert.ok(near.duration >= 380 && near.duration <= 520)
  assert.ok(far.duration >= 380 && far.duration <= 520)
  assert.ok(far.duration > near.duration)
})

test('missKind is deterministic from the seed and covers all three kinds', () => {
  const kinds = [0, 1, 2, 3].map((seed) => createShot(SHOOTER, HOOP, 'miss', seed, 0).missKind)

  assert.deepEqual(kinds, ['rim', 'backboard', 'air', 'rim'])
  // Same mistake, same look.
  assert.equal(
    createShot(SHOOTER, HOOP, 'miss', 7, 0).missKind,
    createShot(SHOOTER, HOOP, 'miss', 7, 999).missKind,
  )
})

test('a make ends at the rim, every miss ends away from it', () => {
  assert.deepEqual(createShot(SHOOTER, HOOP, 'make', 0, 0).end, HOOP)

  for (const seed of [0, 1, 2]) {
    const miss = createShot(SHOOTER, HOOP, 'miss', seed, 0)
    const off = Math.hypot(miss.end.x - HOOP.x, miss.end.y - HOOP.y)
    assert.ok(off > 10, `${miss.missKind} should not end on the rim`)
  }
})

test('a shot flies, drops, then retires', () => {
  const shot = createShot(SHOOTER, HOOP, 'make', 0, 1000)

  assert.equal(shotAt(shot, 1000).phase, 'flight')
  assert.equal(shotAt(shot, 1000 + shot.duration / 2).phase, 'flight')
  assert.equal(shotAt(shot, 1000 + shot.duration + 50).phase, 'drop')
  assert.equal(shotAt(shot, 1000 + shot.duration + 5000).phase, 'done')
})

test('the trail advances with the ball and never runs ahead of it', () => {
  const shot = createShot(SHOOTER, HOOP, 'make', 0, 0)

  assert.equal(shotAt(shot, 0).progress, 0)
  const mid = shotAt(shot, shot.duration / 2)
  assert.ok(mid.progress > 0 && mid.progress < 1)
  assert.equal(shotAt(shot, shot.duration).progress, 1)
})

test('the queue keeps every shot of the line as the shot chart', () => {
  const queue = createShotQueue(SHOOTER, moving)

  queue.fire(HOOP, 'make', 0, 0)
  queue.fire(HOOP, 'miss', 1, 10)
  assert.equal(queue.shots.length, 2)

  // Long after both have landed, the chart still holds them.
  assert.equal(queue.isAnimating(9000), false)
  assert.equal(queue.shots.length, 2)
})

test('in-flight balls are capped at six, oldest dropped first', () => {
  const queue = createShotQueue(SHOOTER, moving)

  for (let i = 0; i < 6; i++) queue.fire(HOOP, 'make', i, 0)
  assert.equal(queue.shots.filter((s) => shotAt(s, 0).phase === 'flight').length, 6)

  queue.fire(HOOP, 'make', 6, 0)
  const inFlight = queue.shots.filter((s) => shotAt(s, 0).phase === 'flight')
  assert.equal(inFlight.length, 6)
  assert.equal(queue.shots[0]!.cut, true, 'the oldest ball should be the one dropped')
  // Dropping a ball must not drop its trail.
  assert.equal(queue.shots.length, 7)
})

test('clear() empties the chart at the line boundary', () => {
  const queue = createShotQueue(SHOOTER, moving)
  queue.fire(HOOP, 'make', 0, 0)

  queue.clear()
  assert.equal(queue.shots.length, 0)
})

test('reduced motion lands a shot instantly with a full trail', () => {
  const queue = createShotQueue(SHOOTER, { instant: () => true })
  const shot = queue.fire(HOOP, 'make', 0, 0)

  assert.equal(shotAt(shot, 0).phase, 'done')
  assert.equal(shotAt(shot, 0).progress, 1)
})
