/**
 * The court: hoop layout, the floor, and the shot chart (DESIGN.md §2, §4, §8).
 *
 * Everything here except the balls and the trails is deliberately quiet. The
 * persistent arc trails are the signature element, and they only read if the
 * court behind them stays out of the way.
 */

import { arcPoint, shotAt, type Shot, type Vec2 } from '../game/shots.ts'
import { drawBall } from './ball.ts'

export const COURT_WIDTH = 1600
export const COURT_HEIGHT = 800

/** §2: all balls launch from a fixed origin at bottom-center. */
export const SHOOTER: Vec2 = { x: COURT_WIDTH / 2, y: 726 }

const SIDE_MARGIN = 120
const TWO_ROW_Y = [214, 396]
const THREE_ROW_Y = [186, 320, 454]

export type Palette = {
  courtDeep: string
  hardwood: string
  chalk: string
  ball: string
  net: string
  brick: string
}

export type CourtLayout = {
  hoops: Vec2[]
  rimRadius: number
  labelSize: number
}

/**
 * One hoop per word, left-to-right, top row then bottom (§2). Two rows up to
 * twelve words; beyond that a third row, and everything shrinks to fit.
 */
export function computeCourtLayout(wordCount: number): CourtLayout {
  if (wordCount === 0) return { hoops: [], rimRadius: 30, labelSize: 18 }

  const rowYs = wordCount <= 12 ? TWO_ROW_Y : THREE_ROW_Y
  const perRow = Math.ceil(wordCount / rowYs.length)
  const span = COURT_WIDTH - SIDE_MARGIN * 2

  const hoops: Vec2[] = []
  for (let i = 0; i < wordCount; i++) {
    const row = Math.floor(i / perRow)
    const column = i % perRow
    const inThisRow = Math.min(perRow, wordCount - row * perRow)
    const step = span / inThisRow
    hoops.push({
      x: SIDE_MARGIN + step * (column + 0.5),
      y: rowYs[row] ?? rowYs[rowYs.length - 1]!,
    })
  }

  // Keep rims clear of each other however tight the row gets.
  const tightest = span / perRow
  const rimRadius = Math.min(rowYs.length === 2 ? 32 : 26, tightest * 0.3)
  const labelSize = Math.min(rowYs.length === 2 ? 19 : 16, tightest * 0.22)

  return { hoops, rimRadius, labelSize }
}

function drawFloor(ctx: CanvasRenderingContext2D, palette: Palette): void {
  // A shallow trapezoid reads as a floor in perspective without needing a
  // projection: wide at the baseline, narrower upcourt.
  ctx.fillStyle = palette.hardwood
  ctx.beginPath()
  ctx.moveTo(330, 548)
  ctx.lineTo(COURT_WIDTH - 330, 548)
  ctx.lineTo(COURT_WIDTH - 40, COURT_HEIGHT)
  ctx.lineTo(40, COURT_HEIGHT)
  ctx.closePath()
  ctx.fill()

  ctx.save()
  ctx.strokeStyle = palette.chalk
  ctx.globalAlpha = 0.32
  ctx.lineWidth = 3

  // The painted lane, converging on the shooter.
  ctx.beginPath()
  ctx.moveTo(660, 548)
  ctx.lineTo(COURT_WIDTH - 660, 548)
  ctx.lineTo(COURT_WIDTH - 560, COURT_HEIGHT)
  ctx.lineTo(560, COURT_HEIGHT)
  ctx.closePath()
  ctx.stroke()

  // Baseline.
  ctx.globalAlpha = 0.22
  ctx.beginPath()
  ctx.moveTo(330, 548)
  ctx.lineTo(COURT_WIDTH - 330, 548)
  ctx.stroke()
  ctx.restore()
}

/**
 * Net ripple on a make: a 3-frame vertex wobble as the ball passes through
 * (§4). Returns the horizontal offset of the net's converge point.
 */
