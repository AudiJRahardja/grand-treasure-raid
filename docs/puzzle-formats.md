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
   - `Component` receives `{ data, onSubmit, submit }` and calls `onSubmit(answerJson)`.
   - Use the shared `<SubmitButton submit={submit} />` so the cooldown display stays consistent.
2. Add it to `GAMES` in `src/games/registry.ts`.
3. Document its `data`, answer and solution shapes in this file.
4. If the type isn't already allowed, add it to the `puzzles.type` check constraint.
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

## sudoku, queens, crossmath

These arrive in milestone 4.
