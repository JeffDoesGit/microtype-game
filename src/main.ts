import './styles/tokens.css'
import './styles/layout.css'

import { applyKey, createLineState, isLineComplete, type LineState } from './game/input.ts'
import { createStrip } from './render/strip.ts'
import { PLACEHOLDER_LINES } from './content/placeholder.ts'

// The stage is a fixed 16:10 logical coordinate space (DESIGN.md §2). The DOM
// inside it is laid out at these dimensions and scaled as a unit, so the drill
// strip and the court can never drift apart.
const STAGE_WIDTH = 1600
const STAGE_HEIGHT = 1000
const COURT_HEIGHT = 800

/**
 * Letterbox the stage into the viewport: largest 16:10 box that fits, centered
 * by the flex layout. The canvas backing store is sized for the *combined*
 * stage and device pixel ratio, so the court stays crisp at any scale, and its
 * transform maps logical units onto that backing store.
 */
function fitStage(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): void {
  const scale = Math.min(
    window.innerWidth / STAGE_WIDTH,
    window.innerHeight / STAGE_HEIGHT,
  )
  stage.style.transform = `scale(${scale})`

  const effective = scale * (window.devicePixelRatio || 1)
  canvas.width = Math.round(STAGE_WIDTH * effective)
  canvas.height = Math.round(COURT_HEIGHT * effective)

  ctx.setTransform(
    canvas.width / STAGE_WIDTH,
    0,
    0,
    canvas.height / COURT_HEIGHT,
    0,
    0,
  )
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Placeholder court: hoops, lane, and shots arrive in build order step 4. */
function drawCourt(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = token('--court-deep')
  ctx.fillRect(0, 0, STAGE_WIDTH, COURT_HEIGHT)

  const margin = 80
  ctx.fillStyle = token('--hardwood')
  ctx.fillRect(margin, margin, STAGE_WIDTH - margin * 2, COURT_HEIGHT - margin * 2)
}

function main(): void {
  const stage = document.querySelector<HTMLElement>('#stage')
  const canvas = document.querySelector<HTMLCanvasElement>('#court')
  const targetRow = document.querySelector<HTMLElement>('#strip-target')
  const typedRow = document.querySelector<HTMLElement>('#strip-typed')
  const hintRow = document.querySelector<HTMLElement>('#strip-hint')
  if (!stage || !canvas || !targetRow || !typedRow || !hintRow) {
    throw new Error('stage markup missing from index.html')
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  const strip = createStrip(targetRow, typedRow, hintRow)

  const lines = PLACEHOLDER_LINES
  let lineIndex = 0
  let state: LineState = createLineState(lines[0]!)
  let finished = false

  const refresh = (): void => {
    strip.render(state)
    if (finished) strip.setHint('Drill complete.')
    else if (isLineComplete(state)) strip.setHint('Strike Enter to continue.')
    else strip.setHint('')
  }

  window.addEventListener('keydown', (event) => {
    if (finished) return
    // Leave browser and OS shortcuts alone; only bare keys are drill input.
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const events = applyKey(state, event.key)

    // Space scrolls and Backspace can navigate; both are drill input here.
    if (event.key === ' ' || event.key === 'Backspace' || event.key === 'Enter') {
      event.preventDefault()
    }

    // make and miss events are what the shot system consumes in step 4.
    if (events.some((e) => e.kind === 'lineCommitted')) {
      lineIndex += 1
      const next = lines[lineIndex]
      if (next === undefined) finished = true
      else state = createLineState(next)
    }

    refresh()
  })

  const render = (): void => {
    fitStage(stage, canvas, ctx)
    drawCourt(ctx)
  }

  render()
  refresh()

  // The court does not animate yet, so redraw only when geometry changes.
  window.addEventListener('resize', render)
}

main()
