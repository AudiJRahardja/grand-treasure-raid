"use client";

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { SubmitButton } from "../SubmitButton";
import { defineGame, type GameProps } from "../types";
import { useSavedState } from "../useSavedState";
import { CROSSMATH_INSTRUCTIONS } from "./instructions";
import { equationHolds, parseCrossmath, validateCrossmath, type CrossmathData, type Token } from "./logic.mjs";

/**
 * data: { "cells": Token[][], "pool": number[] } (see logic.mjs and docs/puzzle-formats.md)
 * answer: number[], the value in each blank in reading order
 */
const isCrossmathData = (data: unknown): data is CrossmathData => validateCrossmath(data) === null;

const SYMBOL: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷", "=": "=" };
const SPOKEN: Record<string, string> = { "+": "plus", "-": "minus", "*": "times", "/": "divided by", "=": "equals" };

/** Fixed font size per digit count, so a long number can never resize its cell */
const numberSize = (v: number) => {
  const len = String(v).length;
  return len <= 2 ? "text-lg sm:text-xl" : len === 3 ? "text-base" : "text-xs";
};

/** Pointer travel (px) before a press becomes a drag; shorter presses are taps */
const DRAG_THRESHOLD = 6;
/** On touch, the dragged copy floats this far above the finger so it stays visible */
const TOUCH_LIFT = 56;
/** At most this many chips per tray row; rows are balanced (9 → 5 + 4) */
const TRAY_ROW_MAX = 5;

/** Which pool chip (by position, so duplicates work) sits in each blank. */
type Placement = (number | null)[];

type Drag = {
  pointerId: number;
  /** Pool position of the number being dragged */
  chip: number;
  /** Where the press started: a tray chip, or a filled blank */
  from: "tray" | "blank";
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** True once the pointer has moved past DRAG_THRESHOLD */
  active: boolean;
  touch: boolean;
  /** Blank under the pointer, highlighted as the drop target */
  hover: number | null;
};

/** Elements you can drag: no page scroll, no text selection, no long-press menu */
const DRAGGABLE = "touch-none select-none [-webkit-touch-callout:none]";
const blockMenu = (e: MouseEvent) => e.preventDefault();

