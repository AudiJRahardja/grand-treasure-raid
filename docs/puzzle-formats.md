# Puzzle formats

Each puzzle row has a `type`. The site picks the game component for that type from
`src/games/registry.ts`.

- `puzzles.data` is what players see. Only `start_puzzle()` hands it out.
- `puzzle_solutions.solution` is the secret answer. It never leaves the database.
- When a player submits, the site sends an **answer** JSON to `submit_answer()`:
  - **riddle:** the answer matches if it equals any accepted string, ignoring case and extra spaces.
  - **every other type:** the answer must **exactly equal** the stored solution.

## Adding a new game type

1. Create `src/games/<type>/<Name>.tsx`. Export `defineGame({ isData, Component })`:
   - `isData(data)` checks the JSON shape at runtime.
   - `Component` receives `{ puzzleId, data, onSubmit, submit }` and calls `onSubmit(answerJson)`.
   - Use the shared `<SubmitButton submit={submit} />` so the cooldown display stays consistent.
   - Optional: `useSavedState("<type>:" + puzzleId, ...)` keeps in-progress work across reloads.
2. Add it to `GAMES` in `src/games/registry.ts`.
3. Document its `data`, answer and solution shapes in this file.
4. For grid puzzles, extend `scripts/check-puzzle.mjs` so authors can prove the solution is unique.
5. If the type isn't already allowed, add it to the `puzzles.type` check constraint.
   That's a database change, so do it in a new migration.

---

## riddle

| | Shape | Example |
|---|---|---|
| `data` | `{ "prompt": string }` | `{"prompt": "I speak without a mouth and hear without ears. What am I?"}` |
| answer (sent by the site) | JSON string (trimmed) | `"Echo"` |
| `solution` | array of accepted strings | `["echo", "an echo"]` |

The answer matches if it equals any accepted string after lower-casing, trimming and
collapsing runs of spaces. Line breaks (`\n`) in `prompt` are displayed.

## sudoku

| | Shape | Example |
|---|---|---|
| `data` | `{ "grid": number[9][9] }`. Rows top to bottom, `0` = empty cell. | `{"grid": [[5,3,0,0,7,0,0,0,0], …8 more rows]}` |
| answer (sent by the site) | the full grid: `number[9][9]`, digits 1–9 | `[[5,3,4,6,7,8,9,1,2], …]` |
| `solution` | the same shape as the answer | `[[5,3,4,6,7,8,9,1,2], …]` |

- The site sends the grid exactly as filled, including the givens.
- It only allows submitting when every cell is filled and nothing clashes.
- The puzzle **must have exactly one solution**. Check it with
  `npm run check-puzzle -- file.json`.

## queens

| | Shape | Example |
|---|---|---|
| `data` | `{ "size": N, "regions": number[N][N] }`. Region ids `0`..`N-1`, rows top to bottom. `N` from 4 to 12. | `{"size": 7, "regions": [[0,0,1,1,1,1,1], …6 more rows]}` |
| answer (sent by the site) | `number[N]`: item `r` is the **0-based column** of the queen in row `r` | `[0,4,1,3,5,2,6]` |
| `solution` | the same shape as the answer | `[0,4,1,3,5,2,6]` |

Rules: exactly one queen per row, column and region, and no two queens touching (including
diagonally). Every id from `0` to `N-1` must appear in `regions`. The puzzle **must have
exactly one solution**. Check it with `npm run check-puzzle -- file.json`.

## crossmath

| | Shape | Example |
|---|---|---|
| `data` | `{ "cells": Token[][], "pool": number[] }`. At most 8 rows and 8 columns. | see below |
| answer (sent by the site) | `number[]`: the value in each blank, in **reading order** (top row first, left to right) | `[8,3,5,2,9,1,6,4,7]` |
| `solution` | the same shape as the answer | `[8,3,5,2,9,1,6,4,7]` |

Each cell token is one of:

| Token | Meaning | Shown as |
|---|---|---|
| `null` | gap (no cell) | empty space |
| whole number, e.g. `12` | fixed number | parchment number |
| `"_"` | blank the player fills from the pool | outlined cell |
| `"+"` `"-"` `"*"` `"/"` | operator | + − × ÷ |
| `"="` | equals | = |

- **Equations:** every horizontal or vertical run of 2 or more adjacent cells is one equation,
  shaped `number op number op … = number`. A blank can stand anywhere a number can, including
  after the `=`.
- **Order of operations:** × and ÷ come before + and −, worked left to right within each
  level. Every division step must be exact (no fractions at any step). For example,
  `6 + 4 × 7 = 34`.
