/**
 * The results card (DESIGN.md §7): a modal over the court showing the round's
 * numbers, dismissed with Enter.
 *
 * Deliberately the same shape as the coach interjection in §5 — a heading, a
 * short body, and "Strike Enter to continue." — so one component serves both
 * when the coach modal lands.
 */

import type { DrillStats } from '../game/scoring.ts'

export type Modal = {
  showResults(stats: DrillStats): void
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

    showResults(stats) {
      title.textContent = 'Drill complete'
      body.replaceChildren(
        row('Gwam', Math.round(stats.wpm).toString()),
        row('Accuracy', `${Math.round(stats.accuracy * 100)}%`),
        row('Score', stats.score.toString()),
        row('Baskets', `${stats.makes} made / ${stats.misses} missed`),
        row('Time', `${(stats.elapsedMs / 1000).toFixed(1)}s`),
      )
      root.hidden = false
      open = true
    },

    hide() {
      root.hidden = true
      open = false
    },
  }
}
