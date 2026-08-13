/**
 * The content layer (DESIGN.md §6). Three sources, one interface — everything
 * downstream consumes lines and never learns where they came from.
 */

import lessonData from './lessons.json' with { type: 'json' }
import wordbankData from './wordbank.json' with { type: 'json' }

export interface DrillSource {
  id: string
  title: string
  goalWpm: number
  getLines(): string[]
}

export type Lesson = {
  id: string
  title: string
  goalWpm: number
  /**
   * Physical keys this lesson adds. `Shift` is a key like any other: once it
   * has been taught, capitals are in play.
   */
  newKeys: string[]
  lines: string[]
}

export const LESSONS: Lesson[] = lessonData
export const WORDBANK: string[] = wordbankData

/** §6 assembles random lines in this range; §6 gives lessons 40–60. */
const RANDOM_MIN = 45
const RANDOM_MAX = 55
const CUSTOM_TARGET = 50
/** How much more often a word carrying one of the tier's new keys is picked. */
const NEW_KEY_WEIGHT = 3

export function lessonIndex(id: string): number {
  return LESSONS.findIndex((lesson) => lesson.id === id)
}

/**
 * Every character a player has been taught by the end of `index`. Space is
 * always allowed; `Shift` unlocks the uppercase of every letter known.
 */
export function allowedCharsThrough(index: number): Set<string> {
  const allowed = new Set<string>([' '])
  let shift = false

  for (const lesson of LESSONS.slice(0, index + 1)) {
    for (const key of lesson.newKeys) {
      if (key === 'Shift') shift = true
      else allowed.add(key)
    }
  }

  if (shift) {
    for (const char of [...allowed]) {
      if (/[a-z]/.test(char)) allowed.add(char.toUpperCase())
    }
  }
  return allowed
}

/** The full character set the game supports, used to police custom text. */
export function supportedChars(): Set<string> {
  return allowedCharsThrough(LESSONS.length - 1)
}

function usesOnly(word: string, allowed: Set<string>): boolean {
  return [...word].every((char) => allowed.has(char))
}

// --- lessons ---------------------------------------------------------------

export function createLessonSource(id: string): DrillSource {
  const index = lessonIndex(id)
  const lesson = LESSONS[index]
  if (!lesson) throw new Error(`unknown lesson: ${id}`)

  return {
    id: lesson.id,
    title: lesson.title,
    goalWpm: lesson.goalWpm,
    getLines: () => [...lesson.lines],
  }
}

// --- random ----------------------------------------------------------------

export type RandomOptions = {
  lineCount?: number
  /** Injectable so drills can be reproduced in tests. */
  rng?: () => number
}

/**
 * Words drawn from the bank filtered to the tier's character set, weighted
 * toward the tier's newest keys, assembled into lines at word boundaries (§6).
 */
export function createRandomSource(tierId: string, options: RandomOptions = {}): DrillSource {
  const index = lessonIndex(tierId)
  const tier = LESSONS[index]
  if (!tier) throw new Error(`unknown tier: ${tierId}`)

  const rng = options.rng ?? Math.random
  const lineCount = options.lineCount ?? 4
  const allowed = allowedCharsThrough(index)
  const pool = WORDBANK.filter((word) => usesOnly(word, allowed))
  if (pool.length === 0) throw new Error(`no words available for tier ${tierId}`)

  const fresh = tier.newKeys.filter((key) => key.length === 1)
  const weighted = pool.flatMap((word) =>
    fresh.some((key) => word.includes(key))
      ? (Array(NEW_KEY_WEIGHT).fill(word) as string[])
      : [word],
  )

  const pick = (from: string[]): string => from[Math.floor(rng() * from.length)] ?? from[0]!

  const buildLine = (): string => {
    let line = pick(weighted)

    while (line.length < RANDOM_MIN) {
      const fits = weighted.filter((word) => line.length + 1 + word.length <= RANDOM_MAX)
      if (fits.length === 0) break
      line = `${line} ${pick(fits)}`
    }
    return line
  }

  return {
    id: `random:${tierId}`,
    title: `Random — ${tier.title}`,
    goalWpm: tier.goalWpm,
    getLines: () => Array.from({ length: lineCount }, buildLine),
  }
}

// --- custom ----------------------------------------------------------------

export type CustomResult = {
  source: DrillSource
  /** Characters removed because the game cannot type them (§6). */
  stripped: string[]
}

/**
 * Anything pasted in: whitespace normalized, unsupported characters removed,
 * then chunked into ~50-character lines breaking only at spaces (§6).
 */
export function createCustomSource(text: string, goalWpm = 40): CustomResult {
  const supported = supportedChars()
  const stripped = new Set<string>()

  const cleaned = [...text.replace(/\s+/g, ' ').trim()]
    .filter((char) => {
      if (supported.has(char)) return true
      stripped.add(char)
      return false
    })
    .join('')
    // Removing a character can leave a doubled space behind.
    .replace(/ {2,}/g, ' ')
    .trim()

  const lines: string[] = []
  let line = ''
  for (const word of cleaned.split(' ').filter(Boolean)) {
    if (line === '') {
      line = word
    } else if (line.length + 1 + word.length <= CUSTOM_TARGET) {
      line = `${line} ${word}`
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line !== '') lines.push(line)

  return {
    source: {
      id: 'custom',
      title: 'Custom text',
      goalWpm,
      getLines: () => [...lines],
    },
    stripped: [...stripped].sort(),
  }
}
