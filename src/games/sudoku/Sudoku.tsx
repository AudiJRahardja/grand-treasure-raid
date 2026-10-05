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

/** Pencil marks: one bitmask per cell, bit d set = note d. */
type Notes = number[][];
const emptyNotes = (): Notes => Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));
const isNotes = (v: unknown): v is Notes =>
  Array.isArray(v) &&
  v.length === SIZE &&
  v.every((row) => Array.isArray(row) && row.length === SIZE && row.every((m) => Number.isInteger(m) && m >= 0 && m < 1024));

const updateCell = (g: number[][], r: number, c: number, f: (old: number) => number) =>
  g.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? f(v) : v)) : row));

function Sudoku({ puzzleId, data, onSubmit, submit }: GameProps<SudokuData>) {
  const givens = data.grid;
  const [grid, setGrid] = useSavedState<Grid>(
    `sudoku:${puzzleId}`,
    () => givens.map((row) => [...row]),
    // Ignore saved progress that doesn't match this puzzle's givens
    (saved): saved is Grid =>
      isGrid(saved) && givens.every((row, r) => row.every((v, c) => v === 0 || saved[r][c] === v)),
  );
  // Notes are display-only: they are never part of the submitted answer
  const [notes, setNotes] = useSavedState<Notes>(`sudoku-notes:${puzzleId}`, emptyNotes, isNotes);
  const [notesMode, setNotesMode] = useState(false);
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

  /** Pad, keyboard and erase all come through here. d = 0 erases. */
  function input(d: number) {
    if (!selected) return;
    const [r, c] = selected;
    if (isGiven(r, c)) return;

    if (d === 0) {
      setGrid((g) => updateCell(g, r, c, () => 0));
      setNotes((n) => updateCell(n, r, c, () => 0));
    } else if (notesMode) {
      if (grid[r][c] === 0) setNotes((n) => updateCell(n, r, c, (m) => m ^ (1 << d)));
    } else {
      setGrid((g) => updateCell(g, r, c, () => d));
      // Placing a digit clears that note from its row, column and box
      setNotes((n) =>
        n.map((row, ri) => row.map((m, ci) => (ri === r || ci === c || boxOf(ri, ci) === boxOf(r, c) ? m & ~(1 << d) : m))),
      );
    }
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
      input(Number(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      input(0);
    } else if (e.key === "n" || e.key === "N") {
      setNotesMode((m) => !m);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (complete && conflicts.size === 0) onSubmit(grid);
  }

  function clearAll() {
    if (window.confirm("Clear all your numbers and notes? The givens stay.")) {
      setGrid(givens.map((row) => [...row]));
      setNotes(emptyNotes());
    }
  }

  // Roving tabindex: one Tab stop for the whole grid, arrows move inside it
  const [tabR, tabC] = selected ?? [0, 0];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div
        role="grid"
        aria-label="Sudoku grid. Use arrow keys to move, 1 to 9 to fill a cell, N to toggle notes."
        className="mx-auto grid aspect-square w-full max-w-md grid-cols-9 grid-rows-9 overflow-hidden rounded-lg border-2 border-gold/70 bg-sea"
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
            const cellNotes = value === 0 ? notes[r][c] : 0;
            const noteList = DIGITS.filter((d) => cellNotes & (1 << d));

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
                aria-label={`Row ${r + 1}, column ${c + 1}: ${value || "empty"}${given ? ", given" : ""}${conflict ? ", conflict" : ""}${noteList.length ? `, notes ${noteList.join(" ")}` : ""}`}
                onClick={() => select(r, c)}
                onKeyDown={(e) => handleKeyDown(e, r, c)}
                className={`relative min-h-0 min-w-0 overflow-hidden p-0 outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${bg} ${borders}`}
              >
                {/* Absolutely positioned so content can never change the cell's size */}
                {value !== 0 ? (
                  <span
                    aria-hidden="true"
                    className={`absolute inset-0 flex items-center justify-center text-xl leading-none tabular-nums sm:text-2xl ${text} ${given ? "font-bold" : "font-medium"}`}
                  >
                    {value}
                  </span>
                ) : (
                  cellNotes !== 0 && (
                    <span aria-hidden="true" className="absolute inset-0.5 grid grid-cols-3 grid-rows-3">
                      {DIGITS.map((d) => (
                        <span
                          key={d}
                          className="flex items-center justify-center text-[9px] leading-none text-muted sm:text-[11px]"
                        >
                          {cellNotes & (1 << d) ? d : ""}
                        </span>
                      ))}
                    </span>
                  )
                )}
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
            onClick={() => input(d)}
            disabled={!selected}
            aria-label={notesMode ? `Toggle note ${d}` : `Enter ${d}`}
            className={`btn btn-secondary min-h-12 px-0 tabular-nums sm:min-h-14 ${
              notesMode ? "border-gold/60 text-lg text-gold" : "text-2xl"
            } ${digitCounts[d] >= SIZE ? "opacity-40" : ""}`}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => input(0)}
          disabled={!selected}
          aria-label="Erase cell"
          className="btn btn-secondary min-h-12 px-0 text-xl sm:min-h-14"
        >
          ⌫
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2 text-sm text-muted">
        <span aria-live="polite" className="min-w-0">
          {conflicts.size > 0 ? <span className="text-danger">Numbers clash (in red)</span> : `${filled}/81 filled`}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setNotesMode((m) => !m)}
            aria-pressed={notesMode}
            className={`nav-link min-h-9 gap-1 ${notesMode ? "bg-gold/15 text-gold!" : ""}`}
          >
            <span aria-hidden="true">✎</span> Notes {notesMode ? "on" : "off"}
          </button>
          <button type="button" onClick={clearAll} className="nav-link min-h-9">
            Clear
          </button>
        </span>
      </div>

      <SubmitButton
        submit={submit}
        disabled={!complete || conflicts.size > 0}
        hint={complete ? "Fix the red clashes to submit." : "Fill every cell to submit."}
      />
    </form>
  );
}

export const sudoku = defineGame({ isData: isSudokuData, Component: Sudoku });
