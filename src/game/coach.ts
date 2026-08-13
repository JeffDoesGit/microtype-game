/**
 * Coach interjections (DESIGN.md §5).
 *
 * Ported sparingly: one card, at most once per drill, and the tip names the
 * keys that actually got missed rather than offering posture advice.
 */

import type { LineState } from './input.ts'

/** §5: a line ending above this error rate earns an interruption. */
export const ERROR_RATE_THRESHOLD = 0.15

export type LineReport = {
  errorRate: number
  /** Characters that were mistyped in this line, worst first. */
  missedKeys: string[]
}

/** Prints a key the way the card should show it. */
function describe(key: string): string {
  if (key === ' ') return 'space'
  if (key === ';') return 'semicolon'
  if (key === ',') return 'comma'
  if (key === '.') return 'period'
  if (key === "'") return 'apostrophe'
  return key
}

export function reportLine(state: LineState): LineReport {
  const counts = new Map<string, number>()
  let wrong = 0

  for (const char of state.chars) {
    if (!char.everWrong) continue
    wrong += 1
    counts.set(char.target, (counts.get(char.target) ?? 0) + 1)
  }

  const missedKeys = [...counts.entries()]
    .sort(([aKey, aCount], [bKey, bCount]) => bCount - aCount || aKey.localeCompare(bKey))
    .map(([key]) => key)

  return {
    errorRate: state.chars.length === 0 ? 0 : wrong / state.chars.length,
    missedKeys,
  }
}

export function shouldInterject(report: LineReport, alreadyInterjected: boolean): boolean {
  return !alreadyInterjected && report.errorRate > ERROR_RATE_THRESHOLD
}

/**
 * One concrete tip, built from the keys that were actually missed (§5). Falls
 * back to a general line only when the miss set is somehow empty, which the
 * threshold makes unlikely.
 */
export function coachTip(report: LineReport): string {
  const worst = report.missedKeys.slice(0, 3).map(describe)

  if (worst.length === 0) return 'Slow down and let each key land before the next.'
  if (worst.length === 1) return `The ${worst[0]} key cost you this line. Slow down and place it.`

  const last = worst.pop()!
  return `Watch the ${worst.join(', ')} and ${last} keys. Slow down and place them.`
}
