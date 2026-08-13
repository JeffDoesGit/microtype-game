/**
 * The results card (DESIGN.md §7): a modal over the court showing the round's
 * numbers, dismissed with Enter.
 *
 * Deliberately the same shape as the coach interjection in §5 — a heading, a
 * short body, and "Strike Enter to continue." — so one component serves both
 * when the coach modal lands.
 */

import type { DrillStats } from '../game/scoring.ts'
import { problemKeys } from '../store/save.ts'

export type ResultsExtras = {
  /** Best gwam stored for this lesson, after this attempt is folded in. */
  bestWpm: number
  goalWpm: number
}

export type Modal = {
  showResults(stats: DrillStats, extras: ResultsExtras): void
  hide(): void
  readonly isOpen: boolean
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

export function createModal(root: HTMLElement, title: HTMLElement, body: HTMLElement): Modal {
  let open = false

  return {
    get isOpen() {
      return open
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
      root.hidden = false
      open = true
    },

    hide() {
      root.hidden = true
      open = false
    },
  }
}
