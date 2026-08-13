import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSound } from './sound.ts'

/** Enough of WebAudio to see what the module asks for, and nothing more. */
function fakeContext() {
  const started: Array<{ type: string; from: number }> = []
  const ctx = {
    currentTime: 0,
    destination: {},
    started,
    createOscillator() {
      const osc = {
        type: 'sine' as string,
        frequency: {
          setValueAtTime(value: number) {
            osc.from = value
          },
          exponentialRampToValueAtTime() {},
        },
        from: 0,
        connect: (node: unknown) => node,
        start() {
          started.push({ type: osc.type, from: osc.from })
        },
        stop() {},
      }
      return osc
    },
    createGain() {
      const gain = {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: (node: unknown) => node,
      }
      return gain
    },
  }
  return ctx
}

test('nothing plays before the context is armed', () => {
  const ctx = fakeContext()
  const sound = createSound(true, () => ctx as unknown as AudioContext)

  sound.play('make')
  assert.equal(ctx.started.length, 0)
})

test('arming once is enough, however often it is called', () => {
  let built = 0
  const ctx = fakeContext()
  const sound = createSound(true, () => {
    built += 1
    return ctx as unknown as AudioContext
  })

  sound.arm()
  sound.arm()
  sound.arm()
  assert.equal(built, 1)
})

test('each effect makes a sound, and line complete is two notes', () => {
  const ctx = fakeContext()
  const sound = createSound(true, () => ctx as unknown as AudioContext)
  sound.arm()

  sound.play('make')
  assert.equal(ctx.started.length, 1)

  sound.play('brick')
  assert.equal(ctx.started.length, 2)

  sound.play('lineComplete')
  assert.equal(ctx.started.length, 4)
})

test('a brick sounds lower than a make, so the two never blur', () => {
  const ctx = fakeContext()
  const sound = createSound(true, () => ctx as unknown as AudioContext)
  sound.arm()

  sound.play('make')
  sound.play('brick')
  assert.ok(ctx.started[1]!.from < ctx.started[0]!.from)
})

test('a muted game builds no context and plays nothing', () => {
  let built = 0
  const sound = createSound(false, () => {
    built += 1
    return fakeContext() as unknown as AudioContext
  })

  sound.arm()
  sound.play('make')
  assert.equal(built, 0)
  assert.equal(sound.enabled, false)
})

test('unmuting mid-drill starts working after the next arm', () => {
  const ctx = fakeContext()
  const sound = createSound(false, () => ctx as unknown as AudioContext)

  sound.arm()
  sound.setEnabled(true)
  sound.arm()
  sound.play('make')

  assert.equal(sound.enabled, true)
  assert.equal(ctx.started.length, 1)
})

test('audio that refuses to start leaves the game silent, not broken', () => {
  const sound = createSound(true, () => {
    throw new Error('no audio device')
  })

  assert.doesNotThrow(() => sound.arm())
  assert.doesNotThrow(() => sound.play('make'))
})
