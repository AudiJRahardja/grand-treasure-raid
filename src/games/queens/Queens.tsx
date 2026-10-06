"use client";

import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
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
type Cell = [number, number];

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
  const queens: Cell[] = [];
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

const setCell = (b: Board, r: number, c: number, v: number) =>
  b.map((row, ri) => (ri === r ? row.map((old, ci) => (ci === c ? v : old)) : row));

/** In-progress press on the board: a tap if it never leaves its square, otherwise a drag. */
type Drag = {
  pointerId: number;
  start: Cell;
  /** Drag from empty paints ×, from × erases ×, from a queen does nothing */
  mode: "mark" | "unmark" | null;
  moved: boolean;
  lastKey: string;
};

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
  const [focus, setFocus] = useState<Cell>([0, 0]);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const check = useMemo(() => checkBoard(board, regions), [board, regions]);
  const allGood = check.rowsOk && check.colsOk && check.regionsOk && check.touchOk;
  const solved = check.count === n && allGood;

  /** Tap: empty → × → queen → empty */
  function cycle([r, c]: Cell) {
    setBoard((b) => setCell(b, r, c, (b[r][c] + 1) % 3));
  }

  /** Drag paint: only ever touches × marks, never a queen */
  function paint([r, c]: Cell, mode: "mark" | "unmark") {
    setBoard((b) => {
      const v = b[r][c];
      if (mode === "mark" && v === EMPTY) return setCell(b, r, c, MARK);
      if (mode === "unmark" && v === MARK) return setCell(b, r, c, EMPTY);
      return b;
    });
  }

  function cellAt(x: number, y: number): Cell | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-queens-cell]");
    if (!el || !boardRef.current?.contains(el)) return null;
    return [Number(el.dataset.r), Number(el.dataset.c)];
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    // Keep receiving moves and the release even if the pointer leaves the board
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = board[cell[0]][cell[1]];
    drag.current = {
      pointerId: e.pointerId,
      start: cell,
      mode: v === EMPTY ? "mark" : v === MARK ? "unmark" : null,
      moved: false,
      lastKey: `${cell}`,
    };
    setFocus(cell);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell || `${cell}` === d.lastKey) return;
    d.lastKey = `${cell}`;
    if (!d.moved) {
      d.moved = true;
      if (d.mode) paint(d.start, d.mode);
    }
    if (d.mode) paint(cell, d.mode);
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) cycle(d.start);
  }

  function handleKeyDown(e: KeyboardEvent, r: number, c: number) {
    const moves: Record<string, Cell> = {
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
    // Only queens count; × marks are never sent
    onSubmit(board.map((row) => row.indexOf(QUEEN)));
  }

  function clearAll() {
    if (window.confirm("Clear the whole board?")) setBoard(emptyBoard());
  }

  // Thick dark line wherever the neighbouring cell is in another region
  const edge = (same: boolean) => (same ? "1px solid rgb(11 24 32 / 0.25)" : "3px solid #0b1820");
  const tracks = `repeat(${n}, minmax(0, 1fr))`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-center text-sm text-muted">
        One queen per row, column and colour. Queens can&apos;t touch, even diagonally. Tap: × → queen → clear.
        Drag to mark many ×.
      </p>

      <div
        ref={boardRef}
        role="grid"
        aria-label={`Queens board, ${n} by ${n}. Use arrow keys to move and Enter to change a square.`}
        className="mx-auto grid aspect-square w-full max-w-md touch-none overflow-hidden rounded-lg border-[3px] border-sea select-none"
        style={{ gridTemplateColumns: tracks, gridTemplateRows: tracks }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => (drag.current = null)}
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
                data-queens-cell=""
                data-r={r}
                data-c={c}
                tabIndex={focus[0] === r && focus[1] === c ? 0 : -1}
                aria-label={`Row ${r + 1}, column ${c + 1}, region ${region + 1}: ${label}${bad ? ", breaks a rule" : ""}`}
                // Pointer taps are handled on the board; this only handles Enter/Space (detail 0)
                onClick={(e) => e.detail === 0 && cycle([r, c])}
                onKeyDown={(e) => handleKeyDown(e, r, c)}
                className={`relative aspect-square min-h-0 min-w-0 overflow-hidden p-0 outline-none focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sea ${
                  bad ? "ring-4 ring-inset ring-red-600" : ""
                }`}
                style={{
                  backgroundColor: REGION_COLORS[region],
                  borderTop: r > 0 ? edge(regions[r - 1][c] === region) : undefined,
                  borderLeft: c > 0 ? edge(regions[r][c - 1] === region) : undefined,
                }}
              >
                {/* Absolutely positioned so content can never change the cell's size */}
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {v === QUEEN && <Crown className={`h-[60%] w-[60%] ${bad ? "text-red-700" : "text-sea"}`} />}
                  {v === MARK && <span className="text-lg leading-none font-bold text-sea/60">×</span>}
                </span>
              </button>
            );
          }),
        )}
      </div>

      <ul className="mx-auto grid w-full max-w-md grid-cols-2 gap-x-3 gap-y-0.5 text-sm" aria-live="polite">
        <Rule ok={check.rowsOk} text="One per row" />
        <Rule ok={check.colsOk} text="One per column" />
        <Rule ok={check.regionsOk} text="One per region" />
        <Rule ok={check.touchOk} text="No touching" />
      </ul>

      <div className="mx-auto flex w-full max-w-md items-center justify-between text-sm text-muted">
        <span>
          {check.count}/{n} queens
        </span>
        <button type="button" onClick={clearAll} className="nav-link min-h-9">
          Clear
        </button>
      </div>

      <SubmitButton
        submit={submit}
        disabled={!solved}
        hint={`Place all ${n} queens without breaking a rule to submit.`}
      />
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

export const queens = defineGame({
  isData: isQueensData,
  Component: Queens,
  guide: {
    goal: "Place exactly one queen in every row, every column and every colour region.",
    rules: [
      "No two queens may touch, not even diagonally.",
      "A queen that breaks a rule gets a red ring, and the checklist under the board shows which rule.",
    ],
    controls: [
      "Tap a square once for ×, twice for a queen, three times to clear it. × marks are only notes for you and are never submitted.",
      "Press and drag across squares to mark many × at once. Start on an empty square to add ×, or on an × to remove them. Dragging never touches a queen.",
      "Keyboard: arrow keys move, Enter or Space changes a square.",
    ],
  },
});
