import './styles/tokens.css'
import './styles/layout.css'

import {
  applyKey,
  createLineState,
  isLineComplete,
  wordIndexAt,
  type LineState,
} from './game/input.ts'
import { coachTip, reportLine, shouldInterject } from './game/coach.ts'
import { createScorer } from './game/scoring.ts'
import { createShotQueue } from './game/shots.ts'
import {
  COURT_HEIGHT,
  COURT_WIDTH,
  HOOP,
  computeRackLayout,
  drawCourt,
  type Palette,
  type RackLayout,
} from './render/court.ts'
import { createRail } from './render/rail.ts'
import { createModal } from './render/results.ts'
import { createSound } from './render/sound.ts'
import { createStrip } from './render/strip.ts'
import { loadSave, persistSave, recordAttempt, type DrillMode } from './store/save.ts'
import {
  LESSONS,
  createLessonSource,
  createRandomSource,
  lessonIndex,
  type DrillSource,
} from './content/sources.ts'

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

/**
 * Which drill to run. A stand-in for the menu in §9's state machine: the query
 * string picks a lesson (`?lesson=l04`) or a random drill at that tier
 * (`?lesson=l04&mode=random`). Custom text needs a textarea, so it waits for
 * the menu. Defaults to the first lesson.
 */
function selectSource(): { source: DrillSource; mode: DrillMode } {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('lesson') ?? LESSONS[0]!.id
  const id = lessonIndex(requested) === -1 ? LESSONS[0]!.id : requested

  return params.get('mode') === 'random'
    ? { source: createRandomSource(id), mode: 'random' }
    : { source: createLessonSource(id), mode: 'lesson' }
}

/**
 * §1: desktop-first, physical keyboard required. A device with no fine pointer
 * gets an honest redirect instead of a half-working game.
 */
function gateTouchDevices(): boolean {
  if (window.matchMedia('(any-pointer: fine)').matches) return false

  const gate = document.querySelector<HTMLElement>('#touch-gate')
  if (gate) gate.hidden = false
  return true
}

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`${selector} missing from index.html`)
  return element
}

