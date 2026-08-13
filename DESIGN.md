# Hoops Type — Design Spec

A browser typing-drill game. You type a line of text; each word you finish cleanly launches a basketball that goes in. Each mistyped character launches one that bricks. Modeled on MicroType's basketball drill, rebuilt with modern art and a real stats layer.

**Handoff target:** Claude Code. This document is the source of truth — build to it, and flag anything ambiguous rather than guessing.

---

## 1. Technical decisions (settled)

| Decision | Choice | Why |
|---|---|---|
| Engine | None. Vanilla TS + Vite | The whole game is a text-diff loop plus parametric arcs. Godot's WASM payload would make the "just click a link" experience worse. |
| Rendering | Canvas 2D for the court + balls; DOM for UI, drill strip, modals | Text needs to be selectable-ish, accessible, and pixel-crisp. Balls need cheap per-frame animation. |
| Language | TypeScript, strict mode | The input state machine has enough edge cases to earn it. |
| Deps | Zero runtime deps | Keeps the bundle under ~50KB and the repo readable. |
| Hosting | GitHub Pages via GitHub Actions | `username.github.io/hoops-type`. Action runs `vite build`, deploys `dist/`. |
| Persistence | `localStorage` | No backend in v1. |

Set `base: '/hoops-type/'` in `vite.config.ts` or asset paths break on Pages. This is the single most common way this deploy fails.

**Platform:** desktop-first, physical keyboard required. On touch devices, show a full-screen card: "Hoops Type needs a physical keyboard. Open this on a laptop or desktop." Don't half-support mobile — a typing game with an on-screen keyboard is a worse product than an honest redirect.

---

## 2. Screen layout

Preserve the original's spatial arrangement. Fixed 16:10 stage, letterboxed, scaled to viewport.

```
┌────────────────────────────────────────────────┬──────────┐
│                                                │  SCORE   │
│                  COURT                         │   0036   │
│         (canvas — hoops, balls, arcs)          │          │
│                                                ├──────────┤
│   ◉      ◉      ◉      ◉      ◉      ◉         │   WPM    │
│  [or]  [for]  [fit;] [she] [the;] [jak]        │    38    │
│                                                ├──────────┤
│   ◉      ◉      ◉      ◉      ◉      ◉         │   GOAL   │
│ [she;]  [a]   [if]  [left]  [a] [salad]        │    41    │
│                                                ├──────────┤
│                    ▲ shooter                   │ LINE 2/4 │
├────────────────────────────────────────────────┴──────────┤
│ ▸ he or she; for a fit; if she left the; a jak salad      │
│   he ir she for a firtl if shelfert; a jak sala▏          │
└───────────────────────────────────────────────────────────┘
```

- **Court** — canvas. Hoops laid out in two rows, one hoop per word in the current line. Words label their hoop. Up to 12 hoops per line; if a line has more words, wrap to a third row and shrink.
- **Shooter** — fixed origin at bottom-center of the canvas. All balls launch from here.
- **Right rail** — Score, live WPM, goal WPM, line counter. Segmented-display treatment.
- **Drill strip** — the two-line panel. Target line on top, your line below it, character-aligned in monospace. This is the heart of the game; give it the most design attention.

---

## 3. Input model

The trickiest part. Get this exactly right.

### State

```ts
type CharState = {
  target: string;
  typed: string | null;
  everWrong: boolean;   // sticky — survives backspace
};

type LineState = {
  chars: CharState[];
  cursor: number;       // index of next char to type
  wordSpans: [number, number][];  // inclusive start, exclusive end
  wordResolved: boolean[];
};
```

### Rules

1. **Printable keypress** → compare to `chars[cursor].target`.
   - Match: set `typed`, `cursor++`.
   - Mismatch: set `typed` to what they pressed, set `everWrong = true`, **fire a miss shot immediately** at the hoop for the current word, `cursor++`.
