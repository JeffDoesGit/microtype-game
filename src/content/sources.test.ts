import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  LESSONS,
  WORDBANK,
  allowedCharsThrough,
  createCustomSource,
  createLessonSource,
  createRandomSource,
  lessonIndex,
  supportedChars,
} from './sources.ts'

/** Deterministic stand-in for Math.random, so a drill can be reproduced. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

// --- lesson data ------------------------------------------------------------

test('lesson lines only use keys the player has been taught', () => {
  LESSONS.forEach((lesson, index) => {
    const allowed = allowedCharsThrough(index)
    for (const line of lesson.lines) {
      const illegal = [...new Set([...line])].filter((char) => !allowed.has(char))
      assert.deepEqual(illegal, [], `${lesson.id} uses untaught ${JSON.stringify(illegal)}`)
    }
  })
})

test('lesson lines run 40 to 60 characters', () => {
  for (const lesson of LESSONS) {
    for (const line of lesson.lines) {
      assert.ok(
        line.length >= 40 && line.length <= 60,
        `${lesson.id}: ${line.length} chars — ${line}`,
      )
    }
  }
})

test('each lesson introduces at most two new keys', () => {
  // Three deliberate exceptions: l01 is the home-row baseline rather than an
  // increment, and the two number lessons take five digits each — the digit row
  // is learned as a unit, not in pairs.
  const exempt = new Set(['l01', 'l14', 'l15'])

  for (const lesson of LESSONS) {
    if (exempt.has(lesson.id)) continue
    assert.ok(
      lesson.newKeys.length <= 2,
      `${lesson.id} adds ${lesson.newKeys.length} keys`,
    )
  }
})

test('every new key actually appears in its lesson', () => {
  for (const lesson of LESSONS) {
    const body = lesson.lines.join(' ')
    for (const key of lesson.newKeys) {
      if (key === 'Shift') {
        assert.ok(/[A-Z]/.test(body), `${lesson.id} teaches Shift but has no capitals`)
      } else {
        assert.ok(body.includes(key), `${lesson.id} teaches ${key} but never uses it`)
      }
    }
  }
})

test('lesson ids are unique and goals climb', () => {
  const ids = LESSONS.map((lesson) => lesson.id)
  assert.equal(new Set(ids).size, ids.length)

  for (let i = 1; i < LESSONS.length; i++) {
    assert.ok(
      LESSONS[i]!.goalWpm >= LESSONS[i - 1]!.goalWpm,
      `${LESSONS[i]!.id} goal drops below the lesson before it`,
    )
  }
})

test('the alphabet is fully taught by the end', () => {
  const allowed = supportedChars()
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    assert.ok(allowed.has(letter), `${letter} is never taught`)
  }
})

// --- lesson source ----------------------------------------------------------

test('a lesson source hands over that lesson, and cannot be mutated through', () => {
  const source = createLessonSource('l03')
  assert.equal(source.goalWpm, LESSONS[lessonIndex('l03')]!.goalWpm)

  source.getLines()[0] = 'tampered'
  assert.notEqual(createLessonSource('l03').getLines()[0], 'tampered')
})

test('an unknown lesson id throws rather than returning nothing', () => {
  assert.throws(() => createLessonSource('nope'), /unknown lesson/)
})

// --- random source ----------------------------------------------------------

test('random lines stay inside the tier the player has reached', () => {
  const tier = 'l05'
  const allowed = allowedCharsThrough(lessonIndex(tier))
  const lines = createRandomSource(tier, { rng: seeded(7), lineCount: 12 }).getLines()

  for (const line of lines) {
    const illegal = [...new Set([...line])].filter((char) => !allowed.has(char))
    assert.deepEqual(illegal, [], `untaught ${JSON.stringify(illegal)} in "${line}"`)
  }
})

test('random lines run 45 to 55 characters and break at word boundaries', () => {
  const lines = createRandomSource('l09', { rng: seeded(3), lineCount: 20 }).getLines()

  for (const line of lines) {
    assert.ok(line.length >= 45 && line.length <= 55, `${line.length} chars — ${line}`)
    assert.equal(line.trim(), line)
    assert.ok(!line.includes('  '))
  }
})

test('even the narrowest tier can fill a line', () => {
  const lines = createRandomSource('l01', { rng: seeded(11), lineCount: 6 }).getLines()

  for (const line of lines) {
    assert.ok(line.length >= 45 && line.length <= 55, `${line.length} chars — ${line}`)
  }
})

test('random drills are reproducible from a seed', () => {
  const a = createRandomSource('l07', { rng: seeded(42), lineCount: 4 }).getLines()
  const b = createRandomSource('l07', { rng: seeded(42), lineCount: 4 }).getLines()

  assert.deepEqual(a, b)
})

test('random weights toward the tier newest keys', () => {
  // l10 adds x and q; over many lines they should turn up far more often than
  // the unweighted pool alone would give.
  const tier = 'l10'
  const lines = createRandomSource(tier, { rng: seeded(5), lineCount: 40 }).getLines()
  const words = lines.join(' ').split(' ')

  const withNewKeys = words.filter((word) => word.includes('x') || word.includes('q')).length
  const poolShare =
    WORDBANK.filter((word) => word.includes('x') || word.includes('q')).length / WORDBANK.length

  assert.ok(
    withNewKeys / words.length > poolShare,
    `new keys appeared in ${withNewKeys}/${words.length}, pool share ${poolShare}`,
  )
})

test('an unknown tier throws', () => {
  assert.throws(() => createRandomSource('l99'), /unknown tier/)
})

// --- custom source ----------------------------------------------------------

test('custom text is whitespace-normalized', () => {
  const { source } = createCustomSource('  the   lad\n\nasks\tdad  ')

  assert.deepEqual(source.getLines(), ['the lad asks dad'])
})

test('unsupported characters are stripped and reported', () => {
  const { source, stripped } = createCustomSource('café costs €5 — ok')

  assert.deepEqual(stripped, ['é', '—', '€'])
  assert.ok(!source.getLines().join(' ').includes('é'))
  // Stripping must not leave doubled spaces behind.
  assert.ok(!source.getLines().join('|').includes('  '))
})

test('nothing is reported when the text is already typeable', () => {
  const { stripped } = createCustomSource('The lad asks dad, 5 times.')

  assert.deepEqual(stripped, [])
})

test('custom text chunks at spaces, never mid-word', () => {
  const words = Array.from({ length: 60 }, (_, i) => `word${i % 10}`)
  const { source } = createCustomSource(words.join(' '))
  const lines = source.getLines()

  assert.ok(lines.length > 1)
  for (const line of lines) {
    assert.ok(line.length <= 50, `${line.length} chars — ${line}`)
    assert.ok(!line.startsWith(' ') && !line.endsWith(' '))
  }
  assert.equal(lines.join(' '), words.join(' '))
})

test('a word longer than the target still gets its own line', () => {
  const long = 'x'.repeat(70)
  const { source } = createCustomSource(`short ${long} tail`)

  assert.deepEqual(source.getLines(), ['short', long, 'tail'])
})

test('empty custom text yields no lines rather than one blank one', () => {
  const { source } = createCustomSource('   \n\t  ')

  assert.deepEqual(source.getLines(), [])
})