function Crossmath({ puzzleId, data, onSubmit, submit }: GameProps<CrossmathData>) {
  const { cells, pool } = data;
  const rows = cells.length;
  const cols = cells[0].length;
  const { blanks, equations } = useMemo(() => parseCrossmath(cells), [cells]);
  const n = blanks.length;
  const blankAt = useMemo(() => new Map(blanks.map(([r, c], i) => [`${r},${c}`, i])), [blanks]);

  const [placement, setPlacement] = useSavedState<Placement>(
    `crossmath:${puzzleId}`,
    () => new Array<number | null>(n).fill(null),
    (saved): saved is Placement => {
      if (!Array.isArray(saved) || saved.length !== n) return false;
      const used = saved.filter((v) => v !== null);
      return (
        used.every((v) => Number.isInteger(v) && v >= 0 && v < pool.length) && new Set(used).size === used.length
      );
    },
  );
  const [selected, setSelected] = useState<number | null>(0);
  const [announcement, setAnnouncement] = useState("");
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  const values = placement.map((chip) => (chip === null ? null : pool[chip]));
  const chipOwner = new Map(placement.flatMap((chip, blank) => (chip === null ? [] : [[chip, blank] as const])));
  const filled = values.filter((v) => v !== null).length;
  const where = (b: number) => `row ${blanks[b][0] + 1}, column ${blanks[b][1] + 1}`;

  // Live check: an equation is judged once all its blanks are filled
  const status = new Map<string, "good" | "bad">();
  let anyBad = false;
  for (const eq of equations) {
    if (!eq.blanks.every((b) => values[b] !== null)) continue;
    const ok = equationHolds(eq.tokens, values);
    if (!ok) anyBad = true;
    for (const [r, c] of eq.cells) {
      const key = `${r},${c}`;
      if (!ok) status.set(key, "bad");
      else if (status.get(key) !== "bad") status.set(key, "good");
    }
  }
  const complete = filled === n;

  function nextEmpty(after: number, p: Placement) {
    for (let k = 1; k <= n; k++) {
      const b = (after + k) % n;
      if (p[b] === null) return b;
    }
    return after;
  }

  /**
   * Put `chip` into blank `target`. If the chip was in another blank, the two
   * blanks swap; if it came from the tray, a number already in `target` goes
   * back to the tray.
   */
  function putChip(chip: number, target: number) {
    const owner = chipOwner.get(chip);
    if (owner === target) return;
    const next = [...placement];
    const displaced = next[target];
    if (owner !== undefined) next[owner] = displaced;
    next[target] = chip;
    setPlacement(next);

    const v = pool[chip];
    if (owner !== undefined && displaced !== null) {
      setAnnouncement(`Swapped ${v} and ${pool[displaced]}: ${v} is now in ${where(target)}`);
    } else if (owner !== undefined) {
      setAnnouncement(`Moved ${v} to ${where(target)}`);
    } else {
      setAnnouncement(
        `Placed ${v} in ${where(target)}${displaced !== null ? `, ${pool[displaced]} went back to the numbers` : ""}`,
      );
    }
    return { next, fromTray: owner === undefined };
  }

  function returnToTray(blank: number) {
    const chip = placement[blank];
    if (chip === null) return;
    setPlacement((p) => p.map((v, b) => (b === blank ? null : v)));
    setAnnouncement(`Returned ${pool[chip]} to the numbers`);
  }

  /** Tap (or Enter) on a chip: same behaviour as before drag-and-drop existed */
  function tapChip(chip: number) {
    if (selected === null) return;
    if (chipOwner.get(chip) === selected) {
      returnToTray(selected); // tapping the chip that's already here takes it back
      return;
    }
    const result = putChip(chip, selected);
    if (result?.fromTray) setSelected(nextEmpty(selected, result.next));
  }

  // ---------------------------------------------------------------- drag and drop

  /** What's under the pointer: a blank, somewhere else on the grid, or off the grid */
  function dropTarget(x: number, y: number): { blank: number | null; onGrid: boolean } {
    const el = document.elementFromPoint(x, y);
    const grid = gridRef.current;
    if (!el || !grid || !grid.contains(el)) return { blank: null, onGrid: false };
    const blankEl = el.closest<HTMLElement>("[data-cm-blank]");
    return { blank: blankEl ? Number(blankEl.dataset.cmBlank) : null, onGrid: true };
  }

  function handlePointerDown(e: PointerEvent<HTMLElement>, chip: number, from: Drag["from"]) {
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    // Keep getting move/up events even when the pointer leaves the element or the window
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      chip,
      from,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      touch: e.pointerType !== "mouse",
      hover: null,
    });
  }

  function handlePointerMove(e: PointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const active = d.active || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) >= DRAG_THRESHOLD;
    if (!active) return;
    setDrag({ ...d, active, x: e.clientX, y: e.clientY, hover: dropTarget(e.clientX, e.clientY).blank });
  }

  function handlePointerUp(e: PointerEvent<HTMLElement>, blank?: number) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setDrag(null);

    if (!d.active) {
      // A plain tap: chips place into the selected blank, blanks get selected
      if (d.from === "tray") tapChip(d.chip);
      else if (blank !== undefined) setSelected(blank);
      return;
    }

    const target = dropTarget(e.clientX, e.clientY);
    if (target.blank !== null) {
      putChip(d.chip, target.blank);
      setSelected(target.blank);
    } else if (!target.onGrid) {
      // Off the grid (tray, page or outside the window): a placed number goes back to the tray
      const owner = chipOwner.get(d.chip);
      if (owner !== undefined) returnToTray(owner);
    }
    // On the grid but not on a blank: cancel, nothing moves
  }

  /** pointercancel, or capture lost without a pointerup: nothing moves */
  function handlePointerCancel(e: PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === e.pointerId) setDrag(null);
  }

  const dragHandlers = (chip: number, from: Drag["from"], blank?: number) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => handlePointerDown(e, chip, from),
    onPointerMove: handlePointerMove,
    onPointerUp: (e: PointerEvent<HTMLElement>) => handlePointerUp(e, blank),
    onPointerCancel: handlePointerCancel,
    onLostPointerCapture: handlePointerCancel,
    onContextMenu: blockMenu,
  });

  // ---------------------------------------------------------------- keyboard and buttons

  function erase() {
    if (selected !== null) returnToTray(selected);
  }

  function focusBlank(b: number) {
    setSelected(b);
    document.getElementById(`crossmath-${b}`)?.focus();
  }

  function handleKeyDown(e: KeyboardEvent, b: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusBlank((b + 1) % n);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusBlank((b - 1 + n) % n);
    } else if (e.key === "Backspace" || e.key === "Delete") {
      erase();
    } else if (/^[1-9]$/.test(e.key)) {
      // Place the first free chip with that value
      const chip = pool.findIndex((v, i) => v === Number(e.key) && !chipOwner.has(i));
      if (chip !== -1) tapChip(chip);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (complete && !anyBad) onSubmit(values as number[]);
  }

  function clearAll() {
    if (window.confirm("Take all numbers off the board?")) {
      setPlacement(new Array<number | null>(n).fill(null));
      setSelected(0);
      setAnnouncement("All numbers returned");
    }
  }

  const ring = (key: string) =>
    status.get(key) === "bad"
      ? "ring-2 ring-inset ring-danger bg-danger/15"
      : status.get(key) === "good"
        ? "ring-2 ring-inset ring-success/80"
        : "";

  // Balanced tray rows: 9 chips → 5 + 4, 6 → 3 + 3
  const trayRows = Math.ceil(pool.length / TRAY_ROW_MAX);
  const perRow = Math.ceil(pool.length / trayRows);
  const tray = Array.from({ length: trayRows }, (_, i) =>
    pool.map((_, chip) => chip).slice(i * perRow, (i + 1) * perRow),
  );
  const dragging = drag?.active ? drag : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-center text-sm text-muted">{CROSSMATH_INSTRUCTIONS}</p>

      <div
        ref={gridRef}
        role="grid"
        aria-label={`Crossmath, ${rows} rows by ${cols} columns. Arrow keys move between blanks, 1 to 9 place a number.`}
        className="mx-auto grid w-full gap-px"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          aspectRatio: `${cols} / ${rows}`,
          maxWidth: `${cols * 3.5}rem`,
        }}
      >
        {cells.map((row, r) =>
          row.map((t: Token, c) => {
            const key = `${r},${c}`;
            const base = "relative min-h-0 min-w-0 overflow-hidden rounded-md";
            if (t === null) return <div key={key} aria-hidden="true" />;

            if (t === "_") {
              const b = blankAt.get(key)!;
              const chip = placement[b];
              const v = values[b];
              const isSelected = selected === b;
              const isHover = dragging?.hover === b;
              const isSource = dragging !== null && chip === dragging.chip;
              return (
                <button
                  key={key}
                  id={`crossmath-${b}`}
                  data-cm-blank={b}
                  type="button"
                  role="gridcell"
                  tabIndex={b === (selected ?? 0) ? 0 : -1}
                  aria-selected={isSelected}
                  aria-label={`Blank ${b + 1} of ${n}, ${where(b)}: ${v ?? "empty"}${status.get(key) === "bad" ? ", equation wrong" : ""}`}
                  // Empty blanks: any click selects. Filled blanks: pointer taps are
                  // handled by the drag code, so only keyboard clicks (detail 0) count here.
                  onClick={(e) => (chip === null || e.detail === 0) && setSelected(b)}
                  onKeyDown={(e) => handleKeyDown(e, b)}
                  {...(chip !== null ? dragHandlers(chip, "blank", b) : {})}
                  className={`${base} border-2 p-0 outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                    chip !== null ? DRAGGABLE : ""
                  } ${
                    isHover
                      ? "border-gold-strong bg-gold/35 ring-4 ring-inset ring-gold/60"
                      : isSelected
                        ? "border-gold bg-gold/25"
                        : v === null
                          ? "border-dashed border-rope bg-sea"
                          : "border-gold/50 bg-deck"
                  } ${isHover ? "" : ring(key)}`}
                >
                  {v !== null && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 flex items-center justify-center font-semibold leading-none tabular-nums text-gold-strong ${numberSize(v)} ${isSource ? "opacity-30" : ""}`}
                    >
                      {v}
                    </span>
                  )}
                </button>
              );
            }

            // Fixed numbers and symbols: flat parchment text, nothing button-like
            const isNumber = typeof t === "number";
            return (
              <div
                key={key}
                role="gridcell"
                aria-label={isNumber ? String(t) : SPOKEN[t]}
                className={`${base} ${ring(key)}`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-0 flex items-center justify-center leading-none tabular-nums ${
                    isNumber ? `font-bold text-parchment ${numberSize(t)}` : "text-xl text-muted"
                  }`}
                >
                  {isNumber ? t : SYMBOL[t]}
                </span>
              </div>
            );
          }),
        )}
      </div>

      <section aria-label="Numbers to place" className="mx-auto mt-1 w-full max-w-md border-t border-rope/70 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Numbers</span>
          <button
            type="button"
            onClick={erase}
            disabled={selected === null || values[selected] === null}
            aria-label="Take the number out of the selected blank"
            className="nav-link min-h-9 gap-1"
          >
            <span aria-hidden="true">⌫</span> Remove
          </button>
        </div>
        <div className="flex flex-col items-center gap-2">
          {tray.map((chips, i) => (
            <div key={i} className="flex justify-center gap-2">
              {chips.map((chip) => {
                const v = pool[chip];
                const used = chipOwner.has(chip);
                const isSource = dragging?.from === "tray" && dragging.chip === chip;
                return (
                  <button
                    key={chip}
                    type="button"
                    // Pointer taps go through the drag code; this handles Enter/Space (detail 0)
                    onClick={(e) => e.detail === 0 && tapChip(chip)}
                    {...dragHandlers(chip, "tray")}
                    aria-label={used ? `${v}, placed (press to move it to the selected blank)` : `Place ${v}`}
                    className={`flex h-12 min-w-12 items-center justify-center rounded-xl border border-gold/40 bg-deck-raised px-2 text-xl font-semibold tabular-nums text-gold-strong shadow-md shadow-black/30 outline-none focus-visible:ring-2 focus-visible:ring-gold ${DRAGGABLE} ${
                      isSource ? "opacity-40" : used ? "opacity-35" : ""
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-md items-center justify-between text-sm text-muted">
        <span>
          {anyBad ? <span className="text-danger">Some equations don&apos;t work (in red)</span> : `${filled}/${n} placed`}
        </span>
        <button type="button" onClick={clearAll} className="nav-link min-h-9">
          Clear
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* The number following the pointer; fixed-position, so nothing else moves */}
      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 z-50 flex h-12 min-w-12 items-center justify-center rounded-xl border-2 border-gold bg-deck-raised px-2 text-xl font-semibold tabular-nums text-gold-strong shadow-xl shadow-black/50"
          style={{
            transform: `translate(${dragging.x - 24}px, ${dragging.y - 24 - (dragging.touch ? TOUCH_LIFT : 0)}px)`,
          }}
        >
          {pool[dragging.chip]}
        </div>
      )}

      <SubmitButton
        submit={submit}
        disabled={!complete || anyBad}
        hint={complete ? "Fix the red equations to submit." : "Place every number to submit."}
      />
    </form>
  );
}

export const crossmath = defineGame({
  isData: isCrossmathData,
  Component: Crossmath,
  guide: {
    goal: "Use each number once so every row and column equation is true.",
    rules: [
      "× and ÷ come before + and −, worked left to right.",
      "Every division must come out exact, with no fractions at any step.",
      "A finished equation turns green when it's right and red when it's wrong.",
    ],
    controls: [
      "Tap a blank, then tap a number below the grid, or drag a number onto a blank.",
      "Drop a number on a filled blank to swap. Drag a placed number to another blank to move it, or off the grid to put it back.",
      "Keyboard: arrow keys move between blanks. Tab to a number and press Enter to place it.",
    ],
  },
});
