/**
 * The drill strip: target line above, your line below, character-aligned
 * (DESIGN.md §2, §8). DOM rather than canvas, per §1.
 *
 * Cells are built once per line and only their classes change on each
 * keystroke, so nothing reflows mid-line — §8 is emphatic that a wrong
 * character must occupy exactly the same box as a right one.
 */

import type { LineState } from '../game/input.ts'

/** How long without a keystroke before the caret starts pulsing (§8). */
const IDLE_MS = 700

export type Strip = {
  render(state: LineState): void
  setHint(text: string): void
}

/** Spaces need a glyph box; the cells are fixed-width, so any filler works. */
function cellText(char: string | null): string {
  if (char === null) return ' '
  return char === ' ' ? ' ' : char
}

function buildRow(row: HTMLElement, count: number): HTMLSpanElement[] {
  row.replaceChildren()
  const cells: HTMLSpanElement[] = []
  for (let i = 0; i < count; i++) {
    const cell = document.createElement('span')
    cell.className = 'cell'
    row.append(cell)
    cells.push(cell)
  }
  return cells
}

export function createStrip(
  targetRow: HTMLElement,
  typedRow: HTMLElement,
  hintRow: HTMLElement,
): Strip {
  let cells: HTMLSpanElement[] = []
  let builtFor: string | null = null
  let idleTimer: number | undefined

  const markActive = (): void => {
    typedRow.classList.remove('idle')
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => typedRow.classList.add('idle'), IDLE_MS)
  }

  return {
    render(state: LineState): void {
      const target = state.chars.map((c) => c.target).join('')

      if (builtFor !== target) {
        const targetCells = buildRow(targetRow, state.chars.length)
        state.chars.forEach((char, i) => {
          targetCells[i]!.textContent = cellText(char.target)
        })
        // One cell past the end holds the caret once the line is fully typed.
        cells = buildRow(typedRow, state.chars.length + 1)
        builtFor = target
      }

      state.chars.forEach((char, i) => {
        const cell = cells[i]!
        cell.textContent = cellText(char.typed)
        cell.classList.toggle('ok', char.typed !== null && char.typed === char.target)
        cell.classList.toggle('bad', char.typed !== null && char.typed !== char.target)
        cell.classList.toggle('caret', i === state.cursor && !state.committed)
      })

      const tail = cells[state.chars.length]!
      tail.textContent = ' '
      tail.classList.toggle('caret', state.cursor >= state.chars.length && !state.committed)

      markActive()
    },

    setHint(text: string): void {
      hintRow.textContent = text
    },
  }
}
