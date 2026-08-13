/**
 * Three sample effects — make, brick, line complete (DESIGN.md §11 caps sound
 * design there).
 *
 * Synthesized with WebAudio rather than shipped as files: no runtime deps, no
 * assets, nothing to 404 on Pages. The context is created on the first
 * keystroke, because browsers refuse to start audio without a user gesture.
 */

export type Effect = 'make' | 'brick' | 'lineComplete'

export type Sound = {
  /** Safe to call on every keystroke; the context is only built once. */
  arm(): void
  play(effect: Effect): void
  setEnabled(enabled: boolean): void
  readonly enabled: boolean
}

type ContextFactory = () => AudioContext

function defaultFactory(): AudioContext {
  return new AudioContext()
}

export function createSound(
  enabled: boolean,
  makeContext: ContextFactory = defaultFactory,
): Sound {
  let on = enabled
  let ctx: AudioContext | null = null

  const tone = (
    at: number,
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): void => {
    if (!ctx) return
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(from, at)
    osc.frequency.exponentialRampToValueAtTime(to, at + duration)

    // A short exponential fall keeps a stream of six of these from turning
    // into a wall of sound.
    amp.gain.setValueAtTime(gain, at)
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    osc.connect(amp).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + duration)
  }

  return {
    get enabled() {
      return on
    },

    arm() {
      if (ctx || !on) return
      try {
        ctx = makeContext()
      } catch {
        // No audio available; the game is silent but otherwise unaffected.
        ctx = null
      }
    },

    setEnabled(next) {
      on = next
    },

    play(effect) {
      if (!on || !ctx) return
      const now = ctx.currentTime

      switch (effect) {
        case 'make':
          // Clean rise: the sound of it dropping through.
          tone(now, 620, 940, 0.12, 'sine', 0.16)
          break
        case 'brick':
          // Dull fall, well below the make so the two never blur together.
          tone(now, 190, 90, 0.16, 'square', 0.1)
          break
        case 'lineComplete':
          tone(now, 520, 660, 0.1, 'triangle', 0.14)
          tone(now + 0.1, 780, 880, 0.14, 'triangle', 0.14)
          break
      }
    },
  }
}
