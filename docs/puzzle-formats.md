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

Coming later.

---

## Checking uniqueness (dev only)

The server compares grid answers by exact equality. If a puzzle has two solutions, a player
who finds the "other" one is marked wrong. Before inserting a sudoku or queens puzzle, save
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
- `scripts/examples/` has one valid example of each type.
