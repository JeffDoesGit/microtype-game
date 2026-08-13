/**
 * A single ball (DESIGN.md §4). Reserved for --ball, the only fully saturated
 * element on screen, so the eye tracks shots without being told to (§8).
 */

import type { Vec2 } from '../game/shots.ts'

export function drawBall(
  ctx: CanvasRenderingContext2D,
  at: Vec2,
  radius: number,
  alpha: number,
  color: string,
  seam: string,
): void {
  ctx.save()
  ctx.globalAlpha = alpha

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.fill()

  // Two seams are enough to read as a basketball at this size, and keep the
  // silhouette clean when six of them are in the air at once.
  ctx.strokeStyle = seam
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(at.x - radius, at.y)
  ctx.lineTo(at.x + radius, at.y)
  ctx.moveTo(at.x, at.y - radius)
  ctx.lineTo(at.x, at.y + radius)
  ctx.stroke()

  ctx.restore()
}
