import './styles/tokens.css'
import './styles/layout.css'

// The stage is a fixed 16:10 logical coordinate space (DESIGN.md §2). Everything
// draws in these units; scaling to the viewport happens once, in fitStage().
const STAGE_WIDTH = 1600
const STAGE_HEIGHT = 1000

/**
 * Letterbox the stage into the viewport: largest 16:10 box that fits, centered
 * by the flex layout. The backing store is sized in device pixels and the
 * transform maps logical units onto it, so draw code never sees the scale
 * factor and stays crisp on HiDPI displays.
 */
function fitStage(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const scale = Math.min(
    window.innerWidth / STAGE_WIDTH,
    window.innerHeight / STAGE_HEIGHT,
  )
  const cssWidth = Math.floor(STAGE_WIDTH * scale)
  const cssHeight = Math.floor(STAGE_HEIGHT * scale)

  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(cssWidth * dpr)
  canvas.height = Math.round(cssHeight * dpr)

  ctx.setTransform(
    canvas.width / STAGE_WIDTH,
    0,
    0,
    canvas.height / STAGE_HEIGHT,
    0,
    0,
  )
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Placeholder court: the background field plus one solid rectangle. */
function draw(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = token('--court-deep')
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)

  const margin = 80
  ctx.fillStyle = token('--hardwood')
  ctx.fillRect(
    margin,
    margin,
    STAGE_WIDTH - margin * 2,
    STAGE_HEIGHT - margin * 2,
  )
}

function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage')
  if (!canvas) throw new Error('#stage canvas missing from index.html')

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  const render = (): void => {
    fitStage(canvas, ctx)
    draw(ctx)
  }

  render()

  // Nothing animates yet, so redraw only when the stage geometry changes.
  // devicePixelRatio shifts when a window moves between displays or the page
  // zooms; resize fires for both.
  window.addEventListener('resize', render)
}

main()