2. **Backspace** → `cursor--`, clear `typed` at that index. `everWrong` persists. No shot fired, no shot un-fired.
3. **Cursor crosses a word boundary** (advances past the last index of a span, moving forward only) → resolve that word. If every char in the span has `everWrong === false`, **fire a make shot** at that word's hoop. Otherwise fire nothing — the misses already fired during the word. Set `wordResolved[i] = true` so backspacing back into it and re-crossing doesn't re-fire.
4. **Cursor reaches end of line** → resolve the final word, then require `Enter` to commit and advance. (Matches the original's "Strike Enter to continue.")
5. **Input past the end of the line is ignored.** No overflow characters.
6. **Space is a character like any other.** Typing space where a letter belongs is a miss.

### Word-to-hoop mapping

Word index N in the line → hoop N, laid out left-to-right, top row then bottom. The hoop for the current word gets a subtle highlight ring so the player's eye knows where the next ball is going.

---

## 4. Shot system

Not a physics sim. Parametric arcs, resolved at spawn time.

```ts
type Shot = {
  origin: Vec2;         // always the shooter
  hoop: Vec2;
  outcome: 'make' | 'miss';
  missKind?: 'rim' | 'backboard' | 'air';
  t0: number;
  duration: number;     // 380–520ms, scaled by distance
};
```

- **Make:** quadratic bezier from shooter through a control point above the hoop, terminating at the rim center. Ball passes through, net ripples (a 3-frame vertex wobble), ball fades below the rim.
- **Miss:** same arc but the endpoint is offset — `rim` overshoots the front edge and deflects down-forward, `backboard` hits high and drops short, `air` misses wide. Pick `missKind` deterministically from the error index so the same mistake looks the same.
- **Concurrency:** cap at 6 in-flight balls. Beyond that, drop the oldest. Fast typists will trigger a stream — that should feel like a barrage, not a slideshow.
- **Trails:** every shot leaves a thin arc trail that persists for the rest of the line. Makes are drawn in the accent color, misses in the error color and dashed.

### Signature element

Those persistent arc trails are the thing this game gets remembered for. By the end of a drill the court is laced with every shot you took — a shot chart of your typing. On the results screen, freeze that chart and show it as the primary visual instead of a bar graph. Clean lines mean a clean drill; a thicket of dashed red arcs tells the story better than an accuracy percentage does.

Keep everything else on the court quiet so this reads.

---

## 5. Scoring

- **WPM (gwam):** `(correctChars / 5) / elapsedMinutes`. Only chars with `everWrong === false` count. Timer starts on first keypress of the drill, not on screen load. Smooth the live display over a 3-second window so it doesn't jitter.
- **Accuracy:** `correctChars / totalChars` across the drill.
- **Score:** 100 per made basket. Combo multiplier: consecutive makes increase it by 0.5x per word, capped at 4x, reset to 1x on any miss. Displayed as a small `×2.5` next to the score when above 1x.
- **Goal WPM:** per-lesson, displayed in the rail. Non-blocking — the drill ends on line count regardless. Beating it awards a bonus and marks the lesson as passed.
- **Drill ends** after the lesson's fixed number of lines.

### Coach interjections

Port the original's modal, sparingly. If a single line ends above ~15% error rate, interrupt with a card: the error rate, one concrete tip, lines remaining, and "Strike Enter to continue." Cap at one interjection per drill so it stays a moment rather than a nag. Tips should name the actual failure — reference the specific keys that got missed, not generic posture advice.

---

## 6. Content layer

Three sources, one interface. Everything downstream consumes `DrillLine[]`.

```ts
interface DrillSource {
  id: string;
  title: string;
  goalWpm: number;
  getLines(): string[];
}
```

**Lessons** — hand-authored, `src/content/lessons.json`:

```json
{
  "id": "l04",
  "title": "Home row + E and I",
  "goalWpm": 41,
  "newKeys": ["e", "i"],
  "lines": [
    "he or she; for a fit; if she left the; a jak salad",
    "she said he did it; a fit is a fit; he is here"
  ]
}
```

Author ~15 lessons: home row → E/I → R/T → O/N → punctuation → capitals → numbers → mixed. Lines run 40–60 chars. Each lesson introduces at most two new keys and reuses everything prior.

**Random** — word bank filtered by an allowed character set per tier, assembled into lines of 45–55 chars at word boundaries. Weight toward words containing the tier's newest keys.

**Custom** — textarea, paste anything. Normalize whitespace, strip characters outside the supported set, chunk into ~50-char lines breaking only at spaces. Warn if the text contains characters that got stripped.

---

## 7. Persistence

```ts
type Save = {
  version: 1;
  lessons: Record<string, { bestWpm: number; bestAccuracy: number; passed: boolean; attempts: number }>;
  history: Array<{ ts: number; mode: 'lesson'|'random'|'custom'; sourceId: string; wpm: number; accuracy: number; errors: number; durationMs: number }>;
  keyErrors: Record<string, number>;   // per-character miss counts
  settings: { sound: boolean; reducedMotion: boolean };
};
```

Cap `history` at 200 entries, FIFO. Version the schema now so migrations are possible later.

`keyErrors` is the highest-value thing here — it powers a "your problem keys" panel on the stats screen and, later, a generated drill targeting the worst five. Track it from day one even if the UI comes later.

---

## 8. Visual direction

Same layout as the original, modern execution. The reference point is a gymnasium, not a 90s CD-ROM: hardwood, chalk lines, painted lane, one orange object.

**Palette**

| Token | Hex | Use |
|---|---|---|
| `--court-deep` | `#16324F` | Background field, behind and above the court |
| `--hardwood` | `#C9884B` | Court plane, warm and slightly desaturated |
| `--chalk` | `#F5F2EC` | Lane lines, hoop rims, primary text |
| `--ball` | `#F26B21` | The basketball. The only fully saturated element on screen. |
| `--net` | `#7FD4C1` | Correct characters, made-shot trails, combo indicator |
| `--brick` | `#E8433F` | Errors, missed-shot trails |

Reserve `--ball` for the ball itself. Nothing else on the court is that orange, so the eye tracks shots automatically.

**Type**

- Display (scoreboard numerals, headings): a wide grotesque — Archivo Expanded 700. Scoreboard energy without literal seven-segment kitsch.
- Body/UI: Space Grotesk.
- Drill strip: Martian Mono. It's wide, which is normally a drawback and here is the whole point — the two lines must align character-for-character, and wide glyphs make a wrong character obvious at a glance. IBM Plex Mono as fallback.

**Drill strip treatment** — the target line sits at 55% opacity in `--chalk`. Your line renders beneath it: correct chars in `--chalk` at full opacity, wrong chars in `--brick` with a 2px underline. The caret is a solid `--ball` block that pulses only when idle. Never shift layout between states — a wrong character must occupy exactly the same box as a right one, or the whole comparison breaks.

**Motion** — the arcs are the animation budget. No page transitions, no easing flourishes on the UI, no bouncing score numbers. The court is busy; everything around it stays still. Respect `prefers-reduced-motion` by drawing shots as an instant trail with no travel.

---

## 9. File structure

```
src/
  main.ts                 entry, stage scaling
  game/
    state.ts              state machine: menu | drill | coach | results
    input.ts              keystroke → CharState, the rules in §3
    scoring.ts            wpm, accuracy, combo
    shots.ts              shot queue, arc math, resolution
  render/
    court.ts              canvas: hoops, lane, trails
    ball.ts               single-shot draw
    strip.ts              DOM drill strip
    rail.ts               DOM score rail
  content/
    lessons.json
    wordbank.json
    sources.ts            the three DrillSource impls
  store/
    save.ts               localStorage read/write/migrate
  styles/
    tokens.css            the palette + type scale above
    layout.css
index.html
vite.config.ts
.github/workflows/deploy.yml
```

---

## 10. Build order

1. **Skeleton** — Vite + TS, stage scaling, GitHub Action deploying to Pages. Ship a blank court and confirm the URL works before writing game logic. Deploy problems are cheaper to find now.
2. **Input engine** — §3 in isolation, with unit tests. Backspace-then-retype, word resolution firing exactly once, boundary conditions at line start and end. No rendering yet.
3. **Drill strip** — wire input to the two-line display. At this point it's a playable typing test with no basketball.
4. **Court + shots** — hoops, layout, arcs, make/miss. Trails last.
5. **Scoring + rail** — WPM, combo, goal.
6. **Content** — lessons.json authored, then random and custom sources.
7. **Persistence + results screen** — save schema, the frozen shot chart, problem keys.
8. **Coach modal, sound, polish.**

Steps 2 and 3 produce something playable. Get there fast and test the feel before building the court — if the typing doesn't feel good, no amount of basketball fixes it.

---

## 11. Out of scope for v1

Online leaderboards, accounts, multiplayer, mobile, custom key remapping, non-QWERTY layouts, sound design beyond three sample effects (make, brick, line complete). Note them, don't build them.