function main(): void {
  if (gateTouchDevices()) return

  const stage = required<HTMLElement>('#stage')
  const canvas = required<HTMLCanvasElement>('#court')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  const palette = readPalette()
  let save = loadSave(window.localStorage)
  const sound = createSound(save.settings.sound)
  let interjected = false

  const strip = createStrip(
    required('#strip-target'),
    required('#strip-typed'),
    required('#strip-hint'),
  )
  const muteButton = required<HTMLButtonElement>('#rail-mute')
  const paintMute = (): void => {
    muteButton.textContent = sound.enabled ? 'Sound on' : 'Sound off'
    muteButton.setAttribute('aria-pressed', String(!sound.enabled))
  }
  muteButton.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled)
    if (sound.enabled) sound.arm()
    save = { ...save, settings: { ...save.settings, sound: sound.enabled } }
    persistSave(window.localStorage, save)
    paintMute()
    // Clicking the rail must not steal the keyboard from the drill.
    muteButton.blur()
  })
  paintMute()

  const rail = createRail(
    required('#rail-score'),
    required('#rail-combo'),
    required('#rail-wpm'),
    required('#rail-goal'),
    required('#rail-line'),
  )
  const restartButton = required<HTMLButtonElement>('#modal-restart')
  const modal = createModal(
    required('#modal'),
    required('#modal-title'),
    required('#modal-body'),
    required('#modal-footer'),
    restartButton,
  )

  // §8: reduced motion draws each shot with no travel.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const shotQueue = createShotQueue(HOOP, { instant: () => reducedMotion.matches })

  const { source, mode } = selectSource()
  let scorer = createScorer()
  let lines = source.getLines()
  let lineIndex = 0
  let state: LineState = createLineState(lines[0]!)
  let words = wordsOf(lines[0]!)
  let layout: RackLayout = computeRackLayout(words.length)
  let finished = false
  let frame = 0

  const paint = (): void => {
    const now = performance.now()
    const currentWord = finished ? -1 : wordIndexAt(state, state.cursor)
    drawCourt(ctx, palette, layout, words, state.wordResolved, currentWord, shotQueue.shots, now)

    // Animate only while a ball is visible; otherwise the court holds still,
    // which is the whole of the §8 motion budget.
    frame = shotQueue.isAnimating(now) ? requestAnimationFrame(paint) : 0
  }

  const requestPaint = (): void => {
    if (frame === 0) frame = requestAnimationFrame(paint)
  }

  /** Fold the round into the save, then show it (§5 bonus, §7 persistence). */
  const finishDrill = (now: number): void => {
    if (scorer.stats(now).wpm >= source.goalWpm) scorer.awardGoalBonus()
    const stats = scorer.stats(now)

    save = recordAttempt(save, {
      ts: Date.now(),
      mode,
      sourceId: source.id,
      goalWpm: source.goalWpm,
      wpm: stats.wpm,
      accuracy: stats.accuracy,
      errors: stats.misses,
      durationMs: stats.elapsedMs,
      keyErrors: stats.keyErrors,
    })
    persistSave(window.localStorage, save)

    modal.showResults(stats, {
      bestWpm: save.lessons[source.id]?.bestWpm ?? stats.wpm,
      goalWpm: source.goalWpm,
    })
  }

  /**
   * Start the drill over. Every accumulator resets — score, clock, key errors,
   * the coach's one-per-drill cap, the balls in the air — and a random source
   * is asked for fresh lines rather than replaying the same ones.
   */
  const restartDrill = (): void => {
    scorer = createScorer()
    lines = source.getLines()
    lineIndex = 0
    state = createLineState(lines[0]!)
    words = wordsOf(lines[0]!)
    layout = computeRackLayout(words.length)
    finished = false
    interjected = false
    shotQueue.clear()
    modal.hide()

    refreshStrip()
    refreshRail(performance.now())
    requestPaint()
    // Keep the keyboard on the drill rather than the button just clicked.
    restartButton.blur()
  }

  const refreshRail = (now: number): void => {
    const stats = scorer.stats(now)
    rail.render({
      score: stats.score,
      combo: stats.combo,
      wpm: scorer.liveWpm(now, finished ? null : state),
      goalWpm: source.goalWpm,
      line: Math.min(lineIndex + 1, lines.length),
      lineCount: lines.length,
    })
  }

  const refreshStrip = (): void => {
    strip.render(state)
    if (finished) strip.setHint('')
    else if (isLineComplete(state)) strip.setHint('Strike Enter to continue.')
    else strip.setHint('')
  }

  window.addEventListener('keydown', (event) => {
    // Leave browser and OS shortcuts alone; only bare keys are drill input.
    if (event.ctrlKey || event.metaKey || event.altKey) return

    if (modal.isOpen) {
      // The coach card is a pause: Enter resumes the drill (§5). The results
      // card is the end of it, so keys do nothing there — and are left to the
      // browser so the restart button stays reachable by keyboard.
      if (modal.kind === 'coach' && event.key === 'Enter') {
        event.preventDefault()
        modal.hide()
      }
      return
    }
    if (finished) return

    const now = performance.now()
    sound.arm()
    const events = applyKey(state, event.key)
    scorer.keystroke(now)

    // Space scrolls and Backspace can navigate; both are drill input here.
    if (event.key === ' ' || event.key === 'Backspace' || event.key === 'Enter') {
      event.preventDefault()
    }

    for (const e of events) {
      if (e.kind === 'make') {
        const slot = layout.slots[e.wordIndex]
        if (slot) shotQueue.fire(slot, 'make', e.wordIndex, now)
        scorer.recordMake()
        sound.play('make')
      } else if (e.kind === 'miss') {
        // §4 seeds missKind from the error's character index, so the same
        // mistake always bricks the same way.
        const slot = layout.slots[e.wordIndex]
        if (slot) shotQueue.fire(slot, 'miss', e.charIndex, now)
        scorer.recordMiss(state.chars[e.charIndex]!.target)
        sound.play('brick')
      } else if (e.kind === 'lineCommitted') {
        sound.play('lineComplete')
        scorer.commitLine(state)

        // §5: at most one interjection per drill, so it stays a moment.
        const report = reportLine(state)
        const interject = shouldInterject(report, interjected)
        lineIndex += 1
        const next = lines[lineIndex]
        if (next === undefined) {
          finished = true
          finishDrill(now)
        } else {
          state = createLineState(next)
          words = wordsOf(next)
          layout = computeRackLayout(words.length)
          shotQueue.clear()

          if (interject) {
            interjected = true
            modal.showCoach({
              errorRate: report.errorRate,
              tip: coachTip(report),
              linesRemaining: lines.length - lineIndex,
            })
          }
        }
      }
    }

    refreshStrip()
    refreshRail(now)
    requestPaint()
  })

  const resize = (): void => {
    fitStage(stage, canvas, ctx)
    requestPaint()
  }

  restartButton.addEventListener('click', restartDrill)

  resize()
  refreshStrip()
  refreshRail(performance.now())
  window.addEventListener('resize', resize)
  reducedMotion.addEventListener('change', requestPaint)
}

main()
