/**
 * The court: one hoop, and the rack of labelled balls waiting to be thrown
 * (DESIGN.md §2, §4, §8).
 *
 * One ball per word in the current line, laid out left-to-right, top row then
 * bottom. A ball leaves the rack when its word resolves, so the rack empties as
 * the line is typed. Shots launch from the ball's slot, which is why arcs still
 * fan out with only one target on the court.
 */

import { shotAt, type Shot, type Vec2 } from '../game/shots.ts'
import { drawBall } from './ball.ts'

export const COURT_WIDTH = 1600
export const COURT_HEIGHT = 800

/** §2: the single hoop, up at top center. */
export const HOOP: Vec2 = { x: COURT_WIDTH / 2, y: 196 }

const RIM_RADIUS = 62
const SIDE_MARGIN = 130
const TWO_ROW_Y = [566, 686]
const THREE_ROW_Y = [516, 616, 716]

export type Palette = {
  courtDeep: string
  hardwood: string
  chalk: string
  ball: string
  net: string
  brick: string
}

export type RackLayout = {
  /** One slot per word, in word order. */
  slots: Vec2[]
  ballRadius: number
  labelSize: number
}

/**
 * One slot per word, left-to-right, top row then bottom (§2). Two rows up to
 * twelve words; beyond that a third row, and everything shrinks to fit.
 */
export function computeRackLayout(wordCount: number): RackLayout {
  if (wordCount === 0) return { slots: [], ballRadius: 34, labelSize: 15 }

  const rowYs = wordCount <= 12 ? TWO_ROW_Y : THREE_ROW_Y
  const perRow = Math.ceil(wordCount / rowYs.length)
  const span = COURT_WIDTH - SIDE_MARGIN * 2

  const slots: Vec2[] = []
  for (let i = 0; i < wordCount; i++) {
    const row = Math.floor(i / perRow)
    const column = i % perRow
    const inThisRow = Math.min(perRow, wordCount - row * perRow)
    const step = span / inThisRow
    slots.push({
      x: SIDE_MARGIN + step * (column + 0.5),
      y: rowYs[row] ?? rowYs[rowYs.length - 1]!,
    })
  }

  // Keep balls clear of each other however tight the row gets.
  const tightest = span / perRow
  const ballRadius = Math.min(rowYs.length === 2 ? 38 : 30, tightest * 0.4)

  return { slots, ballRadius, labelSize: ballRadius * 0.5 }
}

/** Largest font size at which `text` fits inside `maxWidth`. */
function fitLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
): number {
  const font = (size: number): string =>
    `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`

  ctx.font = font(maxSize)
  const width = ctx.measureText(text).width
  if (width <= maxWidth) return maxSize

  return Math.max(8, Math.floor((maxSize * maxWidth) / width))
}

function drawFloor(ctx: CanvasRenderingContext2D, palette: Palette): void {
  // A shallow trapezoid reads as a floor in perspective without needing a
  // projection: wide at the baseline, narrower upcourt.
  ctx.fillStyle = palette.hardwood
  ctx.beginPath()
  ctx.moveTo(330, 440)
  ctx.lineTo(COURT_WIDTH - 330, 440)
  ctx.lineTo(COURT_WIDTH - 20, COURT_HEIGHT)
  ctx.lineTo(20, COURT_HEIGHT)
  ctx.closePath()
  ctx.fill()

  ctx.save()
  ctx.strokeStyle = palette.chalk
  ctx.globalAlpha = 0.28
  ctx.lineWidth = 3

  // The painted lane, running up to the hoop.
  ctx.beginPath()
  ctx.moveTo(690, 440)
  ctx.lineTo(COURT_WIDTH - 690, 440)
  ctx.lineTo(COURT_WIDTH - 520, COURT_HEIGHT)
  ctx.lineTo(520, COURT_HEIGHT)
  ctx.closePath()
  ctx.stroke()

  ctx.globalAlpha = 0.2
  ctx.beginPath()
  ctx.moveTo(330, 440)
  ctx.lineTo(COURT_WIDTH - 330, 440)
  ctx.stroke()
  ctx.restore()
}