- **Pool:** the numbers for the blanks. These must be whole numbers 1 and up, with exactly
  as many as there are blanks. Each pool entry is used once. Duplicates like `[4, 4]` are fine,
  and the site tracks each chip separately.
- **Rejected by the checker:** a cell that belongs to no equation, a fixed `0` after `/`,
  or a grid larger than 8×8. (At 8 columns, cells stay about 40px wide on a 360px phone.)
- The rules live in one file, `src/games/crossmath/logic.mjs`. Both the site's live
  green/red equation check and the scripts below use it.

Example (`scripts/examples/crossmath.json`):

```json
{
  "cells": [
    ["_", "+", "_", "-", "_", "=", 6],
    ["-", null, "*", null, "+", null, null],
    ["_", "*", "_", "-", "_", "=", 17],
    ["+", null, "-", null, "*", null, null],
    ["_", "+", "_", "*", "_", "=", 34],
    ["=", null, "=", null, "=", null, null],
    [12, null, 23, null, 12, null, null]
  ],
  "pool": [1, 2, 3, 4, 5, 6, 7, 8, 9]
}
```

Solution: `[8, 3, 5, 2, 9, 1, 6, 4, 7]`.

**On the site**, the player taps a blank, then taps a number chip below the grid. Tapping a
chip that's already placed moves it to the selected blank (swapping), and ⌫ takes a number
back. A finished equation is outlined green if it's right and red if it's wrong. Submit
unlocks once every blank is filled and nothing is red.

### Making a crossmath puzzle: `npm run make-crossmath`

Writing result numbers by hand and then checking uniqueness is slow. Instead, describe the
**layout** and let the script pick the numbers:

```json
{
  "layout": [
    ["_", "+", "_", "-", "_", "=", "#"],
    ["-", null, "*", null, "+", null, null],
    ["_", "*", "_", "-", "_", "=", "#"],
    ["+", null, "-", null, "*", null, null],
    ["_", "+", "_", "*", "_", "=", "#"],
    ["=", null, "=", null, "=", null, null],
    ["#", null, "#", null, "#", null, null]
  ],
  "pool": [1, 2, 3, 4, 5, 6, 7, 8, 9],
  "tries": 5000,
  "seed": 7,
  "allowNegative": false,
  "maxResult": 999
}
```

| Field | Meaning |
|---|---|
| `layout` | Same tokens as `cells`, plus `"#"`: a result number for the script to compute. A `"#"` must be the number right after an `=` and belong to only one equation. Fixed numbers are allowed too. |
| `pool` | The numbers for the blanks (whole numbers 1 and up, one per blank). |
| `tries` | Optional. How many random fillings to try (default 5000). |
| `seed` | Optional. Repeats a previous run exactly. Each run prints its seed. |
| `allowNegative` | Optional. Allow negative result numbers (default `false`). |
| `maxResult` | Optional. Largest allowed result number (default 999). |

```bash
npm run -s make-crossmath -- scripts/examples/crossmath-layout.json > my-puzzle.json
```

The script places the pool in random orders. For each order, it computes every `"#"`, skips
fillings with inexact division or out-of-range results, and keeps the first finished puzzle
with **exactly one** solution. The puzzle JSON goes to stdout, in the same format
`check-puzzle` reads. The solution in reading order goes to the terminal. If nothing is found,
try more `tries`, a different pool, more × and ÷ (they pin numbers down), or turn a blank into
a fixed number.

### Tests

`npm test` runs `scripts/crossmath.test.mjs` against the shared rules. The tests check:

- The example filled correctly satisfies every equation.
- Swapping two numbers in the example breaks it.
- The example's solution is unique.
- Order of operations and exact division.
- Swappable placements count as two solutions, but equal numbers swapping does not.
- The validator rejects 0 or negatives in a pool, a fixed 0 divisor, and grids over 8×8.

---

## Checking uniqueness (dev only)

The server compares grid answers by exact equality. If a puzzle has two solutions, a player
who finds the "other" one is marked wrong. Before inserting a sudoku, queens or crossmath puzzle, save
it as JSON and run the checker:

```json
{ "type": "queens", "data": { "size": 7, "regions": [[...]] }, "solution": [0,4,1,3,5,2,6] }
```

```bash
npm run check-puzzle -- scripts/examples/queens.json
```

- `solution` is optional. If you include it, the checker confirms it is the unique solution.
- The checker prints the solution to paste into `puzzle_solutions.solution`.
- Exit code `0` means OK; `1` means a problem, with an explanation.
- `scripts/examples/` has one valid example of each type, plus `crossmath-layout.json` for `make-crossmath`.
- For crossmath, the search checks each equation as soon as its blanks are filled. A puzzle
  with about 15 blanks takes well under a second.
