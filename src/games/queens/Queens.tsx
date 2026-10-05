"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { SubmitButton } from "../SubmitButton";
import { defineGame, type GameProps } from "../types";
import { useSavedState } from "../useSavedState";

/**
 * data: { "size": N, "regions": number[N][N] } with region ids 0..N-1.
 * answer: number[N] where item r is the 0-based column of the queen in row r.
 */
export type QueensData = { size: number; regions: number[][] };

const EMPTY = 0;
const MARK = 1;
const QUEEN = 2;
type Board = number[][];

// Light region colours so the dark queen and × stay readable on every one
const REGION_COLORS = [
  "#f4a6a6", "#f7c58c", "#efe08a", "#b5e09a", "#8fd6c4", "#9cc6f2",
  "#b8acf2", "#e6aee9", "#d8c2a2", "#b9c4cc", "#f2b8cf", "#c8e6a0",
];

function isQueensData(data: unknown): data is QueensData {
  if (typeof data !== "object" || data === null) return false;
  const { size: n, regions } = data as QueensData;
  return (
    Number.isInteger(n) &&
    n >= 4 &&
    n <= REGION_COLORS.length &&
    Array.isArray(regions) &&
    regions.length === n &&
    regions.every(
      (row) => Array.isArray(row) && row.length === n && row.every((id) => Number.isInteger(id) && id >= 0 && id < n),
    )
  );
}

type Check = {
  /** Queens ("r,c") breaking any rule */
  badQueens: Set<string>;
  rowsOk: boolean;
  colsOk: boolean;
  regionsOk: boolean;
  touchOk: boolean;
  count: number;
};

function checkBoard(board: Board, regions: number[][]): Check {
  const queens: [number, number][] = [];
  board.forEach((row, r) => row.forEach((v, c) => v === QUEEN && queens.push([r, c])));

  const badQueens = new Set<string>();
  const result = { rowsOk: true, colsOk: true, regionsOk: true, touchOk: true };

  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const [ar, ac] = queens[i];
      const [br, bc] = queens[j];
      const broken = {
        rowsOk: ar === br,
        colsOk: ac === bc,
        regionsOk: regions[ar][ac] === regions[br][bc],
        touchOk: Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1,
      };
      for (const rule of Object.keys(broken) as (keyof typeof broken)[]) {
        if (!broken[rule]) continue;
        result[rule] = false;
        badQueens.add(`${ar},${ac}`);
        badQueens.add(`${br},${bc}`);
      }
    }
  }
  return { badQueens, ...result, count: queens.length };
}