/**
 * Net ripple on a make: a 3-frame vertex wobble as the ball passes through
 * (§4). Returns the horizontal offset of the net's converge point.
 */
function netWobble(shots: Shot[], now: number): number {
  for (const shot of shots) {
    if (shot.outcome !== 'make') continue
    const since = now - (shot.t0 + shot.duration)
    if (since < 0 || since > 120) continue
    const frame = Math.floor(since / 40)
    return frame === 0 ? 8 : frame === 1 ? -5 : 2
  }
  return 0
}

function drawHoop(ctx: CanvasRenderingContext2D, palette: Palette, wobble: number): void {
  ctx.save()

  // Backboard, kept faint — the rim is what the player watches.
  ctx.globalAlpha = 0.18
  ctx.fillStyle = palette.chalk
  ctx.fillRect(HOOP.x - RIM_RADIUS * 1.6, HOOP.y - RIM_RADIUS * 2.2, RIM_RADIUS * 3.2, RIM_RADIUS * 1.7)

  ctx.globalAlpha = 0.34
  ctx.strokeStyle = palette.chalk
  ctx.lineWidth = 3
  ctx.strokeRect(
    HOOP.x - RIM_RADIUS * 1.6,
    HOOP.y - RIM_RADIUS * 2.2,
    RIM_RADIUS * 3.2,
    RIM_RADIUS * 1.7,
  )

  // Net.
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 2
  const netDepth = RIM_RADIUS * 1.2
  for (let i = -3; i <= 3; i++) {
    const startX = HOOP.x + (RIM_RADIUS * i) / 3
    ctx.beginPath()
    ctx.moveTo(startX, HOOP.y)
    ctx.lineTo(HOOP.x + wobble + (RIM_RADIUS * i) / 9, HOOP.y + netDepth)
    ctx.stroke()
  }

  // Rim.
  ctx.globalAlpha = 1
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.ellipse(HOOP.x, HOOP.y, RIM_RADIUS, RIM_RADIUS * 0.34, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()
}

/**
 * The rack. A ball is drawn only while its word is unresolved, so the rack
 * empties left-to-right as the line is typed, and the current word's ball is
 * marked so the player can see which one goes next (§2).
 */
function drawRack(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  layout: RackLayout,
  words: string[],
  resolved: boolean[],
  currentWord: number,
): void {
  layout.slots.forEach((slot, i) => {
    if (resolved[i]) return

    const isCurrent = i === currentWord
    drawBall(ctx, slot, layout.ballRadius, 1, palette.ball, palette.courtDeep, false)

    ctx.save()
    if (isCurrent) {
      ctx.globalAlpha = 0.85
      ctx.strokeStyle = palette.chalk
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(slot.x, slot.y, layout.ballRadius + 8, 0, Math.PI * 2)
      ctx.stroke()
    }

    // The word rides on its ball, as in the original drill.
    const label = words[i] ?? ''
    const size = fitLabel(ctx, label, layout.ballRadius * 1.7, layout.labelSize)
    ctx.globalAlpha = 1
    ctx.fillStyle = palette.courtDeep
    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, slot.x, slot.y)
    ctx.restore()
  })
}

export function drawCourt(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  layout: RackLayout,
  words: string[],
  resolved: boolean[],
  currentWord: number,
  shots: Shot[],
  now: number,
): void {
  ctx.fillStyle = palette.courtDeep
  ctx.fillRect(0, 0, COURT_WIDTH, COURT_HEIGHT)

  drawFloor(ctx, palette)
  drawHoop(ctx, palette, netWobble(shots, now))
  drawRack(ctx, palette, layout, words, resolved, currentWord)

  for (const shot of shots) {
    const phase = shotAt(shot, now)
    if (phase.phase === 'done') continue
    drawBall(ctx, phase.at, layout.ballRadius * 0.62, phase.alpha, palette.ball, palette.courtDeep)
  }
}