function netWobble(shots: Shot[], hoop: Vec2, now: number): number {
  for (const shot of shots) {
    if (shot.outcome !== 'make') continue
    if (shot.hoop.x !== hoop.x || shot.hoop.y !== hoop.y) continue
    const since = now - (shot.t0 + shot.duration)
    if (since < 0 || since > 120) continue
    const frame = Math.floor(since / 40)
    return frame === 0 ? 5 : frame === 1 ? -3 : 1
  }
  return 0
}

function drawHoop(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  at: Vec2,
  label: string,
  layout: CourtLayout,
  isCurrent: boolean,
  wobble: number,
): void {
  const { rimRadius, labelSize } = layout

  ctx.save()

  // Backboard, kept faint — the rim is what the player aims at.
  ctx.globalAlpha = 0.16
  ctx.fillStyle = palette.chalk
  ctx.fillRect(at.x - rimRadius * 1.5, at.y - rimRadius * 2.1, rimRadius * 3, rimRadius * 1.5)

  // §2: a subtle ring marks the hoop the next ball is going to.
  if (isCurrent) {
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = palette.chalk
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(at.x, at.y, rimRadius + 12, rimRadius * 0.42 + 10, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Net.
  ctx.globalAlpha = 0.45
  ctx.strokeStyle = palette.chalk
  ctx.lineWidth = 1.5
  const netDepth = rimRadius * 1.15
  for (let i = -2; i <= 2; i++) {
    const startX = at.x + (rimRadius * i) / 2
    ctx.beginPath()
    ctx.moveTo(startX, at.y)
    ctx.lineTo(at.x + wobble + (rimRadius * i) / 6, at.y + netDepth)
    ctx.stroke()
  }

  // Rim.
  ctx.globalAlpha = 1
  ctx.strokeStyle = palette.chalk
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(at.x, at.y, rimRadius, rimRadius * 0.42, 0, 0, Math.PI * 2)
  ctx.stroke()

  // Label.
  ctx.globalAlpha = isCurrent ? 1 : 0.62
  ctx.fillStyle = palette.chalk
  ctx.font = `${labelSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(label, at.x, at.y + netDepth + 12)

  ctx.restore()
}

/**
 * The shot chart (§4): every arc taken this line, makes in --net and misses
 * dashed in --brick. Trails draw only as far as their ball has flown, so an
 * in-flight shot does not give away where it is going to land.
 */
function drawTrails(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  shots: Shot[],
  now: number,
): void {
  ctx.save()
  ctx.lineWidth = 2

  for (const shot of shots) {
    const phase = shotAt(shot, now)
    const progress = phase.progress
    if (progress <= 0) continue

    if (shot.outcome === 'make') {
      ctx.strokeStyle = palette.net
      ctx.globalAlpha = 0.55
      ctx.setLineDash([])
    } else {
      ctx.strokeStyle = palette.brick
      ctx.globalAlpha = 0.5
      ctx.setLineDash([7, 7])
    }

    ctx.beginPath()
    const steps = 24
    for (let i = 0; i <= steps; i++) {
      const point = arcPoint(shot, (progress * i) / steps)
      if (i === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

export function drawCourt(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  layout: CourtLayout,
  words: string[],
  currentWord: number,
  shots: Shot[],
  now: number,
): void {
  ctx.fillStyle = palette.courtDeep
  ctx.fillRect(0, 0, COURT_WIDTH, COURT_HEIGHT)

  drawFloor(ctx, palette)

  layout.hoops.forEach((hoop, i) => {
    drawHoop(
      ctx,
      palette,
      hoop,
      words[i] ?? '',
      layout,
      i === currentWord,
      netWobble(shots, hoop, now),
    )
  })

  drawTrails(ctx, palette, shots, now)

  // The shooter: a chalk mark, not a figure. §8 keeps the court quiet.
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = palette.chalk
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(SHOOTER.x, SHOOTER.y + 16, 34, 10, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  for (const shot of shots) {
    const phase = shotAt(shot, now)
    if (phase.phase === 'done') continue
    drawBall(ctx, phase.at, 13, phase.alpha, palette.ball, palette.courtDeep)
  }
}