function Queens({ puzzleId, data, onSubmit, submit }: GameProps<QueensData>) {
  const { size: n, regions } = data;
  const emptyBoard = () => Array.from({ length: n }, () => new Array<number>(n).fill(EMPTY));
  const [board, setBoard] = useSavedState<Board>(
    `queens:${puzzleId}`,
    emptyBoard,
    (saved): saved is Board =>
      Array.isArray(saved) &&
      saved.length === n &&
      saved.every((row) => Array.isArray(row) && row.length === n && row.every((v) => v === EMPTY || v === MARK || v === QUEEN)),
  );
  const [focus, setFocus] = useState<[number, number]>([0, 0]);

  const check = useMemo(() => checkBoard(board, regions), [board, regions]);
  const allGood = check.rowsOk && check.colsOk && check.regionsOk && check.touchOk;
  const solved = check.count === n && allGood;

  function cycle(r: number, c: number) {
    setBoard((b) => b.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? (v + 1) % 3 : v)) : row)));
  }

  function handleKeyDown(e: KeyboardEvent, r: number, c: number) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    const nr = (r + moves[e.key][0] + n) % n;
    const nc = (c + moves[e.key][1] + n) % n;
    setFocus([nr, nc]);
    document.getElementById(`queens-${nr}-${nc}`)?.focus();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!solved) return;
    onSubmit(board.map((row) => row.indexOf(QUEEN)));
  }

  function clearAll() {
    if (window.confirm("Clear the whole board?")) setBoard(emptyBoard());
  }

  // Thick dark line wherever the neighbouring cell is in another region
  const edge = (same: boolean) => (same ? "1px solid rgb(11 24 32 / 0.25)" : "3px solid #0b1820");

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-center text-sm text-muted">
        Place one queen in every row, column and colour region. Queens can&apos;t touch, not even diagonally. Tap a
        square once for ×, twice for a queen, three times to clear.
      </p>

      <div
        role="grid"
        aria-label={`Queens board, ${n} by ${n}. Use arrow keys to move and Enter to change a square.`}
        className="mx-auto grid aspect-square w-full max-w-md overflow-hidden rounded-lg border-[3px] border-sea"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {board.map((row, r) =>
          row.map((v, c) => {
            const region = regions[r][c];
            const bad = v === QUEEN && check.badQueens.has(`${r},${c}`);
            const label = v === QUEEN ? "queen" : v === MARK ? "marked" : "empty";
            return (
              <button
                key={`${r}-${c}`}
                id={`queens-${r}-${c}`}
                type="button"
                role="gridcell"
                tabIndex={focus[0] === r && focus[1] === c ? 0 : -1}
                aria-label={`Row ${r + 1}, column ${c + 1}, region ${region + 1}: ${label}${bad ? ", breaks a rule" : ""}`}
                onClick={() => {
                  setFocus([r, c]);
                  cycle(r, c);
                }}
                onKeyDown={(e) => handleKeyDown(e, r, c)}
                className={`relative flex items-center justify-center outline-none focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sea ${
                  bad ? "ring-4 ring-inset ring-red-600" : ""
                }`}
                style={{
                  backgroundColor: REGION_COLORS[region],
                  borderTop: r > 0 ? edge(regions[r - 1][c] === region) : undefined,
                  borderLeft: c > 0 ? edge(regions[r][c - 1] === region) : undefined,
                }}
              >
                {v === QUEEN && <Crown className={`h-3/5 w-3/5 ${bad ? "text-red-700" : "text-sea"}`} />}
                {v === MARK && (
                  <span aria-hidden="true" className="text-lg font-bold text-sea/60 sm:text-xl">
                    ×
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>

      <ul className="mx-auto grid w-full max-w-md grid-cols-2 gap-x-3 gap-y-1 text-sm" aria-live="polite">
        <Rule ok={check.rowsOk} text="One per row" />
        <Rule ok={check.colsOk} text="One per column" />
        <Rule ok={check.regionsOk} text="One per region" />
        <Rule ok={check.touchOk} text="No touching" />
      </ul>

      <div className="mx-auto flex w-full max-w-md items-center justify-between text-sm text-muted">
        <span>
          {check.count}/{n} queens
        </span>
        <button type="button" onClick={clearAll} className="nav-link">
          Clear
        </button>
      </div>

      <div className="mx-auto w-full max-w-md">
        <SubmitButton submit={submit} disabled={!solved} />
        {!solved && (
          <p className="mt-2 text-center text-xs text-muted">
            Place all {n} queens without breaking a rule to submit.
          </p>
        )}
      </div>
    </form>
  );
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={ok ? "text-muted" : "font-semibold text-danger"}>
      <span aria-hidden="true">{ok ? "✓" : "✖"}</span> {text}
      <span className="sr-only">{ok ? ": OK" : ": broken"}</span>
    </li>
  );
}

function Crown({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 18H5L3 8.5Z" />
      <rect x="5" y="19" width="14" height="2" rx="1" />
      <circle cx="3" cy="7.5" r="1.6" />
      <circle cx="12" cy="4" r="1.6" />
      <circle cx="21" cy="7.5" r="1.6" />
    </svg>
  );
}

export const queens = defineGame({ isData: isQueensData, Component: Queens });
