/**
 * WPM, accuracy, score, and the combo multiplier (DESIGN.md §5).
 *
 * The scorer is fed by the same input events the shot queue consumes, plus each
 * line's final state at commit time. It owns no DOM and no timers — callers
 * pass `now`, so the whole thing is testable without a clock.
 */

import type { LineState } from './input.ts'

export type DrillStats = {
  score: number
  /** Current multiplier, 1 to 4 in half steps (§5). */
  combo: number
  makes: number
  misses: number
  correctChars: number
  totalChars: number
  elapsedMs: number
  wpm: number
  accuracy: number
}

/** §5: 100 points per made basket. */
const POINTS_PER_MAKE = 100
const COMBO_STEP = 0.5
const COMBO_CAP = 4
/** §5: smooth the live rate over this window so the rail does not jitter. */
const SMOOTHING_MS = 3000

export type Scorer = {
  /**
   * Called on every keypress. The first one starts the clock — §5 starts timing
   * at the first keypress of the drill, not on screen load — and each one marks
   * where the elapsed time currently ends.
   */
  keystroke(now: number): void
  recordMake(): void
  recordMiss(): void
  /** Fold a finished line's characters into the drill totals. */
  commitLine(state: LineState): void
  stats(now: number): DrillStats
  /**
   * Gwam including the line still being typed, smoothed over a 3-second window
   * (§5). Committed lines alone would leave the rail frozen mid-line.
   */
  liveWpm(now: number, current: LineState | null): number
}

/** Characters typed so far in `state` that have never been wrong. */
function cleanCharsSoFar(state: LineState): number {
  let clean = 0
  for (let i = 0; i < state.cursor; i++) {
    if (!state.chars[i]!.everWrong) clean += 1
  }
  return clean
}

export function createScorer(): Scorer {
  let startedAt: number | null = null
  let lastEventAt = 0
  let score = 0
  let combo = 1
  let makes = 0
  let misses = 0
  let correctChars = 0
  let totalChars = 0
  let samples: Array<{ at: number; wpm: number }> = []

  /** Raw gwam for a given clean-character count, over the elapsed clock. */
  const rateFor = (clean: number): number => {
    if (startedAt === null) return 0
    const elapsedMs = Math.max(0, Math.max(lastEventAt, startedAt) - startedAt)
    const minutes = elapsedMs / 60_000
    return minutes > 0 ? clean / 5 / minutes : 0
  }

  return {
    keystroke(now) {
      if (startedAt === null) startedAt = now
      lastEventAt = now
    },

    recordMake() {
      makes += 1
      // The basket scores at the multiplier it earned, then the streak grows.
      score += Math.round(POINTS_PER_MAKE * combo)
      combo = Math.min(COMBO_CAP, combo + COMBO_STEP)
    },

    recordMiss() {
      misses += 1
      combo = 1
    },

    commitLine(state) {
      // §5 counts only characters that were never wrong, so a backspaced fix
      // does not earn its character back.
      for (const char of state.chars) {
        totalChars += 1
        if (!char.everWrong) correctChars += 1
      }
    },

    liveWpm(now, current) {
      const clean = correctChars + (current ? cleanCharsSoFar(current) : 0)
      samples.push({ at: now, wpm: rateFor(clean) })
      samples = samples.filter((sample) => now - sample.at <= SMOOTHING_MS)

      const total = samples.reduce((sum, sample) => sum + sample.wpm, 0)
      return total / samples.length
    },

    stats(now) {
      // Once the drill is over the clock stops at the last keystroke, so an
      // idle results screen cannot drag the rate down.
      const end = Math.max(lastEventAt, startedAt ?? now)
      const elapsedMs = startedAt === null ? 0 : Math.max(0, end - startedAt)
      const minutes = elapsedMs / 60_000

      return {
        score,
        combo,
        makes,
        misses,
        correctChars,
        totalChars,
        elapsedMs,
        // §5 gwam: correct characters over five, per minute.
        wpm: minutes > 0 ? correctChars / 5 / minutes : 0,
        accuracy: totalChars > 0 ? correctChars / totalChars : 1,
      }
    },
  }
}
