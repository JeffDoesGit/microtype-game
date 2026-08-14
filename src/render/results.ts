/**
 * The modal (DESIGN.md §5, §7): results at the end of a drill, and the coach
 * interjection mid-drill. Both are a heading, a short body, and "Strike Enter
 * to continue.", so one component serves both.
 */

import type { DrillStats } from '../game/scoring.ts'
import { problemKeys } from '../store/save.ts'

export type ResultsExtras = {
  /** Best gwam stored for this lesson, after this attempt is folded in. */
  bestWpm: number
  goalWpm: number
}

export type CoachCard = {
  errorRate: number
  tip: string
  linesRemaining: number
}

export type ModalKind = 'results' | 'coach'

export type Modal = {
  showResults(stats: DrillStats, extras: ResultsExtras): void
  showCoach(card: CoachCard): void
  hide(): void
  readonly isOpen: boolean
  /**
   * Which card is up. The coach card is a pause and closes on Enter; the
   * results card is the end of the drill and closes only by restarting, so the
   * caller can tell them apart.
   */
  readonly kind: ModalKind | null
}

function row(label: string, value: string): HTMLElement {
  const item = document.createElement('div')
  item.className = 'modal-stat'

  const key = document.createElement('span')
  key.className = 'modal-stat-label'
  key.textContent = label

  const val = document.createElement('span')
  val.className = 'modal-stat-value'
  val.textContent = value

  item.append(key, val)
  return item
}

/** The coach's advice reads as a sentence, not a scoreboard figure. */
function tipRow(text: string): HTMLElement {
  const tip = document.createElement('p')
  tip.className = 'modal-tip'
  tip.textContent = text
  return tip
}

export function createModal(
  root: HTMLElement,
  title: HTMLElement,
  body: HTMLElement,
  footer: HTMLElement,
  restart: HTMLElement,
): Modal {
  let kind: ModalKind | null = null

  return {
    get isOpen() {
      return kind !== null
    },

    get kind() {
      return kind
    },

    showResults(stats, extras) {
      const gwam = Math.round(stats.wpm)
      const rows = [
        row('Gwam', extras.goalWpm > 0 && gwam >= extras.goalWpm ? `${gwam}  goal met` : `${gwam}`),
        row('Accuracy', `${Math.round(stats.accuracy * 100)}%`),
        row('Score', stats.score.toString()),
        row('Baskets', `${stats.makes} made / ${stats.misses} missed`),
        row('Time', `${(stats.elapsedMs / 1000).toFixed(1)}s`),
        row('Best gwam', Math.round(extras.bestWpm).toString()),
      ]

      // §7's problem keys, scoped to this round. Omitted entirely on a clean
      // drill rather than shown as an empty row.
      const worst = problemKeys(stats.keyErrors, 5)
      if (worst.length > 0) {
        rows.push(row('Problem keys', worst.map((key) => (key === ' ' ? '␣' : key)).join('  ')))
      }

      title.textContent = 'Drill complete'
      body.replaceChildren(...rows)
      // The drill is over: there is nothing to continue to, so the card offers
      // a restart instead of an Enter prompt that would leave a dead screen.
      footer.hidden = true
      restart.hidden = false
      root.hidden = false
      kind = 'results'
    },

    showCoach(card) {
      title.textContent = 'You made too many errors'
      body.replaceChildren(
        row('Error rate', `${Math.round(card.errorRate * 100)}%`),
        row('Lines remaining', card.linesRemaining.toString()),
        tipRow(card.tip),
      )
      footer.hidden = false
      restart.hidden = true
      root.hidden = false
      kind = 'coach'
    },

    hide() {
      root.hidden = true
      kind = null
    },
  }
}
