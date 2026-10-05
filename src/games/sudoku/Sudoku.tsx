"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { SubmitButton } from "../SubmitButton";
import { defineGame, type GameProps } from "../types";
import { useSavedState } from "../useSavedState";

/** data: { "grid": number[9][9] } with 0 = empty.   answer: the full 9x9 grid */
export type SudokuData = { grid: number[][] };
type Grid = number[][];

const SIZE = 9;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function isGrid(value: unknown): value is Grid {
  return (
    Array.isArray(value) &&
    value.length === SIZE &&
    value.every(
      (row) => Array.isArray(row) && row.length === SIZE && row.every((v) => Number.isInteger(v) && v >= 0 && v <= 9),
    )
  );
}

function isSudokuData(data: unknown): data is SudokuData {
  return typeof data === "object" && data !== null && isGrid((data as SudokuData).grid);
}

const boxOf = (r: number, c: number) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

/** Cells ("r,c") whose digit repeats in their row, column or box. */
function findConflicts(grid: Grid) {
  const bad = new Set<string>();
  const groups = new Map<string, [number, number][]>();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c];
      if (!v) continue;
      for (const key of [`r${r}:${v}`, `c${c}:${v}`, `b${boxOf(r, c)}:${v}`]) {
        const list = groups.get(key) ?? [];
        list.push([r, c]);
        groups.set(key, list);
      }
    }
  }
  for (const cells of groups.values()) {
    if (cells.length > 1) cells.forEach(([r, c]) => bad.add(`${r},${c}`));
  }
  return bad;
}

function Sudoku({ puzzleId, data, onSubmit, submit }: GameProps<SudokuData>) {
  const givens = data.grid;
  const [grid, setGrid] = useSavedState<Grid>(
    `sudoku:${puzzleId}`,
    () => givens.map((row) => [...row]),
    // Ignore saved progress that doesn't match this puzzle's givens
    (saved): saved is Grid =>
      isGrid(saved) && givens.every((row, r) => row.every((v, c) => v === 0 || saved[r][c] === v)),
  );
  const [selected, setSelected] = useState<[number, number] | null>(null);

  const conflicts = useMemo(() => findConflicts(grid), [grid]);
  const filled = grid.flat().filter(Boolean).length;
  const complete = filled === SIZE * SIZE;
  const digitCounts = useMemo(() => {
    const counts = new Array(10).fill(0);
    grid.flat().forEach((v) => counts[v]++);
    return counts;
  }, [grid]);

  const isGiven = (r: number, c: number) => givens[r][c] !== 0;
  const selectedValue = selected ? grid[selected[0]][selected[1]] : 0;

  function setCell(value: number) {
    if (!selected) return;
    const [r, c] = selected;
    if (isGiven(r, c)) return;
    setGrid((g) => g.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? value : v)) : row)));
  }

  function select(r: number, c: number, focus = false) {
    setSelected([r, c]);
    if (focus) document.getElementById(`sudoku-${r}-${c}`)?.focus();
  }

  function handleKeyDown(e: KeyboardEvent, r: number, c: number) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dr, dc] = moves[e.key];
      select((r + dr + SIZE) % SIZE, (c + dc + SIZE) % SIZE, true);
    } else if (/^[1-9]$/.test(e.key)) {
      setCell(Number(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      setCell(0);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (complete && conflicts.size === 0) onSubmit(grid);
  }

  function clearAll() {
    if (window.confirm("Clear all your numbers? The givens stay.")) {
      setGrid(givens.map((row) => [...row]));
    }
  }

  // Roving tabindex: one Tab stop for the whole grid, arrows move inside it
  const [tabR, tabC] = selected ?? [0, 0];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div
        role="grid"
        aria-label="Sudoku grid. Use arrow keys to move and 1 to 9 to fill a cell."
        className="mx-auto grid aspect-square w-full max-w-md grid-cols-9 overflow-hidden rounded-lg border-2 border-gold/70 bg-sea"
      >
        {grid.map((row, r) =>
          row.map((value, c) => {
            const given = isGiven(r, c);
            const isSelected = selected?.[0] === r && selected?.[1] === c;
            const related =
              selected !== null &&
              (selected[0] === r || selected[1] === c || boxOf(selected[0], selected[1]) === boxOf(r, c));
            const sameDigit = value !== 0 && value === selectedValue;
            const conflict = conflicts.has(`${r},${c}`);

            const bg = isSelected
              ? "bg-gold/35"
              : conflict
                ? "bg-danger/25"
                : sameDigit
                  ? "bg-gold/20"
                  : related
                    ? "bg-deck-raised"
                    : "bg-deck";
            const text = conflict ? "text-danger" : given ? "text-parchment" : "text-gold-strong";
            const borders = [
              c % 3 === 2 && c < SIZE - 1 ? "border-r-2 border-r-gold/60" : c < SIZE - 1 ? "border-r border-r-rope" : "",
              r % 3 === 2 && r < SIZE - 1 ? "border-b-2 border-b-gold/60" : r < SIZE - 1 ? "border-b border-b-rope" : "",
            ].join(" ");

            return (
              <button
                key={`${r}-${c}`}
                id={`sudoku-${r}-${c}`}
                type="button"
                role="gridcell"
                tabIndex={r === tabR && c === tabC ? 0 : -1}
                aria-selected={isSelected}
                aria-label={`Row ${r + 1}, column ${c + 1}: ${value || "empty"}${given ? ", given" : ""}${conflict ? ", conflict" : ""}`}
                onClick={() => select(r, c)}
                onKeyDown={(e) => handleKeyDown(e, r, c)}
                className={`flex items-center justify-center text-xl tabular-nums outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold sm:text-2xl ${bg} ${text} ${borders} ${given ? "font-bold" : "font-medium"}`}
              >
                {value || ""}
              </button>
            );
          }),
        )}
      </div>

      <div className="mx-auto grid w-full max-w-md grid-cols-5 gap-2" aria-label="Number pad">
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setCell(d)}
            disabled={!selected}
            aria-label={`Enter ${d}`}
            className={`btn btn-secondary min-h-14 px-0 text-2xl tabular-nums ${digitCounts[d] >= SIZE ? "opacity-40" : ""}`}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCell(0)}
          disabled={!selected}
          aria-label="Erase cell"
          className="btn btn-secondary min-h-14 px-0 text-xl"
        >
          ⌫
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-md items-center justify-between text-sm text-muted">
        <span aria-live="polite">
          {conflicts.size > 0 ? (
            <span className="text-danger">Some numbers clash (shown in red)</span>
          ) : (
            `${filled}/81 filled`
          )}
        </span>
        <button type="button" onClick={clearAll} className="nav-link">
          Clear
        </button>
      </div>

      <div className="mx-auto w-full max-w-md">
        <SubmitButton submit={submit} disabled={!complete || conflicts.size > 0} />
        {!complete && <p className="mt-2 text-center text-xs text-muted">Fill every cell to submit.</p>}
      </div>
    </form>
  );
}

export const sudoku = defineGame({ isData: isSudokuData, Component: Sudoku });
