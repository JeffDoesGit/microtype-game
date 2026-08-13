/**
 * The shot queue and arc math (DESIGN.md §4).
 *
 * Not a physics sim: every shot is a quadratic bezier resolved at spawn time,
 * followed by a short drop so a brick visibly falls away. There is one hoop,
 * and each shot launches from its word's ball in the rack, so the origin
 * varies per shot while the target stays put.
 */

export type Vec2 = { x: number; y: number }

export type MissKind = 'rim' | 'backboard' | 'air'

export type Shot = {
  origin: Vec2
  hoop: Vec2
  control: Vec2
  end: Vec2
  outcome: 'make' | 'miss'
  missKind?: MissKind
  t0: number
  duration: number
  /** Velocity of the post-arc drop, in logical units per second. */
  drop: Vec2
  /** Set when the concurrency cap retires a shot early (§4). */
  cut: boolean
}

/** §4: cap in-flight balls; beyond this, drop the oldest. */
const MAX_IN_FLIGHT = 6
const DURATION_MIN = 380
const DURATION_MAX = 520
const DROP_MS = 260
const FADE_MS = 200

const MISS_KINDS: MissKind[] = ['rim', 'backboard', 'air']

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Where a miss ends up, per §4. `rim` overshoots the front edge and deflects
 * down-forward, `backboard` hits high and drops short, `air` misses wide. The
 * kind comes from the error's character index, so the same mistake in the same
 * place always looks the same.
 */
function missGeometry(hoop: Vec2, kind: MissKind, seed: number): { end: Vec2; drop: Vec2 } {
  const side = seed % 2 === 0 ? 1 : -1
  switch (kind) {
    case 'rim':
      return {
        end: { x: hoop.x + 16 * side, y: hoop.y + 4 },
        drop: { x: 90 * side, y: 320 },
      }
    case 'backboard':
      return {
        end: { x: hoop.x + 4 * side, y: hoop.y - 46 },
        drop: { x: -30 * side, y: 300 },
      }
    case 'air':
      return {
        end: { x: hoop.x + 74 * side, y: hoop.y + 12 },
        drop: { x: 40 * side, y: 340 },
      }
  }
}

export function createShot(
  origin: Vec2,
  hoop: Vec2,
  outcome: 'make' | 'miss',
  seed: number,
  now: number,
): Shot {
  const missKind = outcome === 'miss' ? MISS_KINDS[seed % MISS_KINDS.length]! : undefined
  const geometry =
    missKind === undefined
      ? { end: { ...hoop }, drop: { x: 0, y: 260 } }
      : missGeometry(hoop, missKind, seed)

  // Longer shots hang longer, within the range §4 specifies.
  const reach = clamp01(distance(origin, hoop) / 900)
  const duration = lerp(DURATION_MIN, DURATION_MAX, reach)

  // Control point above the hoop gives the arc its height. A quadratic bezier
  // only reaches about halfway to its control point, so the control sits well
  // above the rim for the ball to drop in from above rather than rise into it.
  const control: Vec2 = {
    x: lerp(origin.x, geometry.end.x, 0.5),
    y: Math.min(origin.y, geometry.end.y) - lerp(160, 300, reach),
  }

  const shot: Shot = {
    origin,
    hoop,
    control,
    end: geometry.end,
    outcome,
    t0: now,
    duration,
    drop: geometry.drop,
    cut: false,
  }
  if (missKind !== undefined) shot.missKind = missKind
  return shot
}

/** Point along the shot's arc at normalized time `t`. */
export function arcPoint(shot: Shot, t: number): Vec2 {
  const u = 1 - t
  return {
    x: u * u * shot.origin.x + 2 * u * t * shot.control.x + t * t * shot.end.x,
    y: u * u * shot.origin.y + 2 * u * t * shot.control.y + t * t * shot.end.y,
  }
}

export type ShotPhase =
  | { phase: 'flight'; at: Vec2; alpha: number }
  | { phase: 'drop'; at: Vec2; alpha: number }
  | { phase: 'done' }

/**
 * Where a shot is now. A make passes through the rim and fades below it; a miss
 * deflects along its drop velocity. Either way the ball is gone within DROP_MS,
 * and once it is gone the court is clean again.
 */
export function shotAt(shot: Shot, now: number): ShotPhase {
  const elapsed = now - shot.t0

  if (elapsed < shot.duration && !shot.cut) {
    const t = clamp01(elapsed / shot.duration)
    return { phase: 'flight', at: arcPoint(shot, t), alpha: 1 }
  }

  const since = shot.cut ? DROP_MS : elapsed - shot.duration
  if (since >= DROP_MS) return { phase: 'done' }

  const seconds = since / 1000
  return {
    phase: 'drop',
    at: {
      x: shot.end.x + shot.drop.x * seconds,
      y: shot.end.y + shot.drop.y * seconds,
    },
    alpha: clamp01((DROP_MS - since) / FADE_MS),
  }
}

export type ShotQueue = {
  /** Shots taken this line, oldest first. Retired ones are pruned. */
  readonly shots: Shot[]
  fire(origin: Vec2, outcome: 'make' | 'miss', seed: number, now: number): Shot
  /** True while any ball is still visible, so the caller knows to keep animating. */
  isAnimating(now: number): boolean
  clear(): void
}

export function createShotQueue(
  hoop: Vec2,
  /** Read per shot, so toggling reduced motion mid-drill takes effect. */
  options: { instant: () => boolean },
): ShotQueue {
  let shots: Shot[] = []

  return {
    get shots() {
      return shots
    },

    fire(origin, outcome, seed, now) {
      const shot = createShot(origin, hoop, outcome, seed, now)

      // §8: under prefers-reduced-motion a shot lands with no travel.
      if (options.instant()) shot.cut = true

      // Retired shots leave nothing behind, so drop them as they finish.
      shots = shots.filter((s) => shotAt(s, now).phase !== 'done')
      if (shots.length >= MAX_IN_FLIGHT) {
        // §4: beyond the cap, the oldest ball disappears early.
        shots[0]!.cut = true
      }

      shots.push(shot)
      return shot
    },

    isAnimating(now) {
      return shots.some((shot) => shotAt(shot, now).phase !== 'done')
    },

    clear() {
      shots = []
    },
  }
}
