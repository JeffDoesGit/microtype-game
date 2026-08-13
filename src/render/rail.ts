/**
 * The score rail (DESIGN.md §2, §5): Score, live WPM, goal WPM, line counter,
 * stacked down the right side of the court in a segmented-display treatment.
 */

export type RailReading = {
  score: number
  /** Shown beside the score only when above 1x (§5). */
  combo: number
  wpm: number
  goalWpm: number
  line: number
  lineCount: number
}

export type Rail = {
  render(reading: RailReading): void
}

/** The §2 mock shows a zero-padded readout; long scores simply outgrow it. */
function pad(value: number, width: number): string {
  return value.toString().padStart(width, '0')
}

export function createRail(
  score: HTMLElement,
  combo: HTMLElement,
  wpm: HTMLElement,
  goal: HTMLElement,
  line: HTMLElement,
): Rail {
  return {
    render(reading) {
      score.textContent = pad(reading.score, 4)
      combo.textContent = reading.combo > 1 ? `×${reading.combo}` : ''
      wpm.textContent = Math.round(reading.wpm).toString()
      goal.textContent = reading.goalWpm.toString()
      line.textContent = `${reading.line}/${reading.lineCount}`

      // Beating the goal is worth seeing while you type, not only at the end.
      wpm.classList.toggle('rail-value-hit', reading.wpm >= reading.goalWpm)
    },
  }
}
