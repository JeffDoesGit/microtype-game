import './styles/tokens.css'
import './styles/layout.css'

import {
  applyKey,
  createLineState,
  isLineComplete,
  wordIndexAt,
  type LineState,
} from './game/input.ts'
import { createShotQueue } from './game/shots.ts'
import {
  COURT_HEIGHT,
  COURT_WIDTH,
  SHOOTER,
  computeCourtLayout,
  drawCourt,
  type CourtLayout,
  type Palette,
} from './render/court.ts'
import { createStrip } from './render/strip.ts'
import { PLACEHOLDER_LINES } from './content/placeholder.ts'

// The stage is a fixed 16:10 logical coordinate space (DESIGN.md §2). The DOM
// inside it is laid out at these dimensions and scaled as a unit, so the drill
// strip and the court can never drift apart.
const STAGE_WIDTH = 1600
const STAGE_HEIGHT = 1000

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
  canvas.width = Math.round(COURT_WIDTH * effective)
  canvas.height = Math.round(COURT_HEIGHT * effective)

  ctx.setTransform(
    canvas.width / COURT_WIDTH,
    0,
    0,
    canvas.height / COURT_HEIGHT,
    0,
    0,
  )
}

/** Read the §8 palette once; re-reading it per frame would cost a layout. */
function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string): string => style.getPropertyValue(name).trim()
  return {
    courtDeep: token('--court-deep'),
    hardwood: token('--hardwood'),
    chalk: token('--chalk'),
    ball: token('--ball'),
    net: token('--net'),
    brick: token('--brick'),
  }
}

function wordsOf(line: string): string[] {
  return line.match(/\S+/g) ?? []
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

  const palette = readPalette()
  const strip = createStrip(targetRow, typedRow, hintRow)

  // §8: reduced motion draws each shot as an instant trail, with no travel.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const shotQueue = createShotQueue(SHOOTER, { instant: () => reducedMotion.matches })

  const lines = PLACEHOLDER_LINES
  let lineIndex = 0
  let state: LineState = createLineState(lines[0]!)
  let words = wordsOf(lines[0]!)
  let layout: CourtLayout = computeCourtLayout(words.length)
  let finished = false
  let frame = 0

  const paint = (): void => {
    const now = performance.now()
    const currentWord = finished ? -1 : wordIndexAt(state, state.cursor)
    drawCourt(ctx, palette, layout, words, currentWord, shotQueue.shots, now)

    // Animate only while a ball is visible; otherwise the court holds still,
    // which is the whole of the §8 motion budget.
    if (shotQueue.isAnimating(now)) {
      frame = requestAnimationFrame(paint)
    } else {
      frame = 0
    }
  }

  const requestPaint = (): void => {
    if (frame === 0) frame = requestAnimationFrame(paint)
  }

  const refreshStrip = (): void => {
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

    const now = performance.now()
    for (const e of events) {
      if (e.kind === 'make') {
        const hoop = layout.hoops[e.wordIndex]
        if (hoop) shotQueue.fire(hoop, 'make', e.wordIndex, now)
      } else if (e.kind === 'miss') {
        // §4 seeds missKind from the error's character index, so the same
        // mistake always bricks the same way.
        const hoop = layout.hoops[e.wordIndex]
        if (hoop) shotQueue.fire(hoop, 'miss', e.charIndex, now)
      } else if (e.kind === 'lineCommitted') {
        lineIndex += 1
        const next = lines[lineIndex]
        if (next === undefined) {
          finished = true
        } else {
          state = createLineState(next)
          words = wordsOf(next)
          layout = computeCourtLayout(words.length)
          // §4: trails persist for the rest of the line, and no longer.
          shotQueue.clear()
        }
      }
    }

    refreshStrip()
    requestPaint()
  })

  const resize = (): void => {
    fitStage(stage, canvas, ctx)
    requestPaint()
  }

  resize()
  refreshStrip()
  window.addEventListener('resize', resize)
  reducedMotion.addEventListener('change', requestPaint)
}

main()
